"""Renderer: EDL -> finished master, in three cacheable passes.

1. **segments** — every clip is trimmed, speed-ramped, reframed for the target
   canvas and given its camera move, then written as a normalised intermediate.
2. **assembly** — hard cuts are concatenated; dissolves are xfaded between the
   groups they separate.
3. **finish** — grade, grain, vignette, supers and the music bed go on the
   whole programme at once, so the look is consistent across every cut.

Intermediates are content-addressed, so re-planning a film and re-rendering it
only re-encodes the clips that actually changed.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence, Tuple

from . import captions
from .ffmpeg import concat_demuxer_file, probe, run
from .plan import EDL, Clip
from .style import StylePack, grade_chain

Progress = Optional[Callable[[str], None]]


@dataclass
class RenderConfig:
    crf: int = 18
    preset: str = "medium"
    audio_bitrate: str = "192k"
    workdir: Optional[str] = None
    keep_intermediates: bool = True
    music: Optional[str] = None      # path to a music bed; procedural if None
    music_offset: float = 0.0
    silent: bool = False
    threads: int = 0


# ---------------------------------------------------------------------------
# framing + camera move
# ---------------------------------------------------------------------------
def _even(n: float) -> int:
    return int(round(n / 2.0)) * 2


def motion_filters(clip: Clip, edl: EDL, pack: StylePack) -> List[str]:
    """Reframe to the canvas and apply the camera move.

    zoompan is fed a super-sampled frame (1.6x canvas) because at low zoom
    factors its integer crop origin visibly stutters on a 1:1 input.
    """
    w, h = edl.width, edl.height
    sw, sh = _even(w * 1.6), _even(h * 1.6)
    amount = pack.motion_amount
    frames = max(2, int(round(clip.duration * edl.fps)))
    n = frames - 1

    # y-bias: keep eyes off the exact centre line on talent/gesture framing
    y_bias = 0.32 if clip.crop == "face" else 0.5

    chain = [
        f"scale={sw}:{sh}:force_original_aspect_ratio=increase:flags=lanczos",
        f"crop={sw}:{sh}:x=(iw-ow)/2:y=(ih-oh)*{y_bias:.3f}",
    ]

    zc = "iw/2-(iw/zoom/2)"
    yc = "ih/2-(ih/zoom/2)"
    drift = f"{amount:.4f}*iw*0.5"

    if clip.motion == "static":
        chain.append(f"scale={w}:{h}:flags=lanczos")
        chain.append("setsar=1")
        return chain

    if clip.motion == "push":
        z = f"1+{amount:.4f}*on/{n}"
        x, y = zc, yc
    elif clip.motion == "push_slow":
        z = f"1+{amount * 0.55:.4f}*on/{n}"
        x, y = zc, yc
    elif clip.motion == "pull":
        z = f"1+{amount:.4f}-{amount:.4f}*on/{n}"
        x, y = zc, yc
    elif clip.motion in ("drift_left", "drift_right"):
        sign = 1.0 if clip.motion == "drift_left" else -1.0
        z = f"1+{amount:.4f}"
        x = f"{zc}+{sign:.1f}*{drift}*(on/{n}-0.5)"
        y = yc
    else:
        z = f"1+{amount * 0.55:.4f}*on/{n}"
        x, y = zc, yc

    chain.append(
        f"zoompan=z='{z}':x='{x}':y='{y}':d=1:s={w}x{h}:fps={edl.fps}"
    )
    chain.append("setsar=1")
    return chain


def clip_filter(clip: Clip, edl: EDL, pack: StylePack) -> str:
    parts = [
        f"trim=start={clip.src_in:.4f}:end={clip.src_out:.4f}",
        "setpts=PTS-STARTPTS",
    ]
    if abs(clip.speed - 1.0) > 1e-3:
        parts.append(f"setpts=PTS/{clip.speed:.5f}")
    parts.append(f"fps={edl.fps}")
    parts.extend(motion_filters(clip, edl, pack))
    parts.append("format=yuv420p")
    return ",".join(parts)


# ---------------------------------------------------------------------------
# pass 1: segments
# ---------------------------------------------------------------------------
def _fingerprint(clip: Clip, edl: EDL, pack: StylePack, cfg: RenderConfig) -> str:
    payload = json.dumps(
        {
            "clip": clip.to_dict(),
            "w": edl.width, "h": edl.height, "fps": edl.fps,
            "pack": pack.name, "motion_amount": pack.motion_amount,
            "crf": cfg.crf, "preset": cfg.preset,
            "src_mtime": os.path.getmtime(clip.source) if os.path.exists(clip.source) else 0,
        },
        sort_keys=True,
    )
    return hashlib.sha1(payload.encode()).hexdigest()[:16]


def render_segments(
    edl: EDL, pack: StylePack, cfg: RenderConfig, workdir: str, progress: Progress = None
) -> List[str]:
    seg_dir = os.path.join(workdir, "segments")
    os.makedirs(seg_dir, exist_ok=True)
    paths: List[str] = []

    for i, clip in enumerate(edl.clips):
        digest = _fingerprint(clip, edl, pack, cfg)
        dest = os.path.join(seg_dir, f"{clip.id}_{digest}.mp4")
        paths.append(dest)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            if progress:
                progress(f"segment {i + 1}/{len(edl.clips)} {clip.id} (cached)")
            continue
        if progress:
            progress(f"segment {i + 1}/{len(edl.clips)} {clip.id} {clip.beat}/{clip.role}")
        run([
            "-y",
            "-i", clip.source,
            "-an",
            "-filter_complex", f"[0:v]{clip_filter(clip, edl, pack)}[v]",
            "-map", "[v]",
            "-c:v", "libx264", "-preset", cfg.preset, "-crf", str(cfg.crf),
            "-pix_fmt", "yuv420p", "-r", str(edl.fps),
            "-video_track_timescale", str(edl.fps * 1000),
            *(["-threads", str(cfg.threads)] if cfg.threads else []),
            dest,
        ])
    return paths


# ---------------------------------------------------------------------------
# pass 2: assembly
# ---------------------------------------------------------------------------
def _groups(edl: EDL) -> List[Tuple[List[int], float]]:
    """Split the timeline at dissolves: each group is a run of hard cuts."""
    groups: List[List[int]] = [[]]
    for i, clip in enumerate(edl.clips):
        if i and clip.transition == "dissolve":
            groups.append([])
        groups[-1].append(i)
    out: List[Tuple[List[int], float]] = []
    for group in groups:
        if group:
            out.append((group, sum(edl.clips[i].duration for i in group)))
    return out


def assemble(
    edl: EDL, segments: Sequence[str], workdir: str, cfg: RenderConfig, progress: Progress = None
) -> str:
    dest = os.path.join(workdir, "assembly.mp4")
    groups = _groups(edl)

    if len(groups) == 1:
        if progress:
            progress(f"assembling {len(segments)} clips (hard cuts)")
        listfile = concat_demuxer_file(segments, os.path.join(workdir, "concat.txt"))
        run([
            "-y", "-f", "concat", "-safe", "0", "-i", listfile,
            "-c", "copy", "-movflags", "+faststart", dest,
        ])
        return dest

    if progress:
        dissolves = len(groups) - 1
        plural = "s" if dissolves != 1 else ""
        progress(f"assembling {len(segments)} clips ({dissolves} dissolve{plural})")

    inputs: List[str] = []
    filters: List[str] = []
    labels: List[str] = []
    next_input = 0
    for gi, (group, _dur) in enumerate(groups):
        base = next_input
        for idx in group:
            inputs.extend(["-i", segments[idx]])
            next_input += 1
        streams = "".join(f"[{base + j}:v]" for j in range(len(group)))
        label = f"g{gi}"
        # xfade demands a constant, declared frame rate on both inputs, and
        # concat does not give it one. Order matters: setpts marks the frame
        # rate unknown, so fps has to come *after* it, not before.
        normalise = f"setpts=PTS-STARTPTS,fps={edl.fps},format=yuv420p,setsar=1"
        if len(group) == 1:
            filters.append(f"{streams}{normalise}[{label}]")
        else:
            filters.append(f"{streams}concat=n={len(group)}:v=1:a=0,{normalise}[{label}]")
        labels.append(label)

    current = labels[0]
    elapsed = groups[0][1]
    for gi in range(1, len(labels)):
        first_index = groups[gi][0][0]
        overlap = edl.clips[first_index].transition_frames / edl.fps
        offset = max(0.0, elapsed - overlap)
        out_label = f"x{gi}"
        # re-declare the rate so the next xfade in the chain accepts this one
        filters.append(
            f"[{current}][{labels[gi]}]xfade=transition=fade:"
            f"duration={overlap:.4f}:offset={offset:.4f},fps={edl.fps}[{out_label}]"
        )
        current = out_label
        elapsed = offset + groups[gi][1]

    run([
        "-y", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", f"[{current}]",
        "-c:v", "libx264", "-preset", cfg.preset, "-crf", str(cfg.crf),
        "-pix_fmt", "yuv420p", "-r", str(edl.fps),
        *(["-threads", str(cfg.threads)] if cfg.threads else []),
        "-movflags", "+faststart", dest,
    ])
    return dest


# ---------------------------------------------------------------------------
# pass 3: grade, type, sound
# ---------------------------------------------------------------------------
def _music_inputs(edl: EDL, pack: StylePack, cfg: RenderConfig) -> Tuple[List[str], Optional[str]]:
    """Return ffmpeg input args and the filter that produces the final mix."""
    if cfg.silent:
        return [], None

    duration = edl.duration
    audio_cfg = {**pack.audio, **(edl.audio or {})}
    fade_in = float(audio_cfg.get("fade_in", 0.8))
    fade_out = float(audio_cfg.get("fade_out", 1.6))
    lufs = float(audio_cfg.get("target_lufs", -14.0))

    if cfg.music:
        # a missing bed must not silently become the procedural one: that swaps
        # the sound design under the director without telling anybody
        if not os.path.exists(cfg.music):
            raise FileNotFoundError(f"music bed not found: {cfg.music}")
        args = ["-ss", f"{max(0.0, cfg.music_offset):.3f}", "-i", cfg.music]
        chain = (
            f"[1:a]atrim=0:{duration:.3f},asetpts=PTS-STARTPTS,"
            f"afade=t=in:st=0:d={fade_in:.3f},"
            f"afade=t=out:st={max(0.0, duration - fade_out):.3f}:d={fade_out:.3f},"
            f"loudnorm=I={lufs}:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo[a]"
        )
        return args, chain

    # Procedural bed: a warm three-note drone plus a sub swell on the reveal.
    root = float(audio_cfg.get("root_hz", 110.0))
    swell_at = duration * 0.55
    for _start, _end, clip in edl.timeline():
        if clip.beat == str(audio_cfg.get("swell_at", "reveal")):
            swell_at = _start
            break

    pad = (
        f"aevalsrc='0.20*sin(2*PI*{root:.2f}*t)"
        f"+0.13*sin(2*PI*{root * 1.5:.2f}*t)"
        f"+0.08*sin(2*PI*{root * 2:.2f}*t)"
        f"+0.05*sin(2*PI*{root * 3:.2f}*t)':"
        f"s=48000:d={duration + 0.5:.3f}"
    )
    sub = f"aevalsrc='0.55*sin(2*PI*{root / 2:.2f}*t)':s=48000:d={duration + 0.5:.3f}"

    args = ["-f", "lavfi", "-i", pad, "-f", "lavfi", "-i", sub]
    chain = (
        f"[1:a]lowpass=f=1100,tremolo=f=0.35:d=0.28,"
        f"afade=t=in:st=0:d={fade_in:.3f},"
        f"afade=t=out:st={max(0.0, duration - fade_out):.3f}:d={fade_out:.3f}[pad];"
        f"[2:a]lowpass=f=160,"
        f"afade=t=in:st={max(0.0, swell_at - 1.4):.3f}:d=1.4,"
        f"afade=t=out:st={swell_at + 0.5:.3f}:d=1.8[sub];"
        f"[pad][sub]amix=inputs=2:duration=first:normalize=0,"
        f"alimiter=limit=0.9,loudnorm=I={lufs}:TP=-1.5:LRA=11,"
        f"aformat=sample_rates=48000:channel_layouts=stereo[a]"
    )
    return args, chain


def finish(
    edl: EDL, pack: StylePack, assembly: str, dest: str, cfg: RenderConfig,
    workdir: str, progress: Progress = None,
) -> str:
    if progress:
        progress("grading, typesetting and mixing")

    video_chain = grade_chain(pack, intensity=edl.grade_intensity)
    video_chain += captions.title_filters(edl, pack, workdir, on_warning=progress)
    video_chain.append("format=yuv420p")
    filters = [f"[0:v]{','.join(video_chain)}[v]"]

    audio_args, audio_chain = _music_inputs(edl, pack, cfg)
    if audio_chain:
        filters.append(audio_chain)

    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    args = [
        "-y", "-i", assembly, *audio_args,
        "-filter_complex", ";".join(filters),
        "-map", "[v]",
    ]
    if audio_chain:
        args += ["-map", "[a]", "-c:a", "aac", "-b:a", cfg.audio_bitrate]
    args += [
        "-c:v", "libx264", "-preset", cfg.preset, "-crf", str(cfg.crf),
        "-pix_fmt", "yuv420p", "-r", str(edl.fps),
        "-shortest",
        *(["-threads", str(cfg.threads)] if cfg.threads else []),
        "-movflags", "+faststart", dest,
    ]
    run(args)
    return dest


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------
def render(
    edl: EDL,
    pack: StylePack,
    dest: str,
    cfg: Optional[RenderConfig] = None,
    progress: Progress = None,
) -> str:
    """Render an EDL to ``dest``. Returns the output path."""
    cfg = cfg or RenderConfig()
    workdir = cfg.workdir or os.path.join(
        os.path.dirname(os.path.abspath(dest)), ".autocut", edl.aspect.replace(":", "x")
    )
    os.makedirs(workdir, exist_ok=True)

    segments = render_segments(edl, pack, cfg, workdir, progress)
    assembly = assemble(edl, segments, workdir, cfg, progress)
    out = finish(edl, pack, assembly, dest, cfg, workdir, progress)

    if not cfg.keep_intermediates:
        shutil.rmtree(workdir, ignore_errors=True)
    if progress:
        info = probe(out)
        progress(f"wrote {out} ({info.duration:.2f}s, {info.width}x{info.height})")
    return out
