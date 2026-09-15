"""Planner: brief + shot list -> Edit Decision List.

Two planners share one compiler:

* the **deterministic planner** fits the style pack's arc to the brief's
  duration on a musical grid, then assigns the best-matching shot to every
  beat. It needs no network and always produces a valid EDL.
* the **verbalized planner** (optional) asks an LLM for *k* distinct shot
  assignments with elicited probabilities via :func:`verbalized_sampling.verbalize`,
  then feeds each one through the same compiler. The model proposes selection
  and ordering; timing, transitions and validation stay deterministic, so a
  hallucinated answer degrades to a worse cut, never to a broken render.

The EDL is the contract with the renderer and the only thing a human needs to
edit by hand to take over from the machine.
"""

from __future__ import annotations

import json
import os
import random
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from .brief import Brief
from .ingest import Shot, ShotList
from .style import ASPECTS, Beat, StylePack

MIN_CLIP = 0.25  # seconds; below this a cut reads as a glitch, not an edit


# ---------------------------------------------------------------------------
# EDL model
# ---------------------------------------------------------------------------
@dataclass
class Clip:
    id: str
    source: str
    src_in: float
    src_out: float
    role: str
    beat: str
    motion: str = "static"
    speed: float = 1.0
    transition: str = "cut"
    transition_frames: int = 0
    crop: str = "center"

    @property
    def duration(self) -> float:
        """Timeline duration after the speed ramp."""
        return (self.src_out - self.src_in) / max(0.01, self.speed)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["duration"] = round(self.duration, 3)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Clip":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class Title:
    text: str
    start: float
    duration: float
    kind: str = "tagline"   # tagline | product | endcard
    position: str = "lower"  # lower | center | upper

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Title":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class EDL:
    """A complete, renderable edit decision list."""

    project: str
    style: str
    fps: int
    aspect: str
    width: int
    height: int
    bpm: float
    grade_intensity: float
    clips: List[Clip] = field(default_factory=list)
    titles: List[Title] = field(default_factory=list)
    audio: Dict[str, object] = field(default_factory=dict)
    meta: Dict[str, object] = field(default_factory=dict)

    # -- timeline ----------------------------------------------------------
    @property
    def duration(self) -> float:
        """Programme duration, accounting for dissolve overlaps."""
        total = sum(c.duration for c in self.clips)
        overlap = sum(
            c.transition_frames / self.fps
            for c in self.clips[1:]
            if c.transition == "dissolve"
        )
        return max(0.0, total - overlap)

    def timeline(self) -> List[Tuple[float, float, Clip]]:
        """(start, end, clip) on the assembled timeline."""
        out: List[Tuple[float, float, Clip]] = []
        cursor = 0.0
        for i, clip in enumerate(self.clips):
            if i and clip.transition == "dissolve":
                cursor -= clip.transition_frames / self.fps
            out.append((cursor, cursor + clip.duration, clip))
            cursor += clip.duration
        return out

    # -- io ----------------------------------------------------------------
    def to_dict(self) -> dict:
        return {
            "schema": "autocut.edl/1",
            "project": self.project,
            "style": self.style,
            "fps": self.fps,
            "aspect": self.aspect,
            "width": self.width,
            "height": self.height,
            "bpm": self.bpm,
            "grade_intensity": self.grade_intensity,
            "duration": round(self.duration, 3),
            "clips": [c.to_dict() for c in self.clips],
            "titles": [t.to_dict() for t in self.titles],
            "audio": self.audio,
            "meta": self.meta,
        }

    def save(self, path: str) -> str:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(self.to_dict(), fh, indent=2)
        return path

    @classmethod
    def load(cls, path: str) -> "EDL":
        with open(path, encoding="utf-8") as fh:
            d = json.load(fh)
        return cls(
            project=d.get("project", "untitled"),
            style=d.get("style", "editorial_luxury"),
            fps=int(d.get("fps", 30)),
            aspect=d.get("aspect", "9:16"),
            width=int(d["width"]),
            height=int(d["height"]),
            bpm=float(d.get("bpm", 96)),
            grade_intensity=float(d.get("grade_intensity", 1.0)),
            clips=[Clip.from_dict(c) for c in d.get("clips", [])],
            titles=[Title.from_dict(t) for t in d.get("titles", [])],
            audio=d.get("audio", {}),
            meta=d.get("meta", {}),
        )

    def retarget(self, aspect: str) -> "EDL":
        """Same cut, new canvas — one EDL fans out to every deliverable."""
        if aspect not in ASPECTS:
            raise ValueError(f"unknown aspect {aspect}; known: {', '.join(ASPECTS)}")
        w, h = ASPECTS[aspect]
        return EDL(
            project=self.project,
            style=self.style,
            fps=self.fps,
            aspect=aspect,
            width=w,
            height=h,
            bpm=self.bpm,
            grade_intensity=self.grade_intensity,
            clips=[Clip.from_dict(c.to_dict()) for c in self.clips],
            titles=[Title.from_dict(t.to_dict()) for t in self.titles],
            audio=dict(self.audio),
            meta={**self.meta, "retargeted_from": self.aspect},
        )

    def describe(self) -> str:
        lines = [
            f"{self.project}  [{self.style}]  {self.aspect} {self.width}x{self.height} "
            f"@{self.fps}fps  {self.duration:.2f}s  {self.bpm:g}bpm",
        ]
        for start, end, clip in self.timeline():
            trans = "—" if clip.transition == "cut" else f"◇{clip.transition_frames}f"
            speed = "" if abs(clip.speed - 1.0) < 1e-3 else f" {clip.speed:g}x"
            lines.append(
                f"  {start:6.2f}–{end:6.2f} {trans:>4} {clip.beat:<9} {clip.role:<8} "
                f"{clip.motion:<11}{speed} {os.path.basename(clip.source)} "
                f"[{clip.src_in:.2f}–{clip.src_out:.2f}]"
            )
        for title in self.titles:
            lines.append(
                f"  {title.start:6.2f}+{title.duration:4.2f} TITLE ({title.kind}) “{title.text}”"
            )
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# beat fitting
# ---------------------------------------------------------------------------
def _quantize(value: float, grid: float, minimum: float, maximum: float) -> float:
    """Snap a duration to the musical grid, then clamp into the beat's range."""
    if grid <= 0:
        return max(minimum, min(maximum, value))
    steps = max(1, round(value / grid))
    snapped = steps * grid
    if snapped < minimum:
        snapped = grid * max(1, int(minimum / grid + 0.999))
    if snapped > maximum:
        snapped = grid * max(1, int(maximum / grid))
    return max(minimum, min(maximum, snapped))


