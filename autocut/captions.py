"""Typography, with a backend chosen from what the local ffmpeg can actually do.

Two ways to burn supers into a film:

``ass``
    Generate a subtitle script and render it with libass. Preferred, because
    libass does real typography — letter-spacing, proper fades, margins — and
    a luxury wordmark lives or dies on its tracking.
``drawtext``
    ffmpeg's own text filter. Needs a libfreetype-enabled build and has no
    letter-spacing, which is faked by inserting spaces.

Many static ffmpeg builds ship one and not the other, so the backend is probed
at runtime rather than assumed. If neither exists the film still renders, minus
the supers, with a warning.
"""

from __future__ import annotations

import os
import re
import struct
from functools import lru_cache
from typing import List, Optional, Tuple

from .ffmpeg import font_file, run
from .style import StylePack

# ASS alignment (numpad layout): bottom-centre, centre, top-centre
_ALIGN = {"lower": 2, "center": 5, "upper": 8}


@lru_cache(maxsize=1)
def _filters() -> frozenset:
    proc = run(["-filters"], capture=True, check=False)
    text = (proc.stdout or b"").decode("utf-8", "replace")
    names = set()
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 2 and not line.startswith("Filters:"):
            names.add(parts[1])
    return frozenset(names)


def backend() -> Optional[str]:
    """Which typography backend this ffmpeg build supports."""
    have = _filters()
    if "subtitles" in have or "ass" in have:
        return "ass"
    if "drawtext" in have:
        return "drawtext"
    return None


# ---------------------------------------------------------------------------
# font family lookup (ASS addresses fonts by family name, not by path)
# ---------------------------------------------------------------------------
@lru_cache(maxsize=32)
def family_name(path: str) -> str:
    """Read nameID 1 (font family) out of a TrueType name table."""
    fallback = os.path.splitext(os.path.basename(path))[0]
    try:
        with open(path, "rb") as fh:
            data = fh.read()
        num_tables = struct.unpack(">H", data[4:6])[0]
        offset = None
        for i in range(num_tables):
            entry = 12 + 16 * i
            tag = data[entry:entry + 4]
            if tag == b"name":
                offset = struct.unpack(">I", data[entry + 8:entry + 12])[0]
                break
        if offset is None:
            return fallback
        count, string_offset = struct.unpack(">HH", data[offset + 2:offset + 6])
        for i in range(count):
            rec = offset + 6 + 12 * i
            platform, encoding, _lang, name_id, length, str_off = struct.unpack(
                ">HHHHHH", data[rec:rec + 12]
            )
            if name_id != 1:
                continue
            start = offset + string_offset + str_off
            raw = data[start:start + length]
            if platform == 3 or encoding == 1:  # UTF-16BE
                return raw.decode("utf-16-be", "replace").strip() or fallback
            return raw.decode("latin-1", "replace").strip() or fallback
    except (OSError, struct.error, IndexError):
        pass
    return fallback


# ---------------------------------------------------------------------------
# ASS generation
# ---------------------------------------------------------------------------
def _ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    rest = seconds % 60
    return f"{hours}:{minutes:02d}:{rest:05.2f}"


def _ass_colour(spec: str) -> str:
    """'white@0.94' or '#RRGGBB@a' -> ASS &HAABBGGRR (alpha 00 = opaque)."""
    named = {
        "white": (255, 255, 255), "black": (0, 0, 0),
        "sand": (216, 196, 168), "gold": (201, 162, 39),
    }
    colour, _, alpha_s = spec.partition("@")
    colour = colour.strip().lower()
    if colour.startswith("#") or colour.startswith("0x"):
        hexed = colour.lstrip("#").replace("0x", "")
        r, g, b = (int(hexed[i:i + 2], 16) for i in (0, 2, 4))
    else:
        r, g, b = named.get(colour, (255, 255, 255))
    try:
        alpha = float(alpha_s) if alpha_s else 1.0
    except ValueError:
        alpha = 1.0
    inv = int(round((1.0 - max(0.0, min(1.0, alpha))) * 255))
    return f"&H{inv:02X}{b:02X}{g:02X}{r:02X}"


_COLOUR = re.compile(r"^(#|0x)?[0-9a-fA-F]{6}(@(0(\.\d+)?|1(\.0+)?|\.\d+))?$")


def title_colour(spec: str) -> str:
    """A super's own colour, if it is one we can trust in a filter string.

    The EDL is hand-editable, so a colour is accepted only as hex (with an
    optional @alpha); anything else falls back to the pack's colour.
    """
    spec = (spec or "").strip()
    return spec if _COLOUR.match(spec) else ""


