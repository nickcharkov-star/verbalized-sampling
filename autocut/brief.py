"""Natural-language brief -> structured creative parameters.

A director types one sentence. This module turns it into the numbers the
planner needs. Parsing is deterministic and offline by default; when an LLM
is configured, :mod:`autocut.plan` layers verbalized sampling on top to get
*several* distinct readings of the same brief rather than one.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional

from ._util import _field_names
from .ingest import ROLES
from .style import ASPECTS

# ---------------------------------------------------------------------------
# vocabulary
# ---------------------------------------------------------------------------
ASPECT_WORDS = {
    "9:16": ("9:16", "vertical", "reels", "reel", "tiktok", "stories", "story", "shorts"),
    "4:5": ("4:5", "feed", "portrait"),
    "1:1": ("1:1", "square"),
    "16:9": ("16:9", "landscape", "youtube", "pre-roll", "preroll", "widescreen", "ctv"),
    "2.39:1": ("2.39", "scope", "anamorphic", "cinemascope"),
}

FAST_WORDS = ("fast", "faster", "punchy", "kinetic", "snappy", "energetic", "quick", "rapid")
SLOW_WORDS = (
    "slow", "slower", "languid", "unhurried", "meditative", "calm", "restrained", "patient",
)

MOOD_GRADE = {
    "moody": 1.18, "dark": 1.15, "filmic": 1.10, "cinematic": 1.10,
    "warm": 1.06, "sensual": 1.08, "clean": 0.86, "bright": 0.82,
    "airy": 0.84, "natural": 0.9, "minimal": 0.88,
}

ROLE_WORDS = {
    "talent": ("model", "talent", "face", "portrait", "her", "him", "muse"),
    "product": ("bottle", "product", "flacon", "pack", "packshot"),
    "macro": ("macro", "detail", "close-up", "closeup", "cap", "gold", "engraving"),
    "gesture": ("hands", "hand", "gesture", "holding", "palm"),
    "texture": ("texture", "wall", "light", "fabric", "shadow", "backdrop", "linen"),
    "logo": ("logo", "wordmark", "endcard", "end card", "lockup"),
}


def _match_role(text: str) -> Optional[str]:
    text = text.lower()
    for role, words in ROLE_WORDS.items():
        if any(w in text for w in words):
            return role
    return None


# ---------------------------------------------------------------------------
# model
# ---------------------------------------------------------------------------
@dataclass
class Brief:
    """Everything the planner needs, derived from one line of English."""

    text: str = ""
    brand: str = ""
    product: str = ""
    style: str = "editorial_luxury"
    duration: float = 20.0
    aspects: List[str] = field(default_factory=lambda: ["9:16"])
    fps: int = 30
    bpm: Optional[float] = None
    tempo_scale: float = 1.0       # <1 cuts faster than the pack's default
    grade_intensity: float = 1.0
    hook_role: Optional[str] = None
    require_roles: List[str] = field(default_factory=list)
    ban_roles: List[str] = field(default_factory=list)
    copy: Dict[str, str] = field(default_factory=dict)  # product / tagline / endcard
    mood: List[str] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Brief":
        return cls(**{k: v for k, v in d.items() if k in _field_names(cls)})

    def save(self, path: str) -> str:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(self.to_dict(), fh, indent=2)
        return path

    @classmethod
    def load(cls, path: str) -> "Brief":
        with open(path, encoding="utf-8") as fh:
            return cls.from_dict(json.load(fh))

    def summary(self) -> str:
        bits = [
            f"{self.duration:g}s",
            "/".join(self.aspects),
            self.style,
            f"tempo x{self.tempo_scale:g}",
            f"grade x{self.grade_intensity:g}",
        ]
        if self.hook_role:
            bits.append(f"open on {self.hook_role}")
        if self.copy.get("tagline"):
            bits.append(f'"{self.copy["tagline"]}"')
        return " · ".join(bits)


# ---------------------------------------------------------------------------
# parsing
# ---------------------------------------------------------------------------
_DUR_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:-|\s)?\s*(?:s\b|sec\b|secs\b|second|seconds)", re.I)
_BPM_RE = re.compile(r"(\d{2,3})\s*bpm", re.I)
_FPS_RE = re.compile(r"(\d{2,3})\s*fps", re.I)
# Quote pairs are matched as pairs, never as a character class: an apostrophe
# inside a double-quoted tagline ("it's yours") must not terminate the match.
_QUOTED = r"""(?:"([^"]{1,80})"|\u201c([^\u201d]{1,80})\u201d|'([^']{1,80})')"""
_LABELLED_RE = re.compile(
    r"\b(tagline|endcard|end card|wordmark|product|brand|supers?|title)\s*[:=]\s*" + _QUOTED,
    re.I,
)
_QUOTE_RE = re.compile(_QUOTED)