def _expected_overlap(pack: StylePack, arc: Sequence[Beat], fps: int) -> float:
    """Dissolves shorten the programme; budget for that before allocating."""
    dissolves = min(pack.dissolve_budget, sum(1 for b in arc[1:] if b.transition == "dissolve"))
    return dissolves * pack.dissolve_frames / max(1, fps)


def _water_fill(
    weights: Sequence[float], lows: Sequence[float], highs: Sequence[float], total: float
) -> List[float]:
    """Distribute ``total`` proportionally to ``weights`` within [low, high].

    Classic water-filling: allocate, pin whatever violated a bound, repeat on
    what is left. Terminates in at most n rounds and always sums to ``total``
    unless the bounds themselves make that impossible.
    """
    n = len(weights)
    out = [0.0] * n
    free = set(range(n))
    remaining = total
    for _ in range(n + 2):
        if not free:
            break
        wsum = sum(weights[i] for i in free) or float(len(free))
        violated = False
        for i in sorted(free):
            share = remaining * (weights[i] / wsum if wsum else 1.0 / len(free))
            if share < lows[i] - 1e-9:
                out[i] = lows[i]
                free.discard(i)
                remaining -= lows[i]
                violated = True
            elif share > highs[i] + 1e-9:
                out[i] = highs[i]
                free.discard(i)
                remaining -= highs[i]
                violated = True
        if not violated:
            wsum = sum(weights[i] for i in free) or float(len(free))
            for i in free:
                out[i] = remaining * (weights[i] / wsum if wsum else 1.0 / len(free))
            break
    return out


