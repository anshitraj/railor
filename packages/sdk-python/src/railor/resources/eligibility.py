from __future__ import annotations

from typing import Any

from .._http import Transport
from .._util import drop_none


class Eligibility:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def check(
        self,
        *,
        provider: str | None = None,
        satisfied_requirements: list[str] | None = None,
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
    ) -> dict[str, Any]:
        """POST /v1/eligibility — not "who serves this corridor" but "could *my
        organization* clear onboarding": the org's KYB profile (or an explicit
        `satisfied_requirements` override) diffed against each provider's
        published requirements. Omit `provider` to check every provider.
        """
        body = drop_none(
            {
                "provider": provider,
                "satisfied_requirements": satisfied_requirements,
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
            }
        )
        return self._transport.post("/v1/eligibility", body=body)
