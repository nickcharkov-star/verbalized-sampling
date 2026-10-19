"""Footage ingest: shot detection + content analysis, ffmpeg-only.

The renderer can only be as good as its knowledge of the rushes. This module
turns a folder of raw clips into a machine-readable shot list where every shot
carries a *role* (``talent``, ``macro``, ``product``, ``texture``, ``gesture``,
``logo``) plus photometric features. The planner reasons over these roles; it
never touches pixels.

Analysis runs on 48x48 thumbnails decoded straight from ffmpeg into Python
bytes, so there is no numpy/OpenCV dependency and a 40-clip ingest costs
seconds, not minutes.
"""

from __future__ import annotations

import json
import math
import os
import re
from dataclasses import asdict, dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from ._util import _field_names
from .ffmpeg import MediaInfo, probe, raw_frames, run_stdout

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mxf", ".mts"}
THUMB = 48  # thumbnail edge in px; enough signal, cheap in pure Python

ROLES = ("talent", "gesture", "macro", "product", "texture", "logo")


# --------------------------------------------------------------------------
# data model
# --------------------------------------------------------------------------
@dataclass
class Shot:
    """One continuous camera take inside a source file."""

    source: str
    start: float
    end: float
    role: str = "texture"
    role_scores: Dict[str, float] = field(default_factory=dict)
    role_confidence: float = 0.0
    luma: float = 0.0
    contrast: float = 0.0
    saturation: float = 0.0
    warmth: float = 0.0
    detail: float = 0.0
    skin: float = 0.0
    subject: float = 0.0
    tone_spread: float = 0.0
    centring: float = 0.0
    subject_y: float = 0.5
    accent: float = 0.0
    center_bias: float = 0.0
    motion: float = 0.0
    scene_score: float = 0.0

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)

    @property
    def id(self) -> str:
        stem = os.path.splitext(os.path.basename(self.source))[0]
        return f"{stem}@{self.start:.2f}"

    def to_dict(self) -> dict:
        d = asdict(self)
        d["duration"] = round(self.duration, 3)
        d["id"] = self.id
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Shot":
        fields = {k: v for k, v in d.items() if k in _field_names(cls)}
        return cls(**fields)


@dataclass
class ShotList:
    shots: List[Shot]
    media: Dict[str, dict] = field(default_factory=dict)

    def __iter__(self) -> Iterable[Shot]:
        return iter(self.shots)

    def __len__(self) -> int:
        return len(self.shots)

    def by_role(self, role: str) -> List[Shot]:
        return [s for s in self.shots if s.role == role]

    def to_dict(self) -> dict:
        return {
            "schema": "autocut.shotlist/1",
            "media": self.media,
            "shots": [s.to_dict() for s in self.shots],
        }

    def save(self, path: str) -> str:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(self.to_dict(), fh, indent=2)
        return path

    @classmethod
    def load(cls, path: str) -> "ShotList":
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return cls(
            shots=[Shot.from_dict(s) for s in data.get("shots", [])],
            media=data.get("media", {}),
        )


# --------------------------------------------------------------------------
# shot boundary detection
# --------------------------------------------------------------------------
_META_RE = re.compile(r"pts_time:(?P<t>[0-9.]+)")
_SCORE_RE = re.compile(r"lavfi\.scene_score=(?P<s>[0-9.]+)")


def detect_cuts(path: str, threshold: float = 0.28) -> List[Tuple[float, float]]:
    """Return (timestamp, score) pairs where the frame content jumps."""
    text = run_stdout([
        "-i", path,
        "-an",
        "-filter_complex",
        f"select='gt(scene,{threshold})',metadata=print:file=-",
        "-f", "null", "-",
    ])
    cuts: List[Tuple[float, float]] = []
    pending: Optional[float] = None
    for line in text.splitlines():
        m = _META_RE.search(line)
        if m:
            pending = float(m.group("t"))
            continue
        m = _SCORE_RE.search(line)
        if m and pending is not None:
            cuts.append((pending, float(m.group("s"))))
            pending = None
    return cuts