def fit_arc(pack: StylePack, brief: Brief, *, rng: random.Random) -> List[Tuple[Beat, float]]:
    """Fit the pack's arc to the brief duration, on the beat grid.

    Long briefs repeat the middle movements; short briefs shed the lowest
    weighted non-held beats first. Held beats (hook, reveal, resolve, endcard)
    are never dropped: they are the film's spine.
    """
    bpm = brief.bpm or pack.bpm
    grid = (60.0 / max(1.0, bpm)) * pack.subdivision / 2.0  # half-grid resolution
    arc = [b for b in pack.arc if b.roles]
    if not arc:
        raise PlanError(f"style pack '{pack.name}' has no usable beats")

    target = brief.duration + _expected_overlap(pack, arc, brief.fps)
    middles = [b for b in arc if not b.hold] or arc

    # grow the arc until it *can* hold the target, rotating through the middles
    # so a long film does not read as the same four shots on a loop
    guard = 0
    while sum(b.max_dur for b in arc) < target and guard < 60:
        arc.insert(max(1, len(arc) - 2), middles[guard % len(middles)])
        guard += 1
    # shed the cheapest expendable beats while the floor overshoots
    while sum(max(MIN_CLIP, b.min_dur) for b in arc) > target and any(not b.hold for b in arc):
        arc.remove(min((b for b in arc if not b.hold), key=lambda b: b.weight))

    n = len(arc)
    weights = []
    for i, beat in enumerate(arc):
        pos = (i + 0.5) / n
        jitter = 1.0 + rng.uniform(-0.04, 0.04)
        weights.append(max(0.05, beat.weight * pack.tempo_at(pos) * brief.tempo_scale * jitter))

    lows = [max(MIN_CLIP, b.min_dur) for b in arc]
    highs = [max(lo, b.max_dur) for lo, b in zip(lows, arc)]
    durations = _water_fill(weights, lows, highs, target)

    # snap to the musical grid, then put the rounding residual back into the
    # beats that still have room, so the film lands on its target duration
    snapped = [
        _quantize(d, grid, lo, hi) for d, lo, hi in zip(durations, lows, highs)
    ]
    residual = target - sum(snapped)
    if abs(residual) > 1e-3:
        order = sorted(range(n), key=lambda i: highs[i] - lows[i], reverse=True)
        for i in order:
            if abs(residual) <= 1e-3:
                break
            room = (highs[i] - snapped[i]) if residual > 0 else (lows[i] - snapped[i])
            step = residual if abs(residual) < abs(room) else room
            snapped[i] += step
            residual -= step

    return [(b, round(max(MIN_CLIP, d), 3)) for b, d in zip(arc, snapped)]


# ---------------------------------------------------------------------------
# shot selection
# ---------------------------------------------------------------------------
def _role_fit(beat: Beat, shot: Shot, brief: Brief) -> float:
    if shot.role in brief.ban_roles:
        return -5.0
    if shot.role in beat.roles:
        rank = beat.roles.index(shot.role)
        return 1.0 - 0.22 * rank
    # soft fallback: use the shot's own score for the beat's preferred role
    return 0.25 * max((shot.role_scores.get(r, 0.0) for r in beat.roles), default=0.0)


def _quality(shot: Shot) -> float:
    """Penalise clipped exposure and mush; reward a shot with structure."""
    exposure = 1.0 - min(1.0, abs(shot.luma - 0.46) / 0.42)
    structure = min(1.0, shot.contrast / 0.24)
    return 0.6 * exposure + 0.4 * structure


