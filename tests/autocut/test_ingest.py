"""Shot analysis: segmentation arithmetic, role scoring, overrides."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest

from autocut.ffmpeg import MediaInfo
from autocut.ingest import (
    ROLES,
    ShotList,
    apply_role_overrides,
    classify,
    load_role_overrides,
    role_hint,
    segment,
)


def _info(duration):
    return MediaInfo("/x.mp4", duration, 1080, 1920, 30.0, False)


def test_segment_covers_the_whole_clip():
    shots = segment(_info(10.0), [(3.0, 0.5), (6.0, 0.4)])
    assert shots[0][0] == 0.0
    assert abs(shots[-1][1] - 10.0) < 1e-6
    for (_s0, e0, _x), (s1, _e1, _y) in zip(shots, shots[1:]):
        assert abs(s1 - e0) < 1e-6


def test_short_shots_are_absorbed_into_their_predecessor():
    shots = segment(_info(10.0), [(3.0, 0.5), (3.2, 0.4)], min_shot=1.0)
    assert all(end - start >= 1.0 for start, end, _ in shots)


def test_long_takes_are_subdivided():
    shots = segment(_info(30.0), [], max_shot=8.0)
    assert len(shots) >= 4
    assert all(end - start <= 8.0 + 1e-6 for start, end, _ in shots)


def test_cuts_beyond_the_duration_are_ignored():
    shots = segment(_info(5.0), [(99.0, 0.9)])
    assert abs(shots[-1][1] - 5.0) < 1e-6


def test_role_hints_read_production_filenames():
    assert role_hint("/r/A012_product_02.mov") == "product"
    assert role_hint("/r/B003-model-01.mp4") == "talent"
    assert role_hint("/r/hands_take4.mov") == "gesture"
    assert role_hint("/r/DSC0192.mp4") is None


def _features(**over):
    base = dict(
        luma=0.45, contrast=0.2, saturation=0.4, warmth=0.1, detail=0.03,
        skin=0.0, subject=0.25, centring=0.6, subject_y=0.5, accent=0.0,
        tone_spread=0.1, center_bias=1.2, motion=0.01,
    )
    base.update(over)
    return base


def test_an_empty_field_reads_as_texture():
    role, _scores, conf = classify(_features(subject=0.01, detail=0.008, skin=0.0))
    assert role == "texture"
    assert conf > 0.3


def test_a_chromatic_centred_object_reads_as_product():
    role, _scores, _c = classify(
        _features(subject=0.18, accent=0.34, skin=0.0, centring=0.85, center_bias=1.8)
    )
    assert role == "product"


def test_skin_modelled_by_light_reads_as_a_person():
    role, _scores, _c = classify(
        _features(subject=0.5, skin=0.9, tone_spread=0.2, detail=0.045, accent=0.0)
    )
    assert role in ("talent", "gesture")


def test_dense_structure_reads_as_macro():
    role, _scores, _c = classify(
        _features(subject=0.4, detail=0.11, skin=0.0, accent=0.05, center_bias=1.9)
    )
    assert role == "macro"


def test_every_role_is_always_scored():
    _role, scores, _c = classify(_features())
    assert set(scores) == set(ROLES)


def test_a_filename_hint_shifts_a_borderline_call():
    features = _features(subject=0.2, accent=0.12, skin=0.3)
    plain, plain_scores, _c = classify(features)
    hinted, hinted_scores, _c2 = classify(features, hint="macro")
    assert plain != "macro", "pick a genuinely borderline fixture"
    assert hinted == "macro"
    assert hinted_scores["macro"] == pytest.approx(plain_scores["macro"] + 2.0, abs=1e-3)


def test_a_filename_hint_does_not_override_emphatic_pixels():
    # a dead-flat plate is a plate whatever the file is called
    role, _scores, _c = classify(
        _features(subject=0.0, detail=0.001, contrast=0.02, skin=0.0), hint="talent"
    )
    assert role == "texture"


def test_confidence_is_low_when_two_roles_are_close():
    _role, scores, conf = classify(_features(subject=0.3, skin=0.45, accent=0.1))
    ordered = sorted(scores.values(), reverse=True)
    assert conf == pytest.approx(min(1.0, max(0.0, (ordered[0] - ordered[1]) / 1.2)), abs=1e-3)


def test_role_overrides_by_file_stem(shots):
    changed = apply_role_overrides(shots, {"a_talent": "texture"})
    assert changed == 1
    assert shots.shots[0].role == "texture"
    assert shots.shots[0].role_confidence == 1.0


def test_role_overrides_by_exact_shot_id(shots):
    target = shots.shots[4]
    assert apply_role_overrides(shots, {target.id: "macro"}) == 1
    assert target.role == "macro"


def test_role_overrides_ignore_unknown_keys(shots):
    assert apply_role_overrides(shots, {"nothing_like_this": "macro"}) == 0


def test_unknown_roles_are_rejected(tmp_path):
    path = tmp_path / "roles.json"
    path.write_text('{"clip": "not_a_role"}')
    with pytest.raises(ValueError):
        load_role_overrides(str(path))


def test_shotlist_roundtrip(tmp_path, shots):
    path = tmp_path / "shots.json"
    shots.save(str(path))
    loaded = ShotList.load(str(path))
    assert len(loaded) == len(shots)
    assert [s.role for s in loaded] == [s.role for s in shots]
    assert loaded.by_role("product")