def segment(
    info: MediaInfo,
    cuts: Sequence[Tuple[float, float]],
    *,
    min_shot: float = 0.8,
    max_shot: float = 8.0,
) -> List[Tuple[float, float, float]]:
    """Turn cut points into (start, end, score) shots.

    Shots shorter than ``min_shot`` are absorbed into their predecessor; shots
    longer than ``max_shot`` are subdivided so that a single long take still
    offers the planner several usable selects.
    """
    bounds = [0.0] + [t for t, _ in cuts if 0.0 < t < info.duration] + [info.duration]
    scores = {round(t, 3): s for t, s in cuts}
    bounds = sorted(set(round(b, 3) for b in bounds))

    raw: List[Tuple[float, float, float]] = []
    for start, end in zip(bounds, bounds[1:]):
        if end - start <= 0:
            continue
        if raw and end - start < min_shot:
            prev_s, _, prev_score = raw[-1]
            raw[-1] = (prev_s, end, prev_score)
            continue
        raw.append((start, end, scores.get(round(start, 3), 0.0)))

    out: List[Tuple[float, float, float]] = []
    for start, end, score in raw:
        span = end - start
        if span <= max_shot:
            out.append((start, end, score))
            continue
        parts = int(math.ceil(span / max_shot))
        step = span / parts
        for i in range(parts):
            out.append((start + i * step, start + (i + 1) * step, score if i == 0 else 0.0))
    return [s for s in out if s[1] - s[0] >= 0.25]


# --------------------------------------------------------------------------
# thumbnail feature extraction (pure Python over raw rgb24 bytes)
# --------------------------------------------------------------------------
def _thumbnail(path: str, t: float, size: int = THUMB) -> Optional[bytes]:
    try:
        buf = raw_frames([
            "-ss", f"{max(0.0, t):.3f}",
            "-i", path,
            "-frames:v", "1",
            "-vf", f"scale={size}:{size}:force_original_aspect_ratio=disable",
            "-pix_fmt", "rgb24", "-f", "rawvideo", "-",
        ])
    except Exception:
        return None
    return buf if len(buf) == size * size * 3 else None


def _rgb_to_hsv(r: float, g: float, b: float) -> Tuple[float, float, float]:
    mx, mn = max(r, g, b), min(r, g, b)
    v = mx
    delta = mx - mn
    s = 0.0 if mx <= 0 else delta / mx
    if delta <= 1e-6:
        h = 0.0
    elif mx == r:
        h = 60.0 * (((g - b) / delta) % 6)
    elif mx == g:
        h = 60.0 * (((b - r) / delta) + 2)
    else:
        h = 60.0 * (((r - g) / delta) + 4)
    return h, s, v


def _is_skin_tone(h: float, s: float, v: float) -> bool:
    """Warm hue band with a generous value floor.

    Hue/saturation rather than the classic Kovac RGB rule, which is tuned on
    light skin and drops deep skin tones — for a campaign cut that would mean
    the planner stops recognising the talent. On its own this test also fires
    on sand, linen and raw plaster, which is most of a fragrance backdrop, so
    it is only ever applied to pixels the background model has already
    rejected.
    """
    return 2.0 <= h <= 50.0 and 0.13 <= s <= 0.92 and v >= 0.10