def _pick_window(shot: Shot, want: float, beat: Beat, rng: random.Random) -> Tuple[float, float]:
    """Choose the in/out point inside a shot.

    Held beats take the settled middle of the take; moving beats bias slightly
    later, where a camera move has typically found its speed.
    """
    span = shot.duration
    want = min(want, max(MIN_CLIP, span))
    slack = max(0.0, span - want)
    bias = 0.5 if beat.hold else 0.62
    offset = slack * bias + rng.uniform(-0.12, 0.12) * slack
    offset = max(0.0, min(slack, offset))
    src_in = round(shot.start + offset, 3)
    return src_in, round(src_in + want, 3)


def select_shots(
    arc: Sequence[Tuple[Beat, float]],
    shots: Sequence[Shot],
    brief: Brief,
    pack: StylePack,
    *,
    rng: random.Random,
    exploration: float = 0.0,
) -> List[Tuple[Beat, float, Shot]]:
    """Greedy best-fit assignment with reuse and repetition penalties."""
    usage: Dict[str, int] = {}
    recent: List[str] = []
    last_source: Optional[str] = None
    last_role: Optional[str] = None
    picks: List[Tuple[Beat, float, Shot]] = []

    pool = [
        s for s in shots if s.duration >= MIN_CLIP and s.role not in brief.ban_roles
    ] or list(shots)

    for index, (beat, want) in enumerate(arc):
        roles = list(beat.roles)
        if index == 0 and brief.hook_role:
            roles = [brief.hook_role] + [r for r in roles if r != brief.hook_role]
        effective = Beat(**{**asdict(beat), "roles": roles})

        scored: List[Tuple[float, Shot]] = []
        for shot in pool:
            score = 2.4 * _role_fit(effective, shot, brief)
            score += 0.9 * _quality(shot)
            score += 0.5 * pack.role_affinity.get(shot.role, 0.85)
            # the spine of the film should not rest on a guess
            score += (0.55 if beat.hold else 0.2) * shot.role_confidence
            # enough material for the beat?
            score -= 1.1 * max(0.0, (want - shot.duration) / max(want, 0.1))
            # freshness: reusing a shot costs, reusing it *recently* costs more
            score -= 1.15 * usage.get(shot.id, 0)
            if shot.id in recent:
                score -= 1.3
            if shot.source == last_source:
                score -= 0.45
            if shot.role == last_role:
                score -= 0.35
            if shot.role in brief.require_roles and shot.role not in {p[2].role for p in picks}:
                score += 0.4
            if exploration:
                score += rng.gauss(0.0, exploration)
            scored.append((score, shot))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        best = scored[0][1]
        usage[best.id] = usage.get(best.id, 0) + 1
        recent = ([best.id] + recent)[:3]
        last_source, last_role = best.source, best.role
        picks.append((beat, want, best))

    return picks


# ---------------------------------------------------------------------------
# compilation
# ---------------------------------------------------------------------------
def _motion_for(beat: Beat, shot: Shot, rng: random.Random, variety: float) -> str:
    """Never fight the footage: a moving shot gets a quieter frame move."""
    if beat.motion == "static":
        return "static"
    if shot.motion > 0.085:
        return "static" if rng.random() < 0.6 else "push_slow"
    if variety and rng.random() < variety:
        return rng.choice(["push", "push_slow", "pull", "drift_left", "drift_right"])
    return beat.motion


