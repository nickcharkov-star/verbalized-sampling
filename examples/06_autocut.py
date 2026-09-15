"""autocut: a brief in plain English, finished masters out.

Runs the whole pipeline without a shoot — synthetic rushes are generated first,
so this script works on a clean checkout with nothing but ffmpeg installed:

    python examples/06_autocut.py

Pass a folder of campaign stills to cut from real frames instead:

    python examples/06_autocut.py --stills ./campaign
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from autocut import RenderConfig, StylePack, ingest_rushes, parse_brief, render
from autocut.demo import build as build_rushes
from autocut.ingest import apply_role_overrides
from autocut.plan import plan, plan_variants

BRIEF = (
    'Cut a 20s vertical Reels teaser for Domain Black. Moody and slow, '
    'editorial. Open on the model. tagline: "it\'s yours", brand: "DOMAIN BLACK"'
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stills", help="folder of campaign stills to build rushes from")
    parser.add_argument("--out", default="autocut_example")
    parser.add_argument("--brief", default=BRIEF)
    args = parser.parse_args()

    rushes = os.path.join(args.out, "rushes")
    log = lambda msg: print(f"  {msg}")  # noqa: E731

    # ------------------------------------------------------------------ 0
    if not os.path.isdir(rushes) or not os.listdir(rushes):
        print("\n[0/4] generating stand-in rushes")
        build_rushes(rushes, stills=args.stills, progress=log)

    # ------------------------------------------------------------------ 1
    print("\n[1/4] analysing the rushes")
    shots = ingest_rushes(rushes)
    for shot in shots:
        print(f"  {shot.id:34s} {shot.role:8s} conf={shot.role_confidence:.2f} "
              f"{shot.duration:5.2f}s")

    # The classifier is a first pass, not an oracle. In production you lock the
    # roles that matter — by naming rushes `A012_product_02.mov`, or like this:
    locked = {"endcard_logo": "logo"}
    changed = apply_role_overrides(shots, locked)
    if changed:
        print(f"  locked {changed} role(s) by hand")

    # ------------------------------------------------------------------ 2
    print("\n[2/4] reading the brief")
    brief = parse_brief(args.brief)
    print(f"  {brief.summary()}")

    # ------------------------------------------------------------------ 3
    print("\n[3/4] planning the cut")
    pack = StylePack.load(brief.style)
    edl = plan(shots, brief, pack, project="example")
    print(edl.describe())

    # Several distinct readings of the same brief, to choose between:
    others = plan_variants(shots, brief, pack, k=3)
    print(f"\n  {len(others)} variants planned; "
          f"lengths {[round(v.duration, 2) for v in others]}")

    # ------------------------------------------------------------------ 4
    print("\n[4/4] rendering")
    cfg = RenderConfig(workdir=os.path.join(args.out, ".autocut"))
    for aspect in ("9:16", "1:1"):
        target = edl if aspect == edl.aspect else edl.retarget(aspect)
        dest = os.path.join(args.out, f"example_{aspect.replace(':', 'x')}.mp4")
        cfg.workdir = os.path.join(args.out, ".autocut", aspect.replace(":", "x"))
        render(target, pack, dest, cfg, progress=log)

    edl_path = os.path.join(args.out, "example.edl.json")
    edl.save(edl_path)
    print(f"\ndone. edit {edl_path} by hand and re-render — cached segments make it quick.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
