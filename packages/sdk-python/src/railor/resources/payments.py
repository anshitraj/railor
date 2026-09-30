from __future__ import annotations

from typing import Any

from .._http import Transport
from .._util import drop_none


class Beneficiaries:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def list(self) -> dict[str, Any]:
        """GET /v1/beneficiaries — masked hints only; account details never leave Railor."""
        return self._transport.get("/v1/beneficiaries")

    def create(
        self,
        *,
        holder_type: str,
        holder_name: str,
        country: str,
        currency: str,
        method: str,
        details: dict[str, str],
        network: str | None = None,
        label: str | None = None,
    ) -> dict[str, Any]:
        """POST /v1/beneficiaries — validated, encrypted at rest, deduplicated."""
        return self._transport.post(
            "/v1/beneficiaries",
            body=drop_none(
                {
                    "holder_type": holder_type,
                    "holder_name": holder_name,
                    "country": country,
                    "currency": currency,
                    "method": method,
                    "network": network,
                    "label": label,
                    "details": details,
                }
            ),
        )

    def archive(self, id: str) -> dict[str, Any]:
        return self._transport.delete(f"/v1/beneficiaries/{id}")


class Routes:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def plan(self, *, intent: dict[str, Any], provider: str | None = None) -> dict[str, Any]:
        """POST /v1/routes — policy verdict, ranked providers and exclusions, nothing created."""
        return self._transport.post("/v1/routes", body=drop_none({"intent": intent, "provider": provider}))


class Prices:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def check(
        self,
        *,
        source_currency: str,
        destination_currency: str,
        amount: float,
        destination_country: str | None = None,
        include_market: bool = False,
    ) -> dict[str, Any]:
        """POST /v1/prices — what arrives through each provider; every row carries its ``basis``."""
        return self._transport.post(
            "/v1/prices",
            body=drop_none(
                {
                    "source_currency": source_currency,
                    "destination_currency": destination_currency,
                    "amount": amount,
                    "destination_country": destination_country,
                    "include_market": include_market,
                }
            ),
        )


class Payments:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def list(self, *, status: str | None = None, limit: int | None = None) -> dict[str, Any]:
        return self._transport.get("/v1/payments", query={"status": status, "limit": limit})

    def create(
        self,
        *,
        beneficiary_id: str,
        intent: dict[str, Any],
        provider: str | None = None,
        reference: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        """POST /v1/payments — policy decision + route plan. Does not send; call submit()."""
        return self._transport.request(
            "POST",
            "/v1/payments",
            body=drop_none({"beneficiary_id": beneficiary_id, "intent": intent, "provider": provider, "reference": reference}),
            headers={"Idempotency-Key": idempotency_key} if idempotency_key else None,
        )

    def retrieve(self, id: str) -> dict[str, Any]:
        return self._transport.get(f"/v1/payments/{id}")

    def submit(self, id: str) -> dict[str, Any]:
        """POST /v1/payments/{id}/submit — sends it. Exactly one submit wins."""
        return self._transport.post(f"/v1/payments/{id}/submit")

    def cancel(self, id: str) -> dict[str, Any]:
        return self._transport.post(f"/v1/payments/{id}/cancel")
