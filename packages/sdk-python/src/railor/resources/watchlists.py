from __future__ import annotations

from typing import Any

from .._http import Transport
from .._util import drop_none


class Watchlists:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def list(self) -> dict[str, Any]:
        """GET /v1/watchlists — the org's monitors, with unread alert counts."""
        return self._transport.get("/v1/watchlists")

    def create(
        self,
        *,
        target_type: str,
        target_id: str,
        label: str | None = None,
        kinds: list[str] | None = None,
        channel_email: bool | None = None,
        digest: str | None = None,
    ) -> dict[str, Any]:
        """POST /v1/watchlists — arm a monitor on a provider, corridor, country,
        asset or product. Idempotent on (organization, target): re-creating the
        same watch returns the existing row with `created: False`.
        """
        body = drop_none(
            {
                "target_type": target_type,
                "target_id": target_id,
                "label": label,
                "kinds": kinds,
                "channel_email": channel_email,
                "digest": digest,
            }
        )
        return self._transport.post("/v1/watchlists", body=body)

    def retrieve(self, id: str) -> dict[str, Any]:
        """GET /v1/watchlists/{id} — one monitor plus its ten most recent alerts."""
        return self._transport.get(f"/v1/watchlists/{id}")

    def update(
        self,
        id: str,
        *,
        label: str | None = None,
        kinds: list[str] | None = None,
        channel_email: bool | None = None,
        digest: str | None = None,
    ) -> dict[str, Any]:
        """PATCH /v1/watchlists/{id} — retune kinds, digest, label or email channel."""
        body = drop_none(
            {
                "label": label,
                "kinds": kinds,
                "channel_email": channel_email,
                "digest": digest,
            }
        )
        return self._transport.patch(f"/v1/watchlists/{id}", body=body)

    def delete(self, id: str) -> dict[str, Any]:
        """DELETE /v1/watchlists/{id} — disarm. Change events it raised stay on record."""
        return self._transport.delete(f"/v1/watchlists/{id}")

    def alerts(self, id: str, *, limit: int = 25) -> dict[str, Any]:
        """GET /v1/watchlists/{id}/alerts — what this monitor has raised, newest first."""
        return self._transport.get(f"/v1/watchlists/{id}/alerts", query={"limit": limit})
