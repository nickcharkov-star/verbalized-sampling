"""One real render, small and fast, so the whole chain stays honest.

Skipped automatically when no ffmpeg is available.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest

from autocut.brief import parse
from autocut.demo import procedural
from autocut.ffmpeg import FFmpegNotFound, ffmpeg_bin, probe
from autocut.ingest import ingest
from autocut.plan import plan
from autocut.render import RenderConfig, _even, render
from autocut.style import StylePack

try:
    ffmpeg_bin()
    HAVE_FFMPEG = True
except FFmpegNotFound:
    HAVE_FFMPEG = False

pytestmark = pytest.mark.skipif(not HAVE_FFMPEG, reason="ffmpeg is not installed")

W, H, FPS = 256, 456, 24
CANVAS = 384  # longest edge for test renders: full 1080p masters here buy nothing


def downscale(edl):
    """Render the real graph on a small canvas — same code path, seconds not minutes."""
    scale = CANVAS / max(edl.width, edl.height)
    edl.width = max(2, _even(edl.width * scale))
    edl.height = max(2, _even(edl.height * scale))
    return edl


def aspect_of(info):
    return round(info.width / info.height, 3)


@pytest.fixture(scope="module")
def rushes(tmp_path_factory):
    out = tmp_path_factory.mktemp("rushes")
    procedural(str(out), fps=FPS, width=W, height=H)
    return str(out)


@pytest.fixture(scope="module")
def shotlist(rushes):
    shots = ingest(rushes)
    assert len(shots) >= 6
    return shots


def test_cuts_are_detected_at_real_shot_boundaries(rushes, tmp_path):
    """A spliced clip must come back apart at exactly the splice points.

    Regression test: the scene-score metadata arrives on stdout, not stderr,
    and reading the wrong stream makes detection silently find nothing — every
    file becomes one long take and nobody notices until the cut is lifeless.
    """
    from autocut.ffmpeg import concat_demuxer_file, run
    from autocut.ingest import detect_cuts, segment

    sources = sorted(Path(rushes).glob("plate0[1-3]_*.mp4"))[:3]
    assert len(sources) == 3
    listfile = concat_demuxer_file([str(p) for p in sources], str(tmp_path / "list.txt"))
    spliced = tmp_path / "spliced.mp4"
    run(["-y", "-f", "concat", "-safe", "0", "-i", listfile, "-c", "copy", str(spliced)])

    boundaries = []
    elapsed = 0.0
    for src in sources[:-1]:
        elapsed += probe(str(src)).duration
        boundaries.append(elapsed)

    cuts = detect_cuts(str(spliced))
    assert cuts, "no shot boundaries found in a clip that is three shots long"
    found = [t for t, _score in cuts]
    for boundary in boundaries:
        assert any(abs(t - boundary) < 0.35 for t in found), f"missed the cut at {boundary:.2f}s"

    shots = segment(probe(str(spliced)), cuts)
    assert len(shots) >= 3


def test_ingest_describes_every_clip(shotlist):
    assert all(s.duration > 0 for s in shotlist)
    assert all(s.role for s in shotlist)
    assert {s.role for s in shotlist} & {"texture", "product", "macro", "talent", "gesture", "logo"}


def test_a_full_render_lands_on_spec(shotlist, tmp_path):
    pack = StylePack.load("editorial_luxury")
    brief = parse('8s vertical teaser, tagline: "it\'s yours", brand: "DOMAIN BLACK"')
    brief.fps = FPS
    edl = downscale(plan(shotlist, brief, pack, project="e2e"))

    dest = tmp_path / "e2e.mp4"
    render(
        edl, pack, str(dest),
        RenderConfig(crf=32, preset="ultrafast", workdir=str(tmp_path / "work")),
    )

    assert dest.exists() and dest.stat().st_size > 0
    info = probe(str(dest))
    # the sold duration, to the frame — a :08 that runs 8.4s is a reject
    assert abs(info.duration - 8.0) < 1.5 / FPS
    assert info.has_audio
    # the canvas comes from the EDL, not from the rushes
    assert (info.width, info.height) == (edl.width, edl.height)


def test_retargeting_reuses_the_cut_on_a_new_canvas(shotlist, tmp_path):
    pack = StylePack.load("editorial_luxury")
    brief = parse("6s square film")
    brief.fps = FPS
    edl = downscale(plan(shotlist, brief, pack, project="e2e_square"))

    dest = tmp_path / "square.mp4"
    render(edl, pack, str(dest), RenderConfig(crf=34, preset="ultrafast",
                                              silent=True, workdir=str(tmp_path / "w1")))
    wide = downscale(edl.retarget("16:9"))
    dest_wide = tmp_path / "wide.mp4"
    render(wide, pack, str(dest_wide), RenderConfig(crf=34, preset="ultrafast",
                                                    silent=True, workdir=str(tmp_path / "w2")))

    square, landscape = probe(str(dest)), probe(str(dest_wide))
    assert aspect_of(square) == pytest.approx(1.0, abs=0.02)
    assert aspect_of(landscape) == pytest.approx(16 / 9, abs=0.02)
    assert abs(square.duration - landscape.duration) < 0.1


def test_the_inset_reframe_actually_renders(shotlist, tmp_path):
    """The fit graph uses split/overlay, so only a real render proves it links."""
    pack = StylePack.load("editorial_luxury")
    brief = parse("6s film")
    brief.fps = FPS
    edl = downscale(plan(shotlist, brief, pack, project="fit").retarget("16:9"))

    dest = tmp_path / "fit.mp4"
    render(edl, pack, str(dest), RenderConfig(crf=34, preset="ultrafast", silent=True,
                                              reframe="fit", workdir=str(tmp_path / "w")))
    info = probe(str(dest))
    assert aspect_of(info) == pytest.approx(16 / 9, abs=0.02)
    assert abs(info.duration - 6.0) < 1.5 / FPS


def test_auto_reframe_insets_vertical_rushes_in_a_landscape_master(shotlist, tmp_path):
    from autocut.render import choose_reframe, clip_graph

    pack = StylePack.load("editorial_luxury")
    brief = parse("6s film")
    brief.fps = FPS
    edl = plan(shotlist, brief, pack, project="auto_fit").retarget("16:9")

    # the demo rushes are vertical; a landscape master must not crop them
    _graph, mode = clip_graph(edl.clips[0], edl, pack, RenderConfig(reframe="auto"))
    assert mode == "fit"
    assert choose_reframe("auto", (W, H), (edl.width, edl.height)) == "fit"


def test_segments_are_cached_between_renders(shotlist, tmp_path):
    pack = StylePack.load("editorial_luxury")
    brief = parse("6s vertical film")
    brief.fps = FPS
    edl = downscale(plan(shotlist, brief, pack, project="cache"))
    work = tmp_path / "work"

    messages = []
    cfg = RenderConfig(crf=34, preset="ultrafast", silent=True, workdir=str(work))

    def segments(log):
        # only the per-segment lines; the "wrote <path>" line carries the
        # temp directory, whose name happens to contain this test's name
        return [m for m in log if m.startswith("segment ")]

    render(edl, pack, str(tmp_path / "a.mp4"), cfg, progress=messages.append)
    assert segments(messages)
    assert not any("cached" in m for m in segments(messages))

    messages.clear()
    render(edl, pack, str(tmp_path / "b.mp4"), cfg, progress=messages.append)
    assert sum("cached" in m for m in segments(messages)) == len(edl.clips)


def test_the_cli_runs_the_whole_thing(rushes, tmp_path):
    from autocut.cli import main

    code = main([
        "auto", '6s vertical teaser, brand: "DOMAIN BLACK"',
        "--rushes", rushes,
        "--out", str(tmp_path / "out"),
        "--project", "cli",
        "--fps", str(FPS),
        "--crf", "34", "--preset", "ultrafast", "--silent", "--quiet",
    ])
    assert code == 0
    video = tmp_path / "out" / "cli_9x16.mp4"
    assert video.exists()
    assert (tmp_path / "out" / "cli.manifest.json").exists()
    assert (tmp_path / "out" / "cli.edl.json").exists()
