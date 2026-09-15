"""Synthetic rushes, so the whole pipeline can be exercised without a shoot.

Two modes:

* ``from_stills`` turns campaign stills into moving rushes — each still yields a
  wide take, a macro select and a backdrop select, which is enough material for
  the planner to build a real arc from.
* ``procedural`` needs no assets at all: it generates footage whose photometry
  deliberately lands in each editorial role, so ``autocut`` is testable in CI.

Neither is a substitute for rushes. Both are enough to prove the pipeline.
"""

from __future__ import annotations

import os
from typing import List, Optional, Sequence, Tuple

from .ffmpeg import run

STILL_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}

# (label, crop_w, crop_h, crop_x, crop_y, zoom_from, zoom_to, seconds)
STILL_RECIPES: Sequence[Tuple[str, float, float, float, float, float, float, float]] = (
    ("wide",    1.00, 1.00, 0.00, 0.00, 1.00, 1.07, 6.0),
    ("select",  0.46, 0.46, 0.27, 0.22, 1.02, 1.12, 5.0),
    ("ground",  0.42, 0.42, 0.02, 0.02, 1.00, 1.05, 4.5),
)


def find_stills(root: str) -> List[str]:
    if os.path.isfile(root):
        return [root]
    out: List[str] = []
    for dirpath, _dirs, files in os.walk(root):
        for name in sorted(files):
            if os.path.splitext(name)[1].lower() in STILL_EXTS:
                out.append(os.path.join(dirpath, name))
    return sorted(out)


def _ken_burns(
    src: str, dest: str, *, crop: Tuple[float, float, float, float],
    zoom: Tuple[float, float], seconds: float, fps: int, width: int, height: int,
) -> str:
    cw, ch, cx, cy = crop
    z0, z1 = zoom
    frames = max(2, int(round(seconds * fps)))
    # supersample before zoompan for the same anti-stutter reason as the renderer
    sw, sh = int(width * 1.8) // 2 * 2, int(height * 1.8) // 2 * 2
    vf = (
        f"crop=iw*{cw}:ih*{ch}:iw*{cx}:ih*{cy},"
        f"scale={sw}:{sh}:force_original_aspect_ratio=increase:flags=lanczos,"
        f"crop={sw}:{sh},"
        f"zoompan=z='{z0}+{z1 - z0:.4f}*on/{frames - 1}':"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={width}x{height}:fps={fps},"
        f"setsar=1,format=yuv420p"
    )
    run([
        "-y", "-loop", "1", "-i", src, "-t", f"{seconds:.3f}",
        "-vf", vf, "-r", str(fps),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
        "-pix_fmt", "yuv420p", dest,
    ])
    return dest


def from_stills(
    stills: str, out_dir: str, *, fps: int = 30, width: int = 1080, height: int = 1920,
    progress=None,
) -> List[str]:
    """Build rushes from campaign stills."""
    sources = find_stills(stills)
    if not sources:
        raise FileNotFoundError(f"no stills under {stills}")
    os.makedirs(out_dir, exist_ok=True)

    made: List[str] = []
    for i, src in enumerate(sources):
        for label, cw, ch, cx, cy, z0, z1, secs in STILL_RECIPES:
            dest = os.path.join(out_dir, f"plate{i + 1:02d}_{label}.mp4")
            if progress:
                progress(f"rushes: {os.path.basename(dest)}")
            _ken_burns(
                src, dest, crop=(cw, ch, cx, cy), zoom=(z0, z1),
                seconds=secs, fps=fps, width=width, height=height,
            )
            made.append(dest)
    made.append(endcard_plate(out_dir, fps=fps, width=width, height=height, progress=progress))
    return made


