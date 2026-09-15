"""Brief parsing: one line of English in, campaign parameters out."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from autocut.brief import Brief, merge, parse


def test_duration_and_aspect():
    b = parse("Cut a 20s vertical Reels teaser")
    assert b.duration == 20.0
    assert b.aspects == ["9:16"]


def test_duration_spellings():
    assert parse("15 second spot").duration == 15.0
    assert parse("a 30-second film").duration == 30.0
    assert parse("6s bumper").duration == 6.0


def test_multiple_aspects_keep_canonical_order():
    b = parse("deliver square and landscape and vertical")
    assert b.aspects == ["9:16", "1:1", "16:9"]


def test_apostrophe_inside_a_quoted_tagline_survives():
    b = parse("""20s teaser, tagline: "it's yours" """)
    assert b.copy["tagline"] == "it's yours"


def test_labelled_copy_beats_bare_quotes():
    b = parse("""15s cut "a scent of your own", endcard: "DOMAIN BLACK" """)
    assert b.copy["endcard"] == "DOMAIN BLACK"
    assert b.copy["tagline"] == "a scent of your own"


def test_pacing_words_move_tempo_in_opposite_directions():
    assert parse("punchy 15s cut").tempo_scale < 1.0
    assert parse("slow, unhurried 15s cut").tempo_scale > 1.0


def test_mood_drives_grade_intensity():
    assert parse("moody 20s film").grade_intensity > 1.0
    assert parse("clean, bright 20s film").grade_intensity < 1.0


def test_structural_instructions():
    b = parse("20s film, open on the model, end on the bottle, no logo cards")
    assert b.hook_role == "talent"
    assert "product" in b.require_roles
    assert b.ban_roles == ["logo"]


def test_a_banned_role_cannot_also_be_the_hook():
    b = parse("20s film, open on the bottle, no bottle")
    assert b.hook_role is None
    assert "product" in b.ban_roles


def test_style_selection_explicit_and_implied():
    assert parse("20s film, style: kinetic_launch").style == "kinetic_launch"
    assert parse("kinetic 20s launch film").style == "kinetic_launch"
    assert parse("20s film").style == "editorial_luxury"


def test_bpm_and_fps():
    b = parse("20s cut at 108 bpm, 24 fps")
    assert b.bpm == 108.0
    assert b.fps == 24


def test_merge_lets_flags_win():
    base = parse("20s vertical teaser")
    merged = merge(base, {"duration": 15.0, "aspects": ["1:1"], "copy": {"tagline": "x"}})
    assert merged.duration == 15.0
    assert merged.aspects == ["1:1"]
    assert merged.copy["tagline"] == "x"
    assert base.duration == 20.0  # the original is untouched


def test_merge_ignores_none():
    base = parse("20s vertical teaser")
    assert merge(base, {"duration": None}).duration == 20.0


def test_roundtrip(tmp_path):
    b = parse("""20s vertical teaser, tagline: "it's yours" """)
    path = tmp_path / "brief.json"
    b.save(str(path))
    assert Brief.load(str(path)).to_dict() == b.to_dict()