def _features(buf: bytes, size: int = THUMB) -> Dict[str, float]:
    """Photometric + compositional descriptors for one thumbnail.

    Composition is read through a *border-prior background model*: the outer
    ring of a frame is almost always backdrop, so everything far enough from
    the ring's colour is treated as subject. That one step is what separates a
    bottle on sand from a face against the same sand — an absolute skin-hue
    test cannot, because the sand is skin-coloured too.
    """
    n = size * size
    lum = [0.0] * n
    sat = [0.0] * n
    hue = [0.0] * n
    val = [0.0] * n
    rs = [0.0] * n
    gs = [0.0] * n
    bs = [0.0] * n

    for i in range(n):
        o = i * 3
        r, g, b = buf[o] / 255.0, buf[o + 1] / 255.0, buf[o + 2] / 255.0
        rs[i], gs[i], bs[i] = r, g, b
        h, sv, v = _rgb_to_hsv(r, g, b)
        hue[i], sat[i], val[i] = h, sv, v
        lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b

    mean = sum(lum) / n
    var = sum((y - mean) ** 2 for y in lum) / n

    # --- background model from the outer ring ----------------------------
    ring = max(2, int(size * 0.12))
    idx_ring = [
        y * size + x
        for y in range(size)
        for x in range(size)
        if x < ring or x >= size - ring or y < ring or y >= size - ring
    ]

    def _median(values: List[float]) -> float:
        ordered = sorted(values)
        mid = len(ordered) // 2
        return ordered[mid] if len(ordered) % 2 else 0.5 * (ordered[mid - 1] + ordered[mid])

    bg_r = _median([rs[i] for i in idx_ring])
    bg_g = _median([gs[i] for i in idx_ring])
    bg_b = _median([bs[i] for i in idx_ring])
    bg_y = 0.2126 * bg_r + 0.7152 * bg_g + 0.0722 * bg_b
    bg_sat = _median([sat[i] for i in idx_ring])
    bg_rg, bg_gb = bg_r - bg_g, bg_g - bg_b

    def _distance(i: int) -> float:
        # chroma dominates: a plaster wall raked by window light swings wildly
        # in luma while staying the same colour, and that light *is* the set
        return 0.70 * abs(lum[i] - bg_y) + 1.0 * (
            abs((rs[i] - gs[i]) - bg_rg) + abs((gs[i] - bs[i]) - bg_gb)
        )

    dist = [_distance(i) for i in range(n)]

    # Adaptive cut-off: whatever spread the backdrop itself shows in the ring
    # is, by definition, still backdrop. A flat seamless gets a tight
    # threshold; a gradient wall gets a loose one.
    ring_d = sorted(dist[i] for i in idx_ring)
    p80 = ring_d[int(0.8 * (len(ring_d) - 1))] if ring_d else 0.0
    threshold = max(0.09, min(0.28, p80 * 1.45))

    fg = [False] * n
    fg_count = 0
    fg_skin = 0.0
    fg_sat = 0.0
    fg_x = fg_y = 0.0
    for i in range(n):
        if dist[i] > threshold:
            fg[i] = True
            fg_count += 1
            fg_sat += sat[i]
            fg_x += i % size
            fg_y += i // size
            if _is_skin_tone(hue[i], sat[i], val[i]):
                fg_skin += 1.0

    fg_frac = fg_count / n
    # Statistics taken over a handful of pixels are noise, not evidence: below
    # this mask size the frame is treated as pure backdrop and the subject
    # descriptors are zeroed rather than reported with false confidence.
    reliable = fg_frac >= 0.06
    skin = (fg_skin / fg_count) if (fg_count and reliable) else 0.0
    sat_excess = ((fg_sat / fg_count) - bg_sat) if (fg_count and reliable) else 0.0

    # tone_spread: how much the subject's *lightness* varies at roughly constant
    # hue. Light modelling across a face or a hand spreads it wide; a lacquered
    # bottle does not.
    if fg_count and reliable:
        fg_lum = [lum[i] for i in range(n) if fg[i]]
        fg_mean = sum(fg_lum) / len(fg_lum)
        tone_spread = (sum((y - fg_mean) ** 2 for y in fg_lum) / len(fg_lum)) ** 0.5
    else:
        tone_spread = 0.0

    # how tightly the subject sits in the middle of frame (1 = dead centre)
    if fg_count and reliable:
        cx = (fg_x / fg_count) / (size - 1)
        cy = (fg_y / fg_count) / (size - 1)
        centring = 1.0 - min(1.0, 2.0 * (abs(cx - 0.5) + abs(cy - 0.5)))
    else:
        centring = 0.0
        cy = 0.5

    # --- detail, kept as a map so composition reads from where it sits ----
    grads = [0.0] * n
    grad = 0.0
    for y in range(size - 1):
        row = y * size
        nxt = row + size
        for x in range(size - 1):
            c = lum[row + x]
            g = abs(c - lum[row + x + 1]) + abs(c - lum[nxt + x])
            grads[row + x] = g
            grad += g
    grad /= 2.0 * (size - 1) * (size - 1)

    lo, hi = size // 3, 2 * size // 3
    c_sum = c_n = e_sum = e_n = 0.0
    for y in range(size - 1):
        row = y * size
        for x in range(size - 1):
            g = grads[row + x]
            if lo <= x < hi and lo <= y < hi:
                c_sum += g
                c_n += 1
            else:
                e_sum += g
                e_n += 1
    center_bias = ((c_sum / max(1.0, c_n)) + 1e-5) / ((e_sum / max(1.0, e_n)) + 1e-5)

    return {
        "luma": mean,
        "contrast": math.sqrt(var),
        "saturation": sum(sat) / n,
        "warmth": sum(rs[i] - bs[i] for i in range(n)) / n,
        "detail": grad,
        "skin": skin,
        "subject": fg_frac,
        "tone_spread": tone_spread,
        "centring": centring,
        "subject_y": cy,
        "accent": sat_excess,
        "center_bias": center_bias,
    }


