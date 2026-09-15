import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest

from autocut.ingest import Shot, ShotList


def _shot(source, role, start=0.0, end=6.0, **features):
    defaults = dict(
        subject=0.3, centring=0.6, subject_y=0.5, accent=0.0,
        tone_spread=0.15, skin=0.0, detail=0.03, center_bias=1.2,
        luma=0.45, contrast=0.2, motion=0.02, role_confidence=0.9,
    )
    defaults.update(features)
    return Shot(source=source, start=start, end=end, role=role, **defaults)


@pytest.fixture
def shots():
    """A plausible fragrance shoot: two of every role the arc asks for."""
    return ShotList(
        shots=[
            _shot("/rushes/a_talent.mp4", "talent", skin=0.9, subject=0.5),
            _shot("/rushes/b_talent.mp4", "talent", skin=0.85, subject=0.45),
            _shot("/rushes/c_gesture.mp4", "gesture", skin=0.5, subject=0.25),
            _shot("/rushes/d_gesture.mp4", "gesture", skin=0.45, subject=0.3),
            _shot("/rushes/e_product.mp4", "product", accent=0.3, subject=0.2, subject_y=0.7),
            _shot("/rushes/f_product.mp4", "product", accent=0.25, subject=0.18),
            _shot("/rushes/g_macro.mp4", "macro", detail=0.08),
            _shot("/rushes/h_macro.mp4", "macro", detail=0.07),
            _shot("/rushes/i_texture.mp4", "texture", subject=0.02, detail=0.01),
            _shot("/rushes/j_texture.mp4", "texture", subject=0.03, detail=0.012),
            _shot("/rushes/k_logo.mp4", "logo", subject=0.0, contrast=0.4, detail=0.002),
        ],
        media={},
    )
