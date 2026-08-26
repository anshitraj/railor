from __future__ import annotations

from typing import Any

from .._http import Transport
from .._util import drop_none


class Corridors:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def search(
        self,
        *,
        entity_country: str | None = None,
        customer_type: str = "business",
        source_country: str | None = None,
        destination_country: str | None = None,
        source_asset: str | None = None,
        source_network: str | None = None,
        destination_currency: str | None = None,
        payment_method: str | None = None,
        product: str | None = None,
        amount: float | None = None,
        amount_currency: str | None = None,
        preset: str | None = None,
    ) -> dict[str, Any]:
        """POST /v1/corridors/search — every provider checked against this corridor,
        each result carrying eligibility, the reason behind it, confidence,
        last_verified_at and the evidence it rests on.

        `preset` is one of "balanced", "cheapest", "fastest",
        "easiest_onboarding", "widest_coverage".
        """
        body = drop_none(
            {
                "entity_country": entity_country,
                "customer_type": customer_type,
                "source_country": source_country,
                "destination_country": destination_country,
                "source_asset": source_asset,
                "source_network": source_network,
                "destination_currency": destination_currency,
                "payment_method": payment_method,
                "product": product,
                "amount": amount,
                "amount_currency": amount_currency,
                "preset": preset,
            }
        )
        return self._transport.post("/v1/corridors/search", body=body)
