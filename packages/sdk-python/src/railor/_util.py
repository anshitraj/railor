from __future__ import annotations

from typing import Any


def drop_none(values: dict[str, Any]) -> dict[str, Any]:
    """Keys set to None are omitted, not sent as JSON null — Zod's `.optional()`
    on the server expects the key to be absent, not present-and-null."""
    return {k: v for k, v in values.items() if v is not None}
