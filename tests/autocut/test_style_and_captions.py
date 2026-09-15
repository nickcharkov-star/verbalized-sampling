"""Style packs and typography."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest

from autocut import captions
from autocut.brief import parse
from autocut.plan import plan
from autocut.style import ASPECTS, StylePack, available, grade_chain


def test_every_shipped_pack_loads_and_is_coherent():
    assert available()
    for name in available():
        pack = StylePack.load(name)
        assert pack.arc, f"{name} has no arc"
        assert pack.bpm > 0
        assert any(b.hold for b in pack.arc), f"{name} has no held beats"
        for beat in pack.arc:
            assert beat.roles
            assert 0 < beat.min_dur <= beat.max_dur
            assert beat.transition in ("cut", "dissolve")


def test_unknown_pack_names_fail_loudly():
    with pytest.raises(FileNotFoundError):
        StylePack.load("no_such_house_style")


def test_tempo_curve_interpolates_and_clamps():
    pack = StylePack.load("editorial_luxury")
    assert pack.tempo_at(0.0) == pytest.approx(pack.tempo_curve[0][1])
    assert pack.tempo_at(1.0) == pytest.approx(pack.tempo_curve[-1][1])
    assert pack.tempo_at(-5.0) == pytest.approx(pack.tempo_curve[0][1])
    assert pack.tempo_at(9.0) == pytest.approx(pack.tempo_curve[-1][1])
    # the editorial curve is slowest at the ends and quickest in the middle
    assert pack.tempo_at(0.55) < pack.tempo_at(0.0)


def test_grid_follows_tempo():
    pack = StylePack.load("editorial_luxury")
    assert pack.grid == pytest.approx(60.0 / pack.bpm * pack.subdivision)


def test_grade_intensity_scales_the_look():
    pack = StylePack.load("editorial_luxury")
    mild = " ".join(grade_chain(pack, intensity=0.5))
    strong = " ".join(grade_chain(pack, intensity=1.5))
    assert "curves=" in mild and "vignette=" in mild
    assert mild != strong


def test_aspects_are_even_dimensioned():
    for _name, (w, h) in ASPECTS.items():
        assert w % 2 == 0 and h % 2 == 0


def test_backend_is_probed_not_assumed():
    assert captions.backend() in (None, "ass", "drawtext")


def test_ass_colour_conversion():
    assert captions._ass_colour("white@1.0") == "&H00FFFFFF"
    assert captions._ass_colour("black@0.0") == "&HFF000000"
    assert captions._ass_colour("#C9A227@1.0") == "&H0027A2C9"  # ASS is BGR


def test_ass_time_formatting():
    assert captions._ass_time(0.0) == "0:00:00.00"
    assert captions._ass_time(65.5) == "0:01:05.50"
    assert captions._ass_time(-3.0) == "0:00:00.00"


def test_ass_document_is_well_formed_and_keeps_copy_verbatim(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse('20s film, tagline: "it\'s yours", brand: "DOMAIN BLACK"'), pack)
    doc, fontdirs = captions.ass_document(edl, pack)
    assert "[Script Info]" in doc and "[V4+ Styles]" in doc and "[Events]" in doc
    assert f"PlayResX: {edl.width}" in doc
    assert "it's yours" in doc          # apostrophes survive
    assert "DOMAIN BLACK" in doc        # the wordmark is set in caps
    assert doc.count("Dialogue:") == len(edl.titles)
    assert all(isinstance(d, str) for d in fontdirs)


def test_ass_braces_in_copy_cannot_inject_override_tags(shots):
    pack = StylePack.load("editorial_luxury")
    edl = plan(shots, parse('20s film, tagline: "hold"'), pack)
    assert edl.titles, "fixture should produce at least one super"
    edl.titles[0].text = "{\\fscx400}oops"
    doc, _dirs = captions.ass_document(edl, pack)
    dialogue = [ln for ln in doc.splitlines() if ln.startswith("Dialogue:")][0]
    # only autocut's own override block may use braces; copy is neutralised, so
    # a tag pasted into a tagline renders as text instead of restyling the film
    body = dialogue.split("}", 1)[1]
    assert "{" not in body and "}" not in body
    assert "oops" in body


def test_paths_are_escaped_for_filter_arguments():
    assert captions._escape_path("/a/b:c.ass") == "/a/b\\:c.ass"
    assert captions._escape_path("/a/it's.ass") == "/a/it\\'s.ass"


def test_family_name_reads_a_real_font():
    from autocut.ffmpeg import font_file

    path = font_file(None)
    if not path:
        pytest.skip("no fonts on this machine")
    assert captions.family_name(path)


def test_family_name_falls_back_on_rubbish(tmp_path):
    bogus = tmp_path / "Fake-Regular.ttf"
    bogus.write_bytes(b"not a font")
    assert captions.family_name(str(bogus)) == "Fake-Regular"