def compile_edl(
    picks: Sequence[Tuple[Beat, float, Shot]],
    brief: Brief,
    pack: StylePack,
    *,
    aspect: str,
    project: str,
    rng: random.Random,
    variant: int = 0,
    variety: float = 0.0,
    plan_source: str = "deterministic",
    confidence: float = 1.0,
    rationale: str = "",
) -> EDL:
    """Turn beat/shot picks into a validated, renderable EDL."""
    width, height = ASPECTS[aspect]
    fps = brief.fps
    bpm = brief.bpm or pack.bpm

    clips: List[Clip] = []
    for i, (beat, want, shot) in enumerate(picks):
        speed = 1.0
        if beat.hold and shot.motion > 0.06:
            speed = 0.88  # a touch of slow-motion on held frames reads as luxury
        src_want = want * speed
        src_in, src_out = _pick_window(shot, src_want, beat, rng)
        if src_out - src_in < MIN_CLIP * speed:
            src_out = min(shot.end, src_in + MIN_CLIP * speed)
        clips.append(
            Clip(
                id=f"c{i + 1:02d}",
                source=shot.source,
                src_in=src_in,
                src_out=src_out,
                role=shot.role,
                beat=beat.name,
                motion=_motion_for(beat, shot, rng, variety),
                speed=speed,
                transition=beat.transition,
                transition_frames=pack.dissolve_frames if beat.transition == "dissolve" else 0,
                crop="face" if shot.role in ("talent", "gesture") else "center",
            )
        )

    # Transitions and durations are coupled: capping a dissolve changes the
    # programme length, and conforming the length can shorten a clip out from
    # under its dissolve. Alternate until both hold still.
    shot_list = [shot for _b, _w, shot in picks]
    beat_list = [beat for beat, _w, _s in picks]
    for _ in range(4):
        clips = _enforce_transitions(clips, pack, fps)
        clips = conform_duration(clips, shot_list, beat_list, fps, brief.duration)
        settled = _enforce_transitions(
            [Clip.from_dict(c.to_dict()) for c in clips], pack, fps
        )
        if all(
            a.transition_frames == b.transition_frames and a.transition == b.transition
            for a, b in zip(clips, settled)
        ):
            break

    edl = EDL(
        project=project,
        style=pack.name,
        fps=fps,
        aspect=aspect,
        width=width,
        height=height,
        bpm=bpm,
        grade_intensity=brief.grade_intensity,
        clips=clips,
        audio={**pack.audio, "bpm": bpm},
        meta={
            "brief": brief.text,
            "brief_summary": brief.summary(),
            "variant": variant,
            "plan_source": plan_source,
            "confidence": round(confidence, 4),
            "rationale": rationale,
            "target_duration": brief.duration,
        },
    )
    edl.titles = _build_titles(edl, picks, brief, pack)
    validate(edl)
    return edl


def _enforce_transitions(clips: List[Clip], pack: StylePack, fps: int) -> List[Clip]:
    """Hard cuts are the default; dissolves are a scarce, ranked resource."""
    priority = {"reveal": 3, "resolve": 2, "endcard": 4, "hook": 1}
    candidates = [
        (priority.get(c.beat, 0), i)
        for i, c in enumerate(clips)
        if c.transition == "dissolve" and i > 0
    ]
    candidates.sort(reverse=True)
    keep = {i for _p, i in candidates[: max(0, pack.dissolve_budget)]}
    for i, clip in enumerate(clips):
        if clip.transition != "dissolve" or i not in keep:
            clip.transition = "cut"
            clip.transition_frames = 0
            continue
        # a dissolve may never eat more than a third of either neighbour
        max_frames = int(
            min(clips[i - 1].duration, clip.duration) * fps / 3.0
        )
        clip.transition_frames = max(2, min(clip.transition_frames, max_frames))
        if clip.transition_frames < 3:
            clip.transition = "cut"
            clip.transition_frames = 0
    if clips:
        clips[0].transition = "cut"
        clips[0].transition_frames = 0
    return clips


def _timeline_duration(clips: Sequence[Clip], fps: int) -> float:
    total = sum(c.duration for c in clips)
    overlap = sum(c.transition_frames / fps for c in clips[1:] if c.transition == "dissolve")
    return total - overlap


def _snap_to_frames(clip: Clip, fps: int) -> None:
    """Whole-frame clip lengths: anything else drifts across a long assembly."""
    frames = max(2, round(clip.duration * fps))
    clip.src_out = round(clip.src_in + (frames / fps) * clip.speed, 4)


