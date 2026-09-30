from __future__ import annotations

import os
from typing import Any

from ._http import Transport
from .resources.capabilities import Capabilities
from .resources.changes import Changes
from .resources.payments import Beneficiaries, Payments, Prices, Routes
from .resources.corridors import Corridors
from .resources.eligibility import Eligibility
from .resources.providers import Providers
from .resources.watchlists import Watchlists

DEFAULT_BASE_URL = "http://localhost:3000"


class Railor:
    """
        from railor import Railor

        railor = Railor()  # reads RAILOR_API_KEY
        railor.corridors.search(entity_country="IN", destination_country="AE")
    """

    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        key = api_key or os.environ.get("RAILOR_API_KEY")
        if not key:
            raise ValueError(
                "No API key. Pass api_key=... or set the RAILOR_API_KEY environment "
                "variable. Find your test key in the dashboard under Developers."
            )
        url = base_url or os.environ.get("RAILOR_API_URL") or DEFAULT_BASE_URL

        self._transport = Transport(url, key, timeout=timeout)
        self.providers = Providers(self._transport)
        self.corridors = Corridors(self._transport)
        self.eligibility = Eligibility(self._transport)
        self.changes = Changes(self._transport)
        self.watchlists = Watchlists(self._transport)
        self.capabilities = Capabilities(self._transport)
        self.beneficiaries = Beneficiaries(self._transport)
        self.routes = Routes(self._transport)
        self.prices = Prices(self._transport)
        self.payments = Payments(self._transport)

    def compare(self, providers: list[str], *, only_differences: bool = False) -> dict[str, Any]:
        """POST /v1/compare — 2–4 providers on the same dimensions."""
        return self._transport.post(
            "/v1/compare", body={"providers": providers, "only_differences": only_differences}
        )

    def close(self) -> None:
        self._transport.close()

    def __enter__(self) -> "Railor":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()
