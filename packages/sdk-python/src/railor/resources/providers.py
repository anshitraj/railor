from __future__ import annotations

from typing import Any

from .._http import Transport


class Providers:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def list(self, *, product: str | None = None, country: str | None = None) -> dict[str, Any]:
        """GET /v1/providers — mapped providers, optionally filtered by product or HQ country."""
        return self._transport.get("/v1/providers", query={"product": product, "country": country})