def conform_duration(
    clips: List[Clip],
    shots: Sequence[Shot],
    beats: Sequence[Beat],
    fps: int,
    target: float,
) -> List[Clip]:
    """Trim or extend the cut so it lands on the delivered duration exactly.

    Broadcast and paid social slots are sold in whole seconds; a :15 that runs
    15.4s is a reject. Flexible beats absorb the difference first, held beats
    only if they must, and every clip stays inside its source shot.
    """
    for clip in clips:
        _snap_to_frames(clip, fps)

    frame = 1.0 / fps
    # First pass honours each beat's own minimum. If the timeline still cannot
    # be made to land — every beat pinned at its floor — a second pass relaxes
    # those floors to the hard minimum, because hitting the sold duration
    # matters more than any single beat's ideal length.
    for relaxed in (False, True):
        for _ in range(len(clips) * 2 + 4):
            delta = target - _timeline_duration(clips, fps)
            if abs(delta) < frame:
                return clips
            order = sorted(
                range(len(clips)),
                key=lambda i: (
                    beats[i].hold,
                    -_slack(clips[i], shots[i], beats[i], delta, relaxed),
                ),
            )
            moved = False
            for i in order:
                if abs(delta) < frame:
                    break
                room = _slack(clips[i], shots[i], beats[i], delta, relaxed)
                if room < frame:
                    continue
                step = min(abs(delta), room) * (1 if delta > 0 else -1)
                clips[i].src_out = round(clips[i].src_out + step * clips[i].speed, 4)
                _snap_to_frames(clips[i], fps)
                delta = target - _timeline_duration(clips, fps)
                moved = True
            if not moved:
                break
    return clips


def _slack(clip: Clip, shot: Shot, beat: Beat, delta: float, relaxed: bool = False) -> float:
    """How much timeline time this clip can gain (delta>0) or give up."""
    if delta > 0:
        return max(0.0, (shot.end - clip.src_out) / max(0.01, clip.speed))
    floor = MIN_CLIP if relaxed else max(MIN_CLIP, min(beat.min_dur, clip.duration))
    return max(0.0, clip.duration - floor)


def _super_position(kind: str, shot: Shot) -> str:
    """Set the super where the subject is not.

    The analyser already knows roughly where the subject mass sits in frame,
    so a lower third that would land across a bottle goes to the top instead —
    the call a human editor makes without thinking about it.
    """
    if kind == "endcard":
        return "center"
    if shot.subject >= 0.06 and shot.subject_y > 0.56:
        return "upper"
    return "lower"


def _build_titles(
    edl: EDL,
    picks: Sequence[Tuple[Beat, float, Shot]],
    brief: Brief,
    pack: StylePack,
) -> List[Title]:
    """Type enters on a cut and leaves before the next one — never mid-move."""
    titles: List[Title] = []
    timeline = edl.timeline()
    pad = pack.typography.get("fade_frames", 8) / max(1, edl.fps)

    for (start, end, _clip), (beat, _want, _shot) in zip(timeline, picks):
        key = beat.title
        if not key:
            continue
        text = brief.copy.get(key)
        if key == "endcard" and not text:
            # the end card is the brand's signature; repeating the tagline here
            # reads as a mistake, so it is left blank rather than doubled up
            text = brief.brand
        if key == "product" and not text:
            text = brief.product
        if not text:
            continue
        span = max(0.6, (end - start) - pad)
        titles.append(
            Title(
                text=text,
                start=round(start + pad, 3),
                duration=round(min(span, end - start - pad * 0.5), 3),
                kind=key,
                position=_super_position(key, _shot),
            )
        )
    # never stack two supers
    deduped: List[Title] = []
    for title in sorted(titles, key=lambda t: t.start):
        if deduped and title.start < deduped[-1].start + deduped[-1].duration:
            deduped[-1].duration = round(max(0.4, title.start - deduped[-1].start - 0.1), 3)
        deduped.append(title)
    return deduped