def _frame_delta(a: bytes, b: bytes) -> float:
    step = 7  # stride-sample; full-resolution diff adds nothing at 48px
    total = 0.0
    count = 0
    for i in range(0, len(a), step):
        total += abs(a[i] - b[i])
        count += 1
    return total / max(1, count) / 255.0


# --------------------------------------------------------------------------
# role classification
# --------------------------------------------------------------------------
def role_hint(path: str) -> Optional[str]:
    """Honour the way editors actually name rushes: ``A012_product_02.mov``.

    A hint is a strong prior, not an override: a mislabelled file still gets
    reclassified if the pixels disagree emphatically.
    """
    stem = os.path.splitext(os.path.basename(path))[0].lower()
    tokens = re.split(r"[^a-z]+", stem)
    for role in ROLES:
        if role in tokens:
            return role
    aliases = {"model": "talent", "bottle": "product", "packshot": "product",
               "hands": "gesture", "detail": "macro", "wall": "texture",
               "backdrop": "texture", "endcard": "logo", "wordmark": "logo"}
    for token in tokens:
        if token in aliases:
            return aliases[token]
    return None


def classify(
    f: Dict[str, float], hint: Optional[str] = None
) -> Tuple[str, Dict[str, float], float]:
    """Score each editorial role from thumbnail features.

    What 48px statistics can genuinely separate is *structure*: an empty
    backdrop, an object sitting in a field, and a person in frame. The finer
    splits — talent versus gesture, product versus macro — lean on secondary
    cues and are reported with lower confidence rather than asserted. Use a
    filename hint or a role override when a distinction has to be right.

    Returns (role, all_scores, confidence) where confidence is the normalised
    margin between the winner and the runner-up.
    """
    skin = f.get("skin", 0.0)
    subject = f.get("subject", 0.0)
    centring = f.get("centring", 0.0)
    accent = f.get("accent", 0.0)
    spread = f.get("tone_spread", 0.0)
    detail = f["detail"]
    center_bias = f["center_bias"]
    contrast = f["contrast"]
    sat = f["saturation"]
    motion = f.get("motion", 0.0)

    empty = 1.0 - min(subject / 0.14, 1.0)          # nothing steps out of the field
    person = min(skin / 0.55, 1.0) * min(spread / 0.115, 1.0)
    # the single most reliable object cue available at this resolution: a
    # subject markedly more saturated than the field it sits in
    objectness = min(max(0.0, accent) / 0.20, 1.0)
    tight = max(0.0, min((center_bias - 1.0) / 1.0, 1.0))
    busy = min(detail / 0.055, 1.0)

    scores = {
        # a face or body in frame: skin tones modelled by light, structure
        # concentrated where the subject is
        "talent": 2.3 * person + 0.9 * busy + 0.6 * tight - 1.5 * empty - 1.8 * objectness,
        # hands presenting the bottle: a person *and* a distinct object, the
        # subject sitting mid-frame rather than filling it
        "gesture": 1.5 * person + 1.2 * centring - 0.9 * objectness
        + 0.5 * max(0.0, 1.0 - abs(subject - 0.25) / 0.22) - 1.6 * empty,
        # macro: structure everywhere, tight on the object, no person
        "macro": 2.2 * busy + 0.8 * objectness + 0.5 * tight
        - 1.6 * person - 1.3 * empty,
        # product on a plinth: chromatic object, centred, still, no person
        "product": 2.4 * objectness + 1.0 * centring + 0.8 * tight
        - 1.7 * person - 1.5 * empty - 0.5 * min(motion / 0.09, 1.0),
        # walls, fabric, light falloff
        "texture": 2.8 * empty + 0.7 * (1.0 - busy) - 1.2 * person,
        # a card: near-monochrome, high contrast, almost no structure
        "logo": 1.8 * min(contrast / 0.34, 1.0) * (1.0 - min(sat / 0.22, 1.0))
        + 0.8 * (1.0 - busy) - 1.2 * person - 0.8 * objectness,
    }
    if hint and hint in scores:
        scores[hint] += 2.0
    scores = {k: round(v, 4) for k, v in scores.items()}
    ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    best, top = ordered[0]
    runner_up = ordered[1][1] if len(ordered) > 1 else 0.0
    confidence = round(max(0.0, min(1.0, (top - runner_up) / 1.2)), 3)
    return best, scores, confidence


