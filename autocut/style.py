"""Style packs: the editorial grammar, expressed as data rather than code.

A pack answers the questions a human editor answers on instinct:

* what is the shape of the film (which roles, in what order, held how long)?
* how does the tempo breathe across that shape?
* when may a dissolve be used instead of a cut?
* what does the grade, the grain, the type and the mix do?

Packs live in ``autocut/packs/*.json``. Adding a new house style is a JSON
file, not a code change.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from ._util import _field_names

PACK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "packs")

ASPECTS: Dict[str, Tuple[int, int]] = {
    "9:16": (1080, 1920),
    "4:5": (1080, 1350),
    "1:1": (1080, 1080),
    "16:9": (1920, 1080),
    "2.39:1": (1920, 804),
}


@dataclass
class Beat:
    """One movement of the film's arc."""

    name: str
    roles: List[str]
    weight: float = 1.0
    motion: str = "push"
    transition: str = "cut"
    min_dur: float = 0.4
    max_dur: float = 4.0
    hold: bool = False           # a held beat is never speed-ramped or shortened
    title: Optional[str] = None  # key into the brief's copy deck

    @classmethod
    def from_dict(cls, d: dict) -> "Beat":
        return cls(**{k: v for k, v in d.items() if k in _field_names(cls)})


@dataclass
class StylePack:
    name: str
    description: str = ""
    bpm: float = 96.0
    subdivision: float = 2.0            # cuts land on 1/2-bar multiples by default
    tempo_curve: List[List[float]] = field(default_factory=list)
    arc: List[Beat] = field(default_factory=list)
    dissolve_budget: int = 2
    dissolve_frames: int = 14
    motion_amount: float = 0.06         # push/pull magnitude as a fraction of frame
    grade: Dict[str, str] = field(default_factory=dict)
    grain: float = 4.0
    vignette: float = 0.28
    typography: Dict[str, object] = field(default_factory=dict)
    audio: Dict[str, object] = field(default_factory=dict)
    role_affinity: Dict[str, float] = field(default_factory=dict)

    # -- tempo -------------------------------------------------------------
    @property
    def beat_seconds(self) -> float:
        return 60.0 / max(1.0, self.bpm)

    @property
    def grid(self) -> float:
        """Smallest musical interval a cut may land on."""
        return self.beat_seconds * self.subdivision

    def tempo_at(self, position: float) -> float:
        """Piecewise-linear tempo multiplier at normalised position [0,1].

        Values >1 stretch a beat (slower cutting), <1 compress it.
        """
        pts = self.tempo_curve or [[0.0, 1.0], [1.0, 1.0]]
        position = min(1.0, max(0.0, position))
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x0 <= position <= x1:
                if x1 - x0 < 1e-9:
                    return y1
                t = (position - x0) / (x1 - x0)
                return y0 + t * (y1 - y0)
        return pts[-1][1]

    # -- io ----------------------------------------------------------------
    @classmethod
    def from_dict(cls, d: dict) -> "StylePack":
        data = dict(d)
        data["arc"] = [Beat.from_dict(b) for b in data.get("arc", [])]
        known = {k: v for k, v in data.items() if k in _field_names(cls)}
        return cls(**known)

    @classmethod
    def load(cls, name_or_path: str) -> "StylePack":
        path = name_or_path
        if not os.path.exists(path):
            path = os.path.join(PACK_DIR, f"{name_or_path}.json")
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"unknown style pack '{name_or_path}'. Available: {', '.join(available())}"
            )
        with open(path, encoding="utf-8") as fh:
            return cls.from_dict(json.load(fh))


def available() -> List[str]:
    if not os.path.isdir(PACK_DIR):
        return []
    return sorted(
        os.path.splitext(f)[0] for f in os.listdir(PACK_DIR) if f.endswith(".json")
    )


# --------------------------------------------------------------------------
# grade chain construction
# --------------------------------------------------------------------------
def grade_chain(pack: StylePack, *, intensity: float = 1.0) -> List[str]:
    """Build the ffmpeg filter chain that gives the film its look."""
    g = pack.grade
    chain: List[str] = []
    if g.get("curves"):
        chain.append(f"curves={g['curves']}")
    eq_bits = []
    for key in ("contrast", "brightness", "saturation", "gamma"):
        if key in g:
            base = float(g[key])
            neutral = 0.0 if key == "brightness" else 1.0
            eq_bits.append(f"{key}={neutral + (base - neutral) * intensity:.4f}")
    if eq_bits:
        chain.append("eq=" + ":".join(eq_bits))
    if g.get("colorbalance"):
        chain.append(f"colorbalance={g['colorbalance']}")
    if g.get("unsharp"):
        chain.append(f"unsharp={g['unsharp']}")
    if pack.vignette > 0:
        # vignette angle: larger = tighter falloff
        chain.append(f"vignette=a={max(0.05, pack.vignette):.3f}:mode=forward")
    if pack.grain > 0:
        chain.append(f"noise=alls={int(round(pack.grain * intensity))}:allf=t+u")
    return chain