def _quoted_value(groups) -> str:
    """Pick whichever quote flavour matched."""
    for g in groups:
        if g:
            return g.strip()
    return ""
_OPEN_RE = re.compile(
    r"\b(?:open(?:ing)?\s+on|start(?:ing)?\s+(?:on|with)|lead\s+with)\s+([^,.;]{2,40})", re.I
)
_END_RE = re.compile(r"\b(?:end|close|finish|resolve)\s+(?:on|with)\s+([^,.;]{2,40})", re.I)
_BAN_RE = re.compile(r"\b(?:no|avoid|without|skip|drop)\s+([^,.;]{2,40})", re.I)


def parse(text: str, *, defaults: Optional[Brief] = None) -> Brief:
    """Parse a free-text brief. Unrecognised prose is kept in ``notes``."""
    brief = Brief(**(defaults.to_dict() if defaults else {}))
    brief.text = text.strip()
    low = text.lower()

    # --- duration ---------------------------------------------------------
    m = _DUR_RE.search(text)
    if m:
        brief.duration = max(4.0, min(180.0, float(m.group(1))))

    m = _BPM_RE.search(text)
    if m:
        brief.bpm = float(m.group(1))
    m = _FPS_RE.search(text)
    if m and 12 <= int(m.group(1)) <= 120:
        brief.fps = int(m.group(1))

    # --- deliverable aspects ---------------------------------------------
    found: List[str] = []
    for aspect, words in ASPECT_WORDS.items():
        if any(w in low for w in words):
            found.append(aspect)
    if found:
        brief.aspects = [a for a in ASPECTS if a in found]  # canonical order

    # --- tempo ------------------------------------------------------------
    if any(w in low for w in FAST_WORDS):
        brief.tempo_scale = 0.78
    if any(w in low for w in SLOW_WORDS):
        brief.tempo_scale = 1.22 if brief.tempo_scale == 1.0 else 1.0

    # --- grade / mood -----------------------------------------------------
    mood_hits = [w for w in MOOD_GRADE if w in low]
    if mood_hits:
        brief.mood = mood_hits
        brief.grade_intensity = round(
            sum(MOOD_GRADE[w] for w in mood_hits) / len(mood_hits), 3
        )

    # --- copy deck --------------------------------------------------------
    for match in _LABELLED_RE.finditer(text):
        label = match.group(1)
        value = _quoted_value(match.groups()[1:])
        if not value:
            continue
        key = label.lower().replace(" ", "")
        key = {
            "supers": "tagline", "super": "tagline",
            "title": "tagline", "endcard": "endcard",
        }.get(key, key)
        if key == "brand":
            brief.brand = value.strip()
        elif key == "wordmark":
            brief.copy["endcard"] = value.strip()
            brief.brand = brief.brand or value.strip()
        else:
            brief.copy[key] = value.strip()
    if "tagline" not in brief.copy:
        labelled = {
            _quoted_value(m.groups()[1:]) for m in _LABELLED_RE.finditer(text)
        }
        for m in _QUOTE_RE.finditer(text):
            value = _quoted_value(m.groups())
            if value and value not in labelled:
                brief.copy["tagline"] = value
                break

    # --- structural instructions -----------------------------------------
    m = _OPEN_RE.search(text)
    if m:
        role = _match_role(m.group(1))
        if role:
            brief.hook_role = role
            if role not in brief.require_roles:
                brief.require_roles.append(role)
    m = _END_RE.search(text)
    if m:
        role = _match_role(m.group(1))
        if role and role not in brief.require_roles:
            brief.require_roles.append(role)
    for phrase in _BAN_RE.findall(text):
        role = _match_role(phrase)
        if role and role not in brief.ban_roles:
            brief.ban_roles.append(role)

    # explicit style pack request, e.g. "style: kinetic_launch"
    m = re.search(r"\bstyle\s*[:=]\s*([a-z0-9_\-]+)", low)
    if m:
        brief.style = m.group(1)
    elif any(w in low for w in ("kinetic", "launch teaser", "hype")):
        brief.style = "kinetic_launch"

    brief.require_roles = [
        r for r in brief.require_roles if r in ROLES and r not in brief.ban_roles
    ]
    brief.ban_roles = [r for r in brief.ban_roles if r in ROLES]
    if brief.hook_role in brief.ban_roles:
        brief.hook_role = None
    return brief


def merge(base: Brief, overrides: Dict[str, object]) -> Brief:
    """Apply CLI flags on top of a parsed brief (flags always win)."""
    data = base.to_dict()
    for key, value in overrides.items():
        if value is None or key not in data:
            continue
        if key == "copy" and isinstance(value, dict):
            data["copy"] = {**data.get("copy", {}), **value}
        else:
            data[key] = value
    return Brief.from_dict(data)
