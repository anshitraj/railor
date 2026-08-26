from __future__ import annotations

from typing import Any

from .._http import Transport


class Changes:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def list(
        self,
        *,
        limit: int = 25,
        provider: str | None = None,
        since: str | None = None,
    ) -> dict[str, Any]:
        """GET /v1/changes — detected provider changes, newest first, with review
        status. `since` accepts a duration ("7d", "24h", "30m") or an ISO date.
        """
        return self._transport.get(
            "/v1/changes",
            query={"limit": limit, "provider": provider, "since": since},
        )