class PlanError(ValueError):
    pass


def validate(edl: EDL) -> None:
    """Fail loudly at plan time rather than 40 seconds into a render."""
    if not edl.clips:
        raise PlanError("EDL has no clips")
    frame = 1.0 / max(1, edl.fps)
    for clip in edl.clips:
        if clip.src_out - clip.src_in < frame * 2:
            raise PlanError(
                f"{clip.id}: source range {clip.src_in}-{clip.src_out} is under two frames"
            )
        if clip.speed <= 0:
            raise PlanError(f"{clip.id}: non-positive speed {clip.speed}")
        if clip.transition == "dissolve" and clip.transition_frames < 2:
            raise PlanError(f"{clip.id}: dissolve shorter than two frames")
    for i, clip in enumerate(edl.clips[1:], start=1):
        if clip.transition == "dissolve":
            overlap = clip.transition_frames / edl.fps
            if overlap >= min(edl.clips[i - 1].duration, clip.duration):
                raise PlanError(f"{clip.id}: dissolve longer than an adjacent clip")
    if edl.duration <= 0:
        raise PlanError("EDL duration collapsed to zero")


# ---------------------------------------------------------------------------
# planners
# ---------------------------------------------------------------------------
def plan(
    shotlist: ShotList,
    brief: Brief,
    pack: StylePack,
    *,
    aspect: Optional[str] = None,
    project: str = "autocut",
    seed: int = 0,
    variant: int = 0,
) -> EDL:
    """Deterministic planner: same inputs + same seed => byte-identical EDL."""
    rng = random.Random(seed * 1013904223 + variant * 2654435761 + 17)
    aspect = aspect or (brief.aspects[0] if brief.aspects else "9:16")
    arc = fit_arc(pack, brief, rng=rng)
    exploration = 0.0 if variant == 0 else min(0.85, 0.22 * variant)
    variety = 0.0 if variant == 0 else min(0.5, 0.12 * variant)
    picks = select_shots(arc, list(shotlist), brief, pack, rng=rng, exploration=exploration)
    return compile_edl(
        picks, brief, pack,
        aspect=aspect, project=project, rng=rng, variant=variant, variety=variety,
        plan_source="deterministic",
        confidence=1.0 if variant == 0 else round(1.0 / (1.0 + 0.35 * variant), 3),
        rationale="pack arc fitted to brief duration on the beat grid",
    )


def plan_variants(
    shotlist: ShotList,
    brief: Brief,
    pack: StylePack,
    *,
    k: int = 3,
    aspect: Optional[str] = None,
    project: str = "autocut",
    seed: int = 0,
) -> List[EDL]:
    """k distinct deterministic cuts, ranked by confidence."""
    return [
        plan(shotlist, brief, pack, aspect=aspect, project=project, seed=seed, variant=i)
        for i in range(max(1, k))
    ]


# -- verbalized (LLM) planner ----------------------------------------------
def _shot_menu(shotlist: ShotList, limit: int = 60) -> str:
    rows = []
    for shot in list(shotlist)[:limit]:
        rows.append(
            f"- {shot.id} | role={shot.role} | dur={shot.duration:.1f}s | "
            f"luma={shot.luma:.2f} detail={shot.detail:.3f} skin={shot.skin:.2f} "
            f"centre={shot.center_bias:.2f} motion={shot.motion:.3f} "
            f"| {os.path.basename(shot.source)}"
        )
    return "\n".join(rows)


