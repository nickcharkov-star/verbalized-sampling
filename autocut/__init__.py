"""autocut — prompt-driven editorial video assembly built on ffmpeg.

    from autocut import auto_edit
    auto_edit("20s vertical teaser, slow and moody", rushes="./rushes", out="./out")

Or from the shell::

    python -m autocut auto "20s vertical teaser" --rushes ./rushes --out ./out

The pipeline is four stages, each usable on its own:

    ingest  →  ShotList   (what have we got?)
    brief   →  Brief      (what did the director ask for?)
    plan    →  EDL        (what is the cut?)
    render  →  .mp4       (make it)

Only ffmpeg is required. An LLM is optional and only ever proposes shot
selection; timing, transitions and validation stay deterministic.

The convenience exports are named so they do not shadow the submodules they
come from: ``ingest_rushes``, ``plan_cut`` and ``render_edl`` leave
``autocut.ingest``, ``autocut.plan`` and ``autocut.render`` importable.
"""

from __future__ import annotations

__version__ = "0.1.0"

from typing import List, Optional, Sequence

from . import brief, ingest, plan, render, style
from .brief import Brief
from .ingest import Shot, ShotList
from .plan import EDL, PlanError, plan_variants, plan_verbalized
from .render import RenderConfig
from .style import ASPECTS, StylePack

# Public names are bound by assignment rather than `import ... as ...` so that
# `autocut.ingest`, `autocut.plan` and `autocut.render` keep referring to the
# submodules instead of being shadowed by a function of the same name.
parse_brief = brief.parse
ingest_rushes = ingest.ingest
plan_cut = plan.plan
render_edl = render.render
available_styles = style.available

__all__ = [
    "__version__",
    "Brief", "parse_brief",
    "Shot", "ShotList", "ingest_rushes",
    "EDL", "PlanError", "plan_cut", "plan_variants", "plan_verbalized",
    "RenderConfig", "render_edl",
    "StylePack", "ASPECTS", "available_styles",
    "auto_edit",
]


def auto_edit(
    brief: str,
    rushes: str,
    out: str = "out",
    *,
    project: str = "autocut",
    aspects: Optional[Sequence[str]] = None,
    use_llm: bool = False,
    seed: int = 0,
    music: Optional[str] = None,
    progress=None,
) -> List[str]:
    """Brief in, rendered masters out. Returns the paths written."""
    import os

    parsed = parse_brief(brief)
    if aspects:
        parsed.aspects = list(aspects)
    pack = StylePack.load(parsed.style)
    shots = ingest_rushes(rushes)

    if use_llm:
        edl = plan_verbalized(shots, parsed, pack, k=4, project=project, seed=seed)[0]
    else:
        edl = plan_cut(shots, parsed, pack, project=project, seed=seed)

    os.makedirs(out, exist_ok=True)
    edl.save(os.path.join(out, f"{project}.edl.json"))

    cfg = RenderConfig(music=music, workdir=os.path.join(out, ".autocut"))
    written: List[str] = []
    for aspect in parsed.aspects:
        target = edl if aspect == edl.aspect else edl.retarget(aspect)
        dest = os.path.join(out, f"{project}_{aspect.replace(':', 'x')}.mp4")
        cfg.workdir = os.path.join(out, ".autocut", aspect.replace(":", "x"))
        written.append(render_edl(target, pack, dest, cfg, progress=progress))
    return written