def analyze_shot(path: str, start: float, end: float, score: float = 0.0) -> Shot:
    """Sample three frames across a shot and describe it."""
    span = end - start
    times = [start + span * p for p in (0.2, 0.5, 0.8)]
    thumbs = [t for t in (_thumbnail(path, ts) for ts in times) if t]

    shot = Shot(source=path, start=round(start, 3), end=round(end, 3), scene_score=round(score, 4))
    if not thumbs:
        return shot

    feats = [_features(t) for t in thumbs]
    avg = {k: sum(f[k] for f in feats) / len(feats) for k in feats[0]}
    motion = 0.0
    if len(thumbs) > 1:
        deltas = [_frame_delta(thumbs[i], thumbs[i + 1]) for i in range(len(thumbs) - 1)]
        motion = sum(deltas) / len(deltas)
    avg["motion"] = motion

    role, scores, confidence = classify(avg, role_hint(path))
    shot.role = role
    shot.role_scores = scores
    shot.role_confidence = confidence
    for key in ("luma", "contrast", "saturation", "warmth", "detail", "skin",
                "subject", "centring", "subject_y", "accent", "tone_spread",
                "center_bias", "motion"):
        setattr(shot, key, round(avg.get(key, 0.0), 4))
    return shot


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------
def apply_role_overrides(shots: ShotList, mapping: Dict[str, str]) -> int:
    """Lock roles by hand. Returns how many shots were changed.

    Keys are either an exact shot id (``plate01_wide@0.00``) or a source file
    stem (``plate01_wide``), which applies to every shot from that file. This
    is the path a production should use whenever a role has to be right: the
    pixel classifier is a good first pass, not an oracle.
    """
    changed = 0
    for shot in shots:
        stem = os.path.splitext(os.path.basename(shot.source))[0]
        role = mapping.get(shot.id) or mapping.get(stem)
        if role and role in ROLES and role != shot.role:
            shot.role = role
            shot.role_confidence = 1.0
            changed += 1
    return changed


def load_role_overrides(path: str) -> Dict[str, str]:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"{path}: expected an object mapping shot or file names to roles")
    unknown = sorted({v for v in data.values() if v not in ROLES})
    if unknown:
        raise ValueError(f"{path}: unknown role(s) {', '.join(unknown)}; known: {', '.join(ROLES)}")
    return {str(k): str(v) for k, v in data.items()}


def find_sources(root: str) -> List[str]:
    if os.path.isfile(root):
        return [root]
    out: List[str] = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in sorted(filenames):
            if os.path.splitext(name)[1].lower() in VIDEO_EXTS:
                out.append(os.path.join(dirpath, name))
    return sorted(out)


def ingest(
    root: str,
    *,
    threshold: float = 0.28,
    min_shot: float = 0.8,
    max_shot: float = 8.0,
    on_progress=None,
) -> ShotList:
    """Walk ``root``, detect shots in every clip, and describe each shot."""
    sources = find_sources(root)
    if not sources:
        raise FileNotFoundError(f"no video files under {root}")

    shots: List[Shot] = []
    media: Dict[str, dict] = {}
    for path in sources:
        info = probe(path)
        media[path] = {
            "duration": round(info.duration, 3),
            "width": info.width,
            "height": info.height,
            "fps": round(info.fps, 3),
            "has_audio": info.has_audio,
        }
        cuts = detect_cuts(path, threshold=threshold)
        for start, end, score in segment(info, cuts, min_shot=min_shot, max_shot=max_shot):
            shots.append(analyze_shot(path, start, end, score))
        if on_progress:
            on_progress(path, len(shots))
    return ShotList(shots=shots, media=media)
