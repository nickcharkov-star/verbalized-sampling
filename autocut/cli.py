"""``autocut`` command line: analyze -> plan -> render, or all three at once.

Deliberately argparse-only. The whole point of this tool is that a producer can
run it on a laptop or a build box with nothing but Python and ffmpeg, so it
must not drag in the research stack. The LLM planner is imported lazily and
only when asked for.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import List, Optional, Sequence

from . import __version__
from .brief import Brief, merge, parse
from .demo import build as build_demo
from .ffmpeg import FFmpegError, FFmpegNotFound
from .ingest import ShotList, apply_role_overrides, ingest, load_role_overrides
from .plan import EDL, PlanError, plan, plan_variants, plan_verbalized
from .render import RenderConfig, render
from .style import ASPECTS, StylePack, available


# ---------------------------------------------------------------------------
# console
# ---------------------------------------------------------------------------
class Console:
    def __init__(self, quiet: bool = False):
        self.quiet = quiet
        self._t0 = time.time()

    def __call__(self, message: str) -> None:
        if not self.quiet:
            print(f"  [{time.time() - self._t0:5.1f}s] {message}", file=sys.stderr, flush=True)

    def head(self, message: str) -> None:
        if not self.quiet:
            print(f"\n{message}", file=sys.stderr, flush=True)

    def warn(self, message: str) -> None:
        print(f"  ! {message}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# shared helpers
# ---------------------------------------------------------------------------
def _brief_from_args(args: argparse.Namespace) -> Brief:
    text = getattr(args, "brief", "") or ""
    if getattr(args, "brief_file", None):
        with open(args.brief_file, encoding="utf-8") as fh:
            text = (text + "\n" + fh.read()).strip()
    base = parse(text)
    copy = {}
    for key in ("tagline", "endcard", "product"):
        value = getattr(args, key, None)
        if value:
            copy[key] = value
    overrides = {
        "duration": getattr(args, "duration", None),
        "fps": getattr(args, "fps", None),
        "bpm": getattr(args, "bpm", None),
        "style": getattr(args, "style", None),
        "brand": getattr(args, "brand", None),
        "aspects": list(args.aspect) if getattr(args, "aspect", None) else None,
        "copy": copy or None,
    }
    return merge(base, overrides)


def _load_shots(path: str, console: Console) -> ShotList:
    shots = ShotList.load(path)
    if not len(shots):
        raise SystemExit(f"shot list {path} is empty")
    console(f"loaded {len(shots)} shots from {path}")
    return shots


def _roles_table(shots: ShotList) -> str:
    counts: dict = {}
    for shot in shots:
        counts[shot.role] = counts.get(shot.role, 0) + 1
    return ", ".join(f"{role}×{n}" for role, n in sorted(counts.items(), key=lambda kv: -kv[1]))


# ---------------------------------------------------------------------------
# commands
# ---------------------------------------------------------------------------
def cmd_styles(args: argparse.Namespace) -> int:
    for name in available():
        pack = StylePack.load(name)
        print(f"{name}\n    {pack.description}")
        print(f"    {pack.bpm:g}bpm · {len(pack.arc)} beats · "
              f"{pack.dissolve_budget} dissolve(s) · arc: {' → '.join(b.name for b in pack.arc)}\n")
    print("aspects: " + ", ".join(f"{a} ({w}x{h})" for a, (w, h) in ASPECTS.items()))
    return 0


def cmd_demo(args: argparse.Namespace) -> int:
    console = Console(args.quiet)
    console.head(f"generating demo rushes in {args.out}")
    clips = build_demo(args.out, stills=args.stills, fps=args.fps, progress=console)
    console(f"{len(clips)} clips written")
    print(args.out)
    return 0


def cmd_analyze(args: argparse.Namespace) -> int:
    console = Console(args.quiet)
    console.head(f"analysing rushes in {args.rushes}")
    shots = ingest(
        args.rushes,
        threshold=args.threshold,
        min_shot=args.min_shot,
        max_shot=args.max_shot,
        on_progress=lambda path, n: console(f"{os.path.basename(path)} → {n} shots so far"),
    )
    if args.roles:
        changed = apply_role_overrides(shots, load_role_overrides(args.roles))
        console(f"applied {changed} role override(s) from {args.roles}")
    shots.save(args.out)
    console(f"{len(shots)} shots · {_roles_table(shots)}")
    if args.print:
        for shot in shots:
            print(f"{shot.id:38s} {shot.role:8s} conf={shot.role_confidence:.2f} "
                  f"{shot.duration:5.2f}s  subject={shot.subject:.2f} accent={shot.accent:+.3f} "
                  f"detail={shot.detail:.3f}")
    print(args.out)
    return 0


def _plan_many(
    shots: ShotList, brief: Brief, pack: StylePack, args: argparse.Namespace, console: Console
) -> List[EDL]:
    aspect = brief.aspects[0] if brief.aspects else "9:16"
    if getattr(args, "llm", False):
        console("eliciting edit plans via verbalized sampling")
        return plan_verbalized(
            shots, brief, pack, k=args.variants, aspect=aspect,
            project=args.project, seed=args.seed, model=getattr(args, "model", None),
            on_warning=console.warn,
        )
    if args.variants > 1:
        return plan_variants(shots, brief, pack, k=args.variants, aspect=aspect,
                             project=args.project, seed=args.seed)
    return [plan(shots, brief, pack, aspect=aspect, project=args.project, seed=args.seed)]


def cmd_plan(args: argparse.Namespace) -> int:
    console = Console(args.quiet)
    shots = _load_shots(args.shots, console)
    brief = _brief_from_args(args)
    pack = StylePack.load(brief.style)
    console.head(f"planning: {brief.summary()}")

    edls = _plan_many(shots, brief, pack, args, console)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)

    written: List[str] = []
    for i, edl in enumerate(edls):
        dest = args.out if i == 0 else _suffixed(args.out, f"_v{i + 1}")
        edl.save(dest)
        written.append(dest)
        console(f"variant {i + 1}: {len(edl.clips)} clips · {edl.duration:.2f}s · "
                f"confidence {edl.meta.get('confidence')} · {dest}")
        if args.print:
            print(edl.describe())
            print()
    for path in written:
        print(path)
    return 0


def _suffixed(path: str, suffix: str) -> str:
    stem, ext = os.path.splitext(path)
    return f"{stem}{suffix}{ext}"


def cmd_render(args: argparse.Namespace) -> int:
    console = Console(args.quiet)
    edl = EDL.load(args.edl)
    pack = StylePack.load(args.style or edl.style)
    cfg = RenderConfig(
        crf=args.crf, preset=args.preset, music=args.music,
        music_offset=args.music_offset, silent=args.silent,
        keep_intermediates=not args.clean, threads=args.threads,
    )
    outputs: List[str] = []
    aspects = args.aspect or [edl.aspect]
    for aspect in aspects:
        target = edl if aspect == edl.aspect else edl.retarget(aspect)
        suffix = f"_{aspect.replace(':', 'x')}"
        dest = args.out if len(aspects) == 1 else _suffixed(args.out, suffix)
        console.head(f"rendering {aspect} → {dest}")
        outputs.append(render(target, pack, dest, cfg, progress=console))
    for path in outputs:
        print(path)
    return 0


def cmd_auto(args: argparse.Namespace) -> int:
    """Brief in, masters out."""
    console = Console(args.quiet)
    os.makedirs(args.out, exist_ok=True)

    shots_path = args.shots or os.path.join(args.out, "shots.json")
    if args.shots and os.path.exists(args.shots):
        shots = _load_shots(args.shots, console)
    else:
        console.head(f"analysing rushes in {args.rushes}")
        shots = ingest(
            args.rushes, threshold=args.threshold,
            on_progress=lambda path, n: console(f"{os.path.basename(path)} → {n} shots so far"),
        )
        if args.roles:
            changed = apply_role_overrides(shots, load_role_overrides(args.roles))
            console(f"applied {changed} role override(s) from {args.roles}")
        shots.save(shots_path)
        console(f"{len(shots)} shots · {_roles_table(shots)}")

    brief = _brief_from_args(args)
    pack = StylePack.load(brief.style)
    console.head(f"planning: {brief.summary()}")
    edls = _plan_many(shots, brief, pack, args, console)

    cfg = RenderConfig(
        crf=args.crf, preset=args.preset, music=args.music,
        music_offset=args.music_offset, silent=args.silent,
        keep_intermediates=not args.clean, threads=args.threads,
        workdir=os.path.join(args.out, ".autocut"),
    )

    manifest = {
        "brief": brief.to_dict(),
        "style": pack.name,
        "shots": shots_path,
        "deliverables": [],
    }
    keep = edls[: max(1, args.keep)]
    for i, edl in enumerate(keep):
        tag = "" if len(keep) == 1 else f"_v{i + 1}"
        edl_path = os.path.join(args.out, f"{args.project}{tag}.edl.json")
        edl.save(edl_path)
        console.head(f"variant {i + 1}/{len(keep)} · {edl.duration:.2f}s · {edl_path}")
        if args.print:
            print(edl.describe())
        for aspect in brief.aspects:
            target = edl if aspect == edl.aspect else edl.retarget(aspect)
            dest = os.path.join(
                args.out, f"{args.project}{tag}_{aspect.replace(':', 'x')}.mp4"
            )
            cfg.workdir = os.path.join(args.out, ".autocut", aspect.replace(":", "x"))
            console.head(f"rendering {aspect} → {os.path.basename(dest)}")
            render(target, pack, dest, cfg, progress=console)
            manifest["deliverables"].append({
                "variant": i + 1, "aspect": aspect, "edl": edl_path,
                "video": dest, "duration": round(target.duration, 3),
                "confidence": target.meta.get("confidence"),
                "plan_source": target.meta.get("plan_source"),
            })

    manifest_path = os.path.join(args.out, f"{args.project}.manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
    console.head(f"{len(manifest['deliverables'])} deliverable(s) · manifest {manifest_path}")
    for item in manifest["deliverables"]:
        print(item["video"])
    return 0


# ---------------------------------------------------------------------------
# argument wiring
# ---------------------------------------------------------------------------
def _add_brief_args(sub: argparse.ArgumentParser, *, positional: bool = True) -> None:
    if positional:
        sub.add_argument("brief", nargs="?", default="", help="the brief, in plain English")
    sub.add_argument("--brief-file", help="read (additional) brief text from a file")
    sub.add_argument("--duration", type=float, help="override the delivered duration in seconds")
    sub.add_argument("--aspect", action="append", choices=list(ASPECTS),
                     help="deliverable aspect ratio (repeatable)")
    sub.add_argument("--style", help=f"style pack ({', '.join(available())})")
    sub.add_argument("--fps", type=int, help="frame rate")
    sub.add_argument("--bpm", type=float, help="music tempo the cut is timed to")
    sub.add_argument("--brand", help="brand name for the end card")
    sub.add_argument("--tagline", help="tagline super")
    sub.add_argument("--endcard", help="end card copy")
    sub.add_argument("--product", help="product name super")


def _add_plan_args(sub: argparse.ArgumentParser) -> None:
    sub.add_argument("--variants", type=int, default=1, help="how many distinct cuts to plan")
    sub.add_argument("--seed", type=int, default=0, help="planner seed (same seed => same cut)")
    sub.add_argument("--llm", action="store_true",
                     help="use verbalized sampling to elicit k weighted edit plans")
    sub.add_argument("--model", help="model id for --llm")
    sub.add_argument("--project", default="autocut", help="project slug used in filenames")
    sub.add_argument("--print", action="store_true", help="print the EDL to stdout")


def _add_render_args(sub: argparse.ArgumentParser) -> None:
    sub.add_argument("--crf", type=int, default=18, help="x264 quality (lower is better)")
    sub.add_argument("--preset", default="medium", help="x264 speed preset")
    sub.add_argument("--music", help="music bed; a procedural bed is generated when omitted")
    sub.add_argument("--music-offset", type=float, default=0.0, help="seconds into the music bed")
    sub.add_argument("--silent", action="store_true", help="render without audio")
    sub.add_argument("--clean", action="store_true", help="delete intermediates when done")
    sub.add_argument("--threads", type=int, default=0, help="ffmpeg thread count (0 = auto)")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="autocut",
        description="Prompt-driven editorial video assembly on ffmpeg.",
    )
    parser.add_argument("--version", action="version", version=f"autocut {__version__}")
    parser.add_argument("-q", "--quiet", action="store_true", help="suppress progress output")

    # every subcommand accepts -q too, so flag order never matters
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("-q", "--quiet", action="store_true", help=argparse.SUPPRESS)

    subs = parser.add_subparsers(dest="command", required=True)

    p = subs.add_parser("styles", parents=[common], help="list style packs and aspects")
    p.set_defaults(func=cmd_styles)

    p = subs.add_parser("demo", parents=[common], help="generate stand-in rushes")
    p.add_argument("--out", default="rushes", help="directory to write rushes into")
    p.add_argument("--stills", help="build rushes from a folder of stills instead of synthesising")
    p.add_argument("--fps", type=int, default=30)
    p.set_defaults(func=cmd_demo)

    p = subs.add_parser(
        "analyze", parents=[common], help="detect and describe every shot in the rushes"
    )
    p.add_argument("rushes", help="file or directory of footage")
    p.add_argument("-o", "--out", default="shots.json")
    p.add_argument("--threshold", type=float, default=0.28, help="scene-change sensitivity")
    p.add_argument("--min-shot", type=float, default=0.8)
    p.add_argument("--max-shot", type=float, default=8.0)
    p.add_argument("--roles", help="JSON file locking roles by shot id or file stem")
    p.add_argument("--print", action="store_true")
    p.set_defaults(func=cmd_analyze)

    p = subs.add_parser("plan", parents=[common], help="turn a brief plus a shot list into an EDL")
    _add_brief_args(p)
    p.add_argument("--shots", default="shots.json")
    p.add_argument("-o", "--out", default="edl.json")
    _add_plan_args(p)
    p.set_defaults(func=cmd_plan)

    p = subs.add_parser("render", parents=[common], help="render an EDL to a master")
    p.add_argument("edl")
    p.add_argument("-o", "--out", default="out.mp4")
    p.add_argument("--style", help="override the EDL's style pack")
    p.add_argument("--aspect", action="append", choices=list(ASPECTS),
                   help="render this aspect instead (repeatable)")
    _add_render_args(p)
    p.set_defaults(func=cmd_render)

    p = subs.add_parser("auto", parents=[common], help="brief in, finished masters out")
    _add_brief_args(p)
    p.add_argument("--rushes", required=True, help="file or directory of footage")
    p.add_argument("--shots", help="reuse an existing shot list instead of re-analysing")
    p.add_argument("--out", default="out", help="output directory")
    p.add_argument("--threshold", type=float, default=0.28)
    p.add_argument("--roles", help="JSON file locking roles by shot id or file stem")
    p.add_argument("--keep", type=int, default=1, help="how many planned variants to render")
    _add_plan_args(p)
    _add_render_args(p)
    p.set_defaults(func=cmd_auto)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except FFmpegNotFound as exc:
        print(f"autocut: {exc}", file=sys.stderr)
        return 3
    except (PlanError, FileNotFoundError, ValueError) as exc:
        print(f"autocut: {exc}", file=sys.stderr)
        return 2
    except FFmpegError as exc:
        print(f"autocut: render failed\n{exc}", file=sys.stderr)
        return 4
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
