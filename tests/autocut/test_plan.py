"""Planning: the arc must fit the brief, and the EDL must be renderable."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import random

import pytest

from autocut.brief import parse
from autocut.plan import (
    EDL,
    MIN_CLIP,
    PlanError,
    _water_fill,
    fit_arc,
    plan,
    plan_variants,
    validate,
)
from autocut.style import StylePack

PACKS = ["editorial_luxury", "kinetic_launch"]


def test_water_fill_respects_bounds_and_total():
    out = _water_fill([1, 1, 5], [1.0, 1.0, 1.0], [2.0, 2.0, 9.0], 10.0)
    assert abs(sum(out) - 10.0) < 1e-6
    assert all(lo - 1e-9 <= v <= hi + 1e-9 for v, lo, hi in zip(out, [1, 1, 1], [2, 2, 9]))


def test_water_fill_pins_at_ceiling_when_total_exceeds_capacity():
    out = _water_fill([1, 1], [0.0, 0.0], [2.0, 2.0], 99.0)
    assert out == [2.0, 2.0]


@pytest.mark.parametrize("pack_name", PACKS)
@pytest.mark.parametrize("duration", [8.0, 12.0, 15.0, 20.0, 30.0, 45.0])
def test_arc_fits_the_requested_duration(pack_name, duration):
    pack = StylePack.load(pack_name)
    brief = parse(f"{duration:g}s film")
    arc = fit_arc(pack, brief, rng=random.Random(0))
    total = sum(d for _b, d in arc)
    # the arc is allowed the dissolve overlap it will later give back
    assert duration <= total <= duration + 2.0
    assert all(d >= MIN_CLIP for _b, d in arc)


@pytest.mark.parametrize("pack_name", PACKS)
@pytest.mark.parametrize("duration", [8.0, 15.0, 20.0, 30.0])
def test_delivered_duration_is_exact(shots, pack_name, duration):
    pack = StylePack.load(pack_name)
    brief = parse(f"{duration:g}s film")
    edl = plan(shots, brief, pack)
    assert abs(edl.duration - duration) < 1.0 / edl.fps


def test_planning_is_deterministic(shots):
    pack = StylePack.load("editorial_luxury")
    brief = parse("20s vertical film")
    a = plan(shots, brief, pack, seed=7).to_dict()
    b = plan(shots, brief, pack, seed=7).to_dict()
    assert a == b


def test_variants_differ(shots):
    pack = StylePack.load("editorial_luxury")
    brief = parse("20s vertical film")
    cuts = plan_variants(shots, brief, pack, k=3)
    assert len(cuts) == 3
    signatures = {tuple((c.source, c.src_in) for c in cut.clips) for cut in cuts}
    assert len(signatures) > 1, "variants should not all be the same cut"


def test_first_clip_is_never_a_dissolve(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("20s film"), pack)
    assert edl.clips[0].transition == "cut"


def test_dissolve_budget_is_respected(shots):
    pack = StylePack.load("kinetic_launch")
    edl = plan(shots, parse("20s film"), pack)
    dissolves = [c for c in edl.clips if c.transition == "dissolve"]
    assert len(dissolves) <= pack.dissolve_budget


def test_dissolves_never_outlast_their_neighbours(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("30s film"), pack)
    for i, clip in enumerate(edl.clips[1:], start=1):
        if clip.transition == "dissolve":
            overlap = clip.transition_frames / edl.fps
            assert overlap < min(edl.clips[i - 1].duration, clip.duration)


def test_clips_stay_inside_their_source_shots(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("30s film"), pack)
    bounds = {s.source: (s.start, s.end) for s in shots}
    for clip in edl.clips:
        start, end = bounds[clip.source]
        assert start - 1e-6 <= clip.src_in < clip.src_out <= end + 1e-6


def test_banned_roles_are_absent(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("20s film, no model"), pack)
    assert all(c.role != "talent" for c in edl.clips)


def test_hook_role_is_honoured(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("20s film, open on the bottle"), pack)
    assert edl.clips[0].role == "product"


def test_endcard_does_not_parrot_the_tagline(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse('20s film, tagline: "it\'s yours"'), pack)
    endcards = [t for t in edl.titles if t.kind == "endcard"]
    assert all(t.text != "it's yours" for t in endcards)


def test_supers_do_not_overlap_each_other(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse('30s film, tagline: "it\'s yours", brand: "DOMAIN BLACK"'), pack)
    for a, b in zip(edl.titles, edl.titles[1:]):
        assert a.start + a.duration <= b.start + 1e-6


def test_super_moves_off_a_low_subject(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse('20s film, tagline: "it\'s yours"'), pack)
    by_start = {round(t.start, 2): t for t in edl.titles}
    for start, _end, clip in edl.timeline():
        for key, title in by_start.items():
            if abs(key - start) < 0.5 and title.kind == "tagline" and clip.role == "product":
                assert title.position in ("upper", "lower")


def test_retarget_keeps_the_cut_and_changes_the_canvas(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("20s vertical film"), pack)
    wide = edl.retarget("16:9")
    assert (wide.width, wide.height) == (1920, 1080)
    assert [c.src_in for c in wide.clips] == [c.src_in for c in edl.clips]
    assert abs(wide.duration - edl.duration) < 1e-6


def test_retarget_rejects_an_unknown_aspect(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("20s film"), pack)
    with pytest.raises(ValueError):
        edl.retarget("3:2")


def test_validation_rejects_a_sub_frame_clip(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("20s film"), pack)
    edl.clips[2].src_out = edl.clips[2].src_in + 0.001
    with pytest.raises(PlanError):
        validate(edl)


def test_validation_rejects_an_empty_edl(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("20s film"), pack)
    edl.clips = []
    with pytest.raises(PlanError):
        validate(edl)


def test_edl_roundtrip(tmp_path, shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("20s film"), pack)
    path = tmp_path / "cut.edl.json"
    edl.save(str(path))
    assert EDL.load(str(path)).to_dict() == edl.to_dict()


def test_timeline_accounts_for_dissolve_overlap(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse("20s film"), pack)
    spans = edl.timeline()
    assert spans[0][0] == 0.0
    assert abs(spans[-1][1] - edl.duration) < 1e-6
    for (_s0, e0, _c0), (s1, _e1, c1) in zip(spans, spans[1:]):
        if c1.transition == "dissolve":
            assert s1 < e0  # they overlap
        else:
            assert abs(s1 - e0) < 1e-6