def build_prompt(
    shotlist: ShotList, brief: Brief, pack: StylePack, arc: Sequence[Tuple[Beat, float]]
) -> str:
    beats = "\n".join(
        f"{i + 1}. {beat.name} ({dur:.2f}s) — prefers {', '.join(beat.roles)}"
        for i, (beat, dur) in enumerate(arc)
    )
    return f"""You are the offline editor on a luxury fragrance campaign.

BRIEF: {brief.text or brief.summary()}
HOUSE STYLE: {pack.name} — {pack.description}

The film's beat structure and timings are already locked:
{beats}

Available shots (id | role | duration | measured features):
{_shot_menu(shotlist)}

Assign exactly one shot id to each beat, in order. Judge on content and
rhythm: do not repeat a shot unless the material forces it, avoid two
consecutive shots from the same source file, and make sure the reveal and
resolve beats land on the strongest product frames.

Respond with JSON only:
{{"assignments": ["<shot id for beat 1>", "..."], "rationale": "<one sentence>"}}"""


def _parse_assignment(
    text: str, shotlist: ShotList, expected: int
) -> Optional[Tuple[List[Shot], str]]:
    by_id = {s.id: s for s in shotlist}
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        data = json.loads(text[start:end])
    except (ValueError, json.JSONDecodeError):
        return None
    ids = data.get("assignments")
    if not isinstance(ids, list) or not ids:
        return None
    shots: List[Shot] = []
    for shot_id in ids[:expected]:
        shot = by_id.get(str(shot_id).strip())
        if shot is None:
            return None
        shots.append(shot)
    if len(shots) != expected:
        return None
    return shots, str(data.get("rationale", ""))[:280]


def plan_verbalized(
    shotlist: ShotList,
    brief: Brief,
    pack: StylePack,
    *,
    k: int = 4,
    aspect: Optional[str] = None,
    project: str = "autocut",
    seed: int = 0,
    model: Optional[str] = None,
    temperature: float = 0.9,
    on_warning=None,
) -> List[EDL]:
    """Elicit k weighted edit plans from an LLM, compile each deterministically.

    Falls back to :func:`plan_variants` whenever the model is unavailable or
    returns nothing usable, so this is always safe to call.
    """
    rng = random.Random(seed * 2246822519 + 7)
    aspect = aspect or (brief.aspects[0] if brief.aspects else "9:16")
    arc = fit_arc(pack, brief, rng=random.Random(seed))

    try:
        from verbalized_sampling import verbalize
    except Exception as exc:  # pragma: no cover - import environment specific
        if on_warning:
            on_warning(f"verbalized_sampling unavailable ({exc}); using deterministic variants")
        return plan_variants(shotlist, brief, pack, k=k, aspect=aspect, project=project, seed=seed)

    try:
        dist = verbalize(
            build_prompt(shotlist, brief, pack, arc),
            k=k,
            temperature=temperature,
            model=model,
            seed=seed,
        )
    except Exception as exc:
        if on_warning:
            on_warning(
                f"LLM planning failed ({type(exc).__name__}: {exc}); "
                "using deterministic variants"
            )
        return plan_variants(shotlist, brief, pack, k=k, aspect=aspect, project=project, seed=seed)

    edls: List[EDL] = []
    for index, item in enumerate(dist):
        parsed = _parse_assignment(item.text, shotlist, len(arc))
        if not parsed:
            if on_warning:
                on_warning(f"candidate {index + 1} was not a usable assignment; skipped")
            continue
        shots, rationale = parsed
        picks = [(beat, dur, shot) for (beat, dur), shot in zip(arc, shots)]
        try:
            edls.append(
                compile_edl(
                    picks, brief, pack,
                    aspect=aspect, project=project, rng=rng, variant=index,
                    plan_source="verbalized",
                    confidence=float(item.p),
                    rationale=rationale,
                )
            )
        except PlanError as exc:
            if on_warning:
                on_warning(f"candidate {index + 1} failed validation ({exc}); skipped")

    if not edls:
        if on_warning:
            on_warning("no LLM candidate survived validation; using deterministic variants")
        return plan_variants(shotlist, brief, pack, k=k, aspect=aspect, project=project, seed=seed)

    edls.sort(key=lambda e: float(e.meta.get("confidence", 0.0)), reverse=True)
    return edls
