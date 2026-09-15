"""ffmpeg/ffprobe discovery and thin execution helpers.

Everything in autocut shells out to ffmpeg. Nothing else is required at
runtime: no OpenCV, no numpy, no cloud media service. We resolve a binary in
this order:

1. ``AUTOCUT_FFMPEG`` / ``AUTOCUT_FFPROBE`` environment variables
2. ``ffmpeg`` / ``ffprobe`` on ``$PATH``
3. the static build vendored by the ``imageio-ffmpeg`` wheel
"""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from typing import List, Optional, Sequence


class FFmpegNotFound(RuntimeError):
    pass


class FFmpegError(RuntimeError):
    """Raised when ffmpeg exits non-zero. Carries the tail of stderr."""

    def __init__(self, args: Sequence[str], returncode: int, stderr: str):
        self.args_list = list(args)
        self.returncode = returncode
        self.stderr = stderr
        tail = "\n".join(stderr.strip().splitlines()[-18:])
        super().__init__(f"ffmpeg exited {returncode}\n{tail}")


@lru_cache(maxsize=1)
def ffmpeg_bin() -> str:
    env = os.environ.get("AUTOCUT_FFMPEG")
    if env:
        return env
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:  # pragma: no cover - environment specific
        raise FFmpegNotFound(
            "ffmpeg not found. Install it (`apt install ffmpeg`), or "
            "`pip install imageio-ffmpeg`, or set AUTOCUT_FFMPEG."
        ) from exc


@lru_cache(maxsize=1)
def ffprobe_bin() -> Optional[str]:
    """ffprobe is optional: the imageio-ffmpeg wheel ships ffmpeg only."""
    env = os.environ.get("AUTOCUT_FFPROBE")
    if env:
        return env
    return shutil.which("ffprobe")


def run(
    args: Sequence[str], *, capture: bool = True, check: bool = True
) -> subprocess.CompletedProcess:
    """Run ffmpeg with the given argument list (binary is prepended)."""
    cmd = [ffmpeg_bin(), "-hide_banner", "-nostdin", *args]
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=False,
    )
    if check and proc.returncode != 0:
        stderr = (proc.stderr or b"").decode("utf-8", "replace")
        raise FFmpegError(cmd, proc.returncode, stderr)
    return proc


def run_stderr(args: Sequence[str]) -> str:
    """Run ffmpeg and return stderr as text (where filter metadata is printed)."""
    proc = run(args, capture=True, check=False)
    return (proc.stderr or b"").decode("utf-8", "replace")


def run_stdout(args: Sequence[str]) -> str:
    """Run ffmpeg and return stdout as text.

    The ``metadata=print:file=-`` filter writes to *stdout*, not stderr — which
    is where per-frame analysis results such as scene scores arrive.
    """
    proc = run(args, capture=True, check=False)
    return (proc.stdout or b"").decode("utf-8", "replace")


def raw_frames(args: Sequence[str]) -> bytes:
    """Run ffmpeg and return stdout bytes (raw pixel data)."""
    return run(args, capture=True, check=True).stdout or b""


@dataclass(frozen=True)
class MediaInfo:
    path: str
    duration: float
    width: int
    height: int
    fps: float
    has_audio: bool

    @property
    def aspect(self) -> float:
        return self.width / self.height if self.height else 0.0


def _probe_with_ffprobe(path: str, probe: str) -> Optional[MediaInfo]:
    import json

    cmd = [
        probe, "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        return None
    data = json.loads(proc.stdout.decode("utf-8", "replace"))
    video = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    if video is None:
        return None
    has_audio = any(s.get("codec_type") == "audio" for s in data.get("streams", []))
    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0.0)
    num, _, den = (video.get("avg_frame_rate") or "0/1").partition("/")
    try:
        fps = float(num) / float(den) if float(den) else 0.0
    except (ValueError, ZeroDivisionError):
        fps = 0.0
    return MediaInfo(
        path=path,
        duration=duration,
        width=int(video.get("width") or 0),
        height=int(video.get("height") or 0),
        fps=fps or 30.0,
        has_audio=has_audio,
    )


def _probe_with_ffmpeg(path: str) -> MediaInfo:
    """Fallback probe: parse ffmpeg's own stream banner from stderr."""
    import re

    text = run_stderr(["-i", path, "-f", "null", "-"])
    width = height = 0
    fps = 30.0
    duration = 0.0
    has_audio = "Audio:" in text

    m = re.search(r"Video:.*?,\s*(\d{2,5})x(\d{2,5})", text)
    if m:
        width, height = int(m.group(1)), int(m.group(2))
    m = re.search(r"(\d+(?:\.\d+)?)\s*fps", text)
    if m:
        fps = float(m.group(1))
    # Prefer the decoded frame count: for the constant-rate material autocut
    # produces it is exact, whereas the final "time=" in the progress line is
    # the last frame's timestamp and lands up to a frame short.
    frames = re.findall(r"frame=\s*(\d+)", text)
    if frames and fps > 0:
        duration = int(frames[-1]) / fps
    else:
        times = re.findall(r"time=(\d+):(\d\d):(\d\d(?:\.\d+)?)", text)
        if times:
            h, mm, s = times[-1]
            duration = int(h) * 3600 + int(mm) * 60 + float(s)
    if not width or not height:
        raise FFmpegError([path], 1, f"could not determine video size for {path}\n{text[-800:]}")
    return MediaInfo(path, duration, width, height, fps, has_audio)


def probe(path: str) -> MediaInfo:
    """Return duration/size/fps for a media file."""
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    probe_exe = ffprobe_bin()
    if probe_exe:
        info = _probe_with_ffprobe(path, probe_exe)
        if info and info.duration > 0:
            return info
    return _probe_with_ffmpeg(path)


def concat_demuxer_file(segments: Sequence[str], dest: str) -> str:
    """Write a concat-demuxer list file for hard-cut assembly."""
    with open(dest, "w", encoding="utf-8") as fh:
        for seg in segments:
            fh.write(f"file '{os.path.abspath(seg)}'\n")
    return dest


def font_file(preferred: Optional[Sequence[str]] = None) -> Optional[str]:
    """Resolve a usable .ttf for drawtext, honouring brand-kit preferences."""
    candidates: List[str] = list(preferred or [])
    candidates += [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerif.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return None