def endcard_plate(
    out_dir: str, *, fps: int = 30, width: int = 1080, height: int = 1920,
    seconds: float = 4.0, progress=None,
) -> str:
    """A clean plate for the end card. Named so the role hint picks it up."""
    dest = os.path.join(out_dir, "endcard_logo.mp4")
    if progress:
        progress(f"rushes: {os.path.basename(dest)}")
    run([
        "-y",
        "-f", "lavfi", "-i", f"color=c=0x0B0907:s={width}x{height}:r={fps}:d={seconds}",
        "-vf",
        "drawbox=x=0:y=0:w=iw:h=ih:color=0x141010@1:t=fill,"
        "vignette=a=0.5,noise=alls=3:allf=t,setsar=1,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", dest,
    ])
    return dest


# ---------------------------------------------------------------------------
# fully synthetic rushes (no assets required)
# ---------------------------------------------------------------------------
def _lavfi_clip(dest: str, source: str, chain: str, seconds: float, fps: int) -> str:
    run([
        "-y", "-f", "lavfi", "-i", source,
        "-t", f"{seconds:.3f}",
        "-vf", f"{chain},setsar=1,format=yuv420p",
        "-r", str(fps),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", dest,
    ])
    return dest


def procedural(
    out_dir: str, *, fps: int = 30, width: int = 1080, height: int = 1920, progress=None,
) -> List[str]:
    """Generate footage whose photometry lands in each editorial role."""
    os.makedirs(out_dir, exist_ok=True)
    size = f"{width}x{height}"
    recipes = [
        # name, lavfi source, filter chain, seconds
        ("plate01_wide", f"color=c=0xC08A63:s={size}:r={fps}",
         "noise=alls=8:allf=t,boxblur=6:1,vignette=a=0.4", 6.0),
        ("plate02_wide", f"color=c=0x8A5C3C:s={size}:r={fps}",
         "noise=alls=10:allf=t,boxblur=8:1,vignette=a=0.35", 5.0),
        ("plate03_select", f"gradients=s={size}:r={fps}:c0=0xD9B48F:c1=0x7A5232:speed=0.006",
         "boxblur=10:1", 5.5),
        ("plate04_ground", f"gradients=s={size}:r={fps}:c0=0xC8A277:c1=0xA07B52:speed=0.003",
         "boxblur=18:2", 5.0),
        ("plate05_select", f"color=c=0x120E0B:s={size}:r={fps}",
         "drawbox=x=iw*0.3:y=ih*0.34:w=iw*0.4:h=ih*0.32:color=0xE2542A@1:t=fill,"
         "drawbox=x=iw*0.36:y=ih*0.40:w=iw*0.28:h=ih*0.06:color=0xC9A227@1:t=fill,"
         "boxblur=2:1,vignette=a=0.45", 5.5),
        ("plate06_select", f"color=c=0x141110:s={size}:r={fps}",
         "drawbox=x=iw*0.32:y=ih*0.30:w=iw*0.36:h=ih*0.38:color=0x2B4FB0@1:t=fill,"
         "noise=alls=14:allf=t,boxblur=1:1,vignette=a=0.4", 5.0),
        ("plate07_macro", f"mandelbrot=s={size}:r={fps}:maxiter=90",
         "eq=saturation=0.35:contrast=1.2,colorbalance=rm=0.18:bm=-0.12,boxblur=1:1", 5.0),
    ]
    made: List[str] = []
    for name, source, chain, secs in recipes:
        dest = os.path.join(out_dir, f"{name}.mp4")
        if progress:
            progress(f"rushes: {os.path.basename(dest)}")
        made.append(_lavfi_clip(dest, source, chain, secs, fps))
    made.append(endcard_plate(out_dir, fps=fps, width=width, height=height, progress=progress))
    return made


def build(
    out_dir: str, *, stills: Optional[str] = None, fps: int = 30,
    width: int = 1080, height: int = 1920, progress=None,
) -> List[str]:
    if stills:
        return from_stills(stills, out_dir, fps=fps, width=width, height=height, progress=progress)
    return procedural(out_dir, fps=fps, width=width, height=height, progress=progress)
