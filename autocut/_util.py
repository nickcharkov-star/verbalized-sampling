"""Small shared helpers with no dependencies of their own."""

from __future__ import annotations

from dataclasses import fields
from typing import Set


def _field_names(cls) -> Set[str]:
    """Field names of a dataclass, via the public API.

    Used by every ``from_dict`` so that unknown keys in a stored JSON file are
    ignored rather than raising — an EDL written by a newer version still loads
    in an older one, minus whatever it does not understand.
    """
    return {f.name for f in fields(cls)}
