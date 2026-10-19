"""Filtergraph construction. These assert on the ffmpeg command, not on pixels."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest

from autocut.brief import parse
from autocut.plan import Clip, plan
from autocut.render import (
    RenderConfig,
    _even,
    _fingerprint,
    _fit_size,
    _groups,
    _music_inputs,
    choose_reframe,
    clip_filter,
    clip_graph,
    fit_graph,
    motion_filters,
    retained_area,
)
from autocut.style import StylePack


@pytest.fixture
def edl(shots):
    brief = parse('20s vertical film, tagline: "it\'s yours"')
    return plan(shots, brief, StylePack.load("editorial_luxury"))


@pytest.fixture
def pack():
    return StylePack.load("editorial_luxury")


def test_clip_filter_trims_to_the_planned_range(edl, pack):
    clip = edl.clips[0]
    chain = clip_filter(clip, edl, pack)
    assert f"trim=start={clip.src_in:.4f}:end={clip.src_out:.4f}" in chain
    assert "setpts=PTS-STARTPTS" in chain
    assert f"fps={edl.fps}" in chain
    assert chain.endswith("format=yuv420p")


def test_a_speed_ramp_only_appears_when_asked_for(edl, pack):
    clip = edl.clips[0]
    clip.speed = 1.0
    assert "setpts=PTS/" not in clip_filter(clip, edl, pack)
    clip.speed = 0.88
    assert "setpts=PTS/0.88" in clip_filter(clip, edl, pack)


def test_static_framing_uses_no_zoompan(edl, pack):
    clip = Clip(id="c", source="/x.mp4", src_in=0, src_out=2, role="product",
                beat="reveal", motion="static")
    assert "zoompan" not in ",".join(motion_filters(clip, edl, pack))


@pytest.mark.parametrize("motion", ["push", "push_slow", "pull", "drift_left", "drift_right"])
def test_camera_moves_are_expressed_as_zoompan(edl, pack, motion):
    clip = Clip(id="c", source="/x.mp4", src_in=0, src_out=2, role="product",
                beat="reveal", motion=motion)
    chain = ",".join(motion_filters(clip, edl, pack))
    assert "zoompan=" in chain
    assert f"s={edl.width}x{edl.height}" in chain
    assert "setsar=1" in chain


def test_supersampling_keeps_even_dimensions(edl, pack):
    clip = edl.clips[0]
    chain = motion_filters(clip, edl, pack)
    scale = [f for f in chain if f.startswith("scale=")][0]
    w, h = scale.split("=")[1].split(":")[:2]
    assert int(w) % 2 == 0 and int(h) % 2 == 0
    assert int(w) > edl.width  # oversampled before the move, to stop zoompan stuttering


def test_face_framing_biases_the_crop_upwards(edl, pack):
    face = Clip(id="c", source="/x.mp4", src_in=0, src_out=2, role="talent",
                beat="hook", motion="static", crop="face")
    centre = Clip(id="c", source="/x.mp4", src_in=0, src_out=2, role="product",
                  beat="hook", motion="static", crop="center")
    assert "0.320" in ",".join(motion_filters(face, edl, pack))
    assert "0.500" in ",".join(motion_filters(centre, edl, pack))


def test_even_rounding():
    assert _even(1079) == 1080
    assert _even(1080) == 1080
    assert _even(3.4) == 4


def test_groups_split_at_dissolves(edl):
    groups = _groups(edl)
    assert sum(len(g) for g, _d in groups) == len(edl.clips)
    dissolves = sum(1 for c in edl.clips[1:] if c.transition == "dissolve")
    assert len(groups) == dissolves + 1
    for indices, duration in groups:
        assert duration == pytest.approx(sum(edl.clips[i].duration for i in indices))


def test_a_cut_only_timeline_is_one_group(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("20s film"), pack)
    for clip in edl.clips:
        clip.transition, clip.transition_frames = "cut", 0
    assert len(_groups(edl)) == 1


def test_segment_cache_key_tracks_the_clip(edl, pack, tmp_path):
    cfg = RenderConfig()
    clip = edl.clips[0]
    before = _fingerprint(clip, edl, pack, cfg)
    assert before == _fingerprint(clip, edl, pack, cfg)
    clip.src_in += 0.5
    assert _fingerprint(clip, edl, pack, cfg) != before


def test_segment_cache_key_tracks_the_canvas(edl, pack):
    cfg = RenderConfig()
    before = _fingerprint(edl.clips[0], edl, pack, cfg)
    assert _fingerprint(edl.clips[0], edl.retarget("1:1"), pack, cfg) != before


def test_silent_renders_ask_for_no_audio(edl, pack):
    args, chain = _music_inputs(edl, pack, RenderConfig(silent=True))
    assert args == [] and chain is None


def test_the_procedural_bed_covers_the_programme(edl, pack):
    args, chain = _music_inputs(edl, pack, RenderConfig())
    assert "lavfi" in args
    assert "[a]" in chain
    assert "loudnorm=I=-14.0" in chain
    # the sub swell is anchored to the reveal, not to an arbitrary timestamp
    reveal = [s for s, _e, c in edl.timeline() if c.beat == "reveal"]
    if reveal:
        assert f"st={max(0.0, reveal[0] - 1.4):.3f}" in chain


def test_a_missing_music_bed_is_an_error_not_a_silent_swap(edl, pack):
    with pytest.raises(FileNotFoundError):
        _music_inputs(edl, pack, RenderConfig(music="/no/such/bed.wav"))


def test_an_external_music_bed_is_trimmed_and_faded(edl, pack, tmp_path):
    track = tmp_path / "bed.wav"
    track.write_bytes(b"RIFF")  # never decoded here; only the graph is built
    args, chain = _music_inputs(edl, pack, RenderConfig(music=str(track), music_offset=4.0))
    assert "-ss" in args and "4.000" in args
    assert f"atrim=0:{edl.duration:.3f}" in chain
    assert "afade=t=in" in chain and "afade=t=out" in chain


# ---------------------------------------------------------------------------
# reframing across aspect ratios
# ---------------------------------------------------------------------------
def test_retained_area_measures_what_a_crop_throws_away():
    assert retained_area((1080, 1920), (1080, 1920)) == pytest.approx(1.0)
    assert retained_area((1080, 1920), (1080, 1080)) == pytest.approx(0.5625, abs=1e-3)
    assert retained_area((1080, 1920), (1920, 1080)) == pytest.approx(0.3164, abs=1e-3)
    assert retained_area((0, 0), (1920, 1080)) == 1.0  # unknown source: assume fine


def test_auto_crops_when_the_loss_is_modest_and_insets_when_it_is_not():
    assert choose_reframe("auto", (1080, 1920), (1080, 1920)) == "fill"
    assert choose_reframe("auto", (1080, 1920), (1080, 1080)) == "fill"
    # a vertical take in a landscape master would keep under a third of frame
    assert choose_reframe("auto", (1080, 1920), (1920, 1080)) == "fit"
    assert choose_reframe("auto", (1920, 1080), (1080, 1920)) == "fit"


@pytest.mark.parametrize("policy", ["fill", "fit"])
def test_an_explicit_policy_overrides_the_measurement(policy):
    assert choose_reframe(policy, (1080, 1920), (1920, 1080)) == policy
    assert choose_reframe(policy, (1080, 1920), (1080, 1920)) == policy


def test_fit_size_preserves_aspect_and_stays_even():
    w, h = _fit_size((1080, 1920), (1920, 1080))
    assert h == 1080
    assert w == pytest.approx(1080 * 1080 / 1920, abs=2)
    assert w % 2 == 0 and h % 2 == 0


def test_fit_graph_insets_over_a_plate_made_from_the_same_frame(edl, pack):
    clip = edl.clips[0]
    graph = fit_graph(clip, edl, pack, (1080, 1920), "src", "out")
    assert "split=2" in graph
    assert "boxblur=" in graph and "eq=brightness=" in graph
    assert "overlay=(W-w)/2:(H-h)/2" in graph
    assert graph.endswith("[out]")


def test_fit_keeps_the_camera_move_on_the_inset(edl, pack):
    clip = edl.clips[0]
    clip.motion = "push"
    assert "zoompan=" in fit_graph(clip, edl, pack, (1080, 1920), "src", "out")
    clip.motion = "static"
    assert "zoompan=" not in fit_graph(clip, edl, pack, (1080, 1920), "src", "out")


def test_clip_graph_picks_the_mode_and_still_ends_at_v(edl, pack, monkeypatch):
    import autocut.render as render_module

    monkeypatch.setattr(render_module, "_source_size", lambda _p: (1080, 1920))
    clip = edl.clips[0]

    graph, mode = clip_graph(clip, edl, pack, RenderConfig(reframe="auto"))
    assert mode == "fill"
    assert graph.startswith("[0:v]") and graph.endswith("[v]")

    wide = edl.retarget("16:9")
    graph, mode = clip_graph(clip, wide, pack, RenderConfig(reframe="auto"))
    assert mode == "fit"
    assert graph.startswith("[0:v]") and graph.endswith("[v]")
    assert "overlay=" in graph

    graph, mode = clip_graph(clip, wide, pack, RenderConfig(reframe="fill"))
    assert mode == "fill" and "overlay=" not in graph


def test_the_cache_key_tracks_the_reframe_policy(edl, pack):
    clip = edl.clips[0]
    fill = _fingerprint(clip, edl, pack, RenderConfig(reframe="fill"))
    fit = _fingerprint(clip, edl, pack, RenderConfig(reframe="fit"))
    assert fill != fit