def ass_document(edl, pack: StylePack) -> Tuple[str, List[str]]:
    """Build the .ass script for an EDL. Returns (text, font directories)."""
    typo = pack.typography
    mark_font = font_file(typo.get("wordmark_font")) or ""
    line_font = font_file(typo.get("tagline_font")) or mark_font
    fontdirs = sorted({os.path.dirname(p) for p in (mark_font, line_font) if p})

    colour = _ass_colour(str(typo.get("color", "white@0.95")))
    shadow = _ass_colour(str(typo.get("shadow", "black@0.30")))
    mark_size = int(edl.height * float(typo.get("wordmark_size", 0.052)))
    line_size = int(edl.height * float(typo.get("tagline_size", 0.046)))
    tracking = int(typo.get("tracking", 0))
    margin_v = int(edl.height * float(typo.get("safe_bottom", 0.17)))
    margin_h = int(edl.width * 0.08)
    fade_ms = int(1000 * int(typo.get("fade_frames", 8)) / max(1, edl.fps))

    head = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {edl.width}",
        f"PlayResY: {edl.height}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # the wordmark carries the house tracking; body copy is set solid
        f"Style: mark,{family_name(mark_font) if mark_font else 'Serif'},{mark_size},"
        f"{colour},{colour},{shadow},{shadow},0,0,0,0,100,100,{tracking},0,1,0,2,5,"
        f"{margin_h},{margin_h},{margin_v},1",
        f"Style: line,{family_name(line_font) if line_font else 'Serif'},{line_size},"
        f"{colour},{colour},{shadow},{shadow},0,0,0,0,100,100,0,0,1,0,2,2,"
        f"{margin_h},{margin_h},{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    events = []
    for title in edl.titles:
        style = "mark" if title.kind == "endcard" else "line"
        text = title.text.upper() if title.kind == "endcard" else title.text
        text = text.replace("\\", "\\\\").replace("{", "(").replace("}", ")")
        align = _ALIGN.get(title.position, 2)
        # MarginV is measured from whichever edge the alignment anchors to, so
        # each safe area is applied to the super that actually uses it
        if title.position == "upper":
            margin = int(edl.height * float(typo.get("safe_top", 0.11)))
        elif title.position == "center":
            margin = 0
        else:
            margin = margin_v
        tags = f"\\an{align}\\fad({fade_ms},{fade_ms})"
        own = title_colour(getattr(title, "color", ""))
        if own:
            # ink on a pale frame: its own colour, and no dark shadow under it
            ass = _ass_colour(own if "#" in own or own.startswith("0x") else "#" + own)
            tags += f"\\1c&H{ass[4:]}&\\1a&H{ass[2:4]}&\\shad0"
        events.append(
            f"Dialogue: 0,{_ass_time(title.start)},{_ass_time(title.start + title.duration)},"
            f"{style},,0,0,{margin},,{{{tags}}}{text}"
        )
    return "\n".join(head + events) + "\n", fontdirs


def _escape_path(path: str) -> str:
    """Escape a path for use inside an ffmpeg filter argument."""
    return path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


# ---------------------------------------------------------------------------
# drawtext fallback
# ---------------------------------------------------------------------------
def _track_out(text: str, tracking: int) -> str:
    """drawtext has no letter-spacing; wide tracking is faked with spaces."""
    if tracking < 3 or len(text) > 42:
        return text
    return (" " if tracking < 8 else "  ").join(list(text))


def _drawtext_filters(edl, pack: StylePack, workdir: str) -> List[str]:
    typo = pack.typography
    fade = max(1, int(typo.get("fade_frames", 8))) / edl.fps
    text_dir = os.path.join(workdir, "text")
    os.makedirs(text_dir, exist_ok=True)
    filters: List[str] = []

    for i, title in enumerate(edl.titles):
        is_mark = title.kind == "endcard"
        font = font_file(typo.get("wordmark_font" if is_mark else "tagline_font"))
        if not font:
            continue
        size_key = "wordmark_size" if is_mark else "tagline_size"
        size = int(edl.height * float(typo.get(size_key, 0.05)))
        body = _track_out(
            title.text.upper() if is_mark else title.text,
            int(typo.get("tracking", 0)) if is_mark else 0,
        )
        # textfile= sidesteps drawtext's escaping rules entirely, so apostrophes
        # and colons in campaign copy survive verbatim
        text_path = os.path.join(text_dir, f"title{i:02d}.txt")
        with open(text_path, "w", encoding="utf-8") as fh:
            fh.write(body)

        start, end = title.start, title.start + title.duration
        if title.position == "center":
            y = "(h-text_h)/2"
        elif title.position == "upper":
            y = f"h*{float(typo.get('safe_top', 0.11)):.4f}"
        else:
            y = f"h-h*{float(typo.get('safe_bottom', 0.17)):.4f}-text_h"

        alpha = (
            f"if(lt(t,{start:.3f}),0,"
            f"if(lt(t,{start + fade:.3f}),(t-{start:.3f})/{fade:.4f},"
            f"if(lt(t,{end - fade:.3f}),1,"
            f"if(lt(t,{end:.3f}),({end:.3f}-t)/{fade:.4f},0))))"
        )
        own = title_colour(getattr(title, "color", ""))
        ink = ("0x" + own.lstrip("#").replace("0x", "")) if own else typo.get("color", "white@0.95")
        filters.append(
            "drawtext="
            f"fontfile='{_escape_path(font)}':textfile='{_escape_path(text_path)}':"
            f"fontsize={size}:fontcolor={ink}:"
            f"x=(w-text_w)/2:y={y}:"
            f"shadowcolor={typo.get('shadow', 'black@0.3')}:shadowx=0:shadowy={0 if own else 2}:"
            f"alpha='{alpha}':enable='between(t,{start:.3f},{end:.3f})'"
        )
    return filters


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------
def title_filters(edl, pack: StylePack, workdir: str, on_warning=None) -> List[str]:
    """Filters that burn the EDL's supers in, using whichever backend exists."""
    if not edl.titles:
        return []
    chosen = backend()
    if chosen == "ass":
        doc, fontdirs = ass_document(edl, pack)
        path = os.path.join(workdir, "titles.ass")
        os.makedirs(workdir, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(doc)
        arg = f"subtitles=filename='{_escape_path(path)}'"
        if fontdirs:
            arg += f":fontsdir='{_escape_path(fontdirs[0])}'"
        return [arg]
    if chosen == "drawtext":
        return _drawtext_filters(edl, pack, workdir)
    if on_warning:
        on_warning(
            "this ffmpeg build has neither libass nor drawtext; rendering without supers"
        )
    return []
