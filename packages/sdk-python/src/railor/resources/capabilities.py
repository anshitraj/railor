from __future__ import annotations

from typing import Any, Iterator

from .._http import Transport


class Capabilities:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def list(
        self,
        *,
        provider: str | None = None,
        product: str | None = None,
        entity_country: str | None = None,
        destination_country: str | None = None,
        destination_currency: str | None = None,
        asset: str | None = None,
        network: str | None = None,
        availability: str | None = None,
        limit: int | None = None,
        starting_after: str | None = None,
        include_demo: bool | None = None,
    ) -> dict[str, Any]:
        """GET /v1/capabilities — one page of raw capability rows, each with its
        evidence. Follow `has_more` with `starting_after=<last id>`."""
        return self._transport.get(
            "/v1/capabilities",
            query={
                "provider": provider,
                "product": product,
                "entity_country": entity_country,
                "destination_country": destination_country,
                "destination_currency": destination_currency,
                "asset": asset,
                "network": network,
                "availability": availability,
                "limit": limit,
                "starting_after": starting_after,
                "include_demo": None if include_demo is None else str(include_demo).lower(),
            },
        )

    def list_all(self, **filters: Any) -> Iterator[dict[str, Any]]:
        """Every matching capability, following cursors for you."""
        filters.pop("starting_after", None)
        cursor: str | None = None
        while True:
            page = self.list(starting_after=cursor, **filters)
            data = page.get("data", [])
            yield from data
            if not page.get("has_more") or not data:
                return
            cursor = data[-1]["id"]
