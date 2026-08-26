"""Thin authenticated HTTP transport over Railor's /v1 API. No retries, no
magic — every resource method is one call to this, so the returned dict is
exactly what the API responded with. Mirrors apps/cli/src/client.ts so the
CLI and this SDK behave identically against the same endpoints.
"""

from __future__ import annotations

from typing import Any

import httpx

from .errors import RailorAPIError, RailorConnectionError


class Transport:
    def __init__(self, base_url: str, api_key: str, *, timeout: float = 30.0) -> None:
        self._client = httpx.Client(
            base_url=base_url,
            headers={"authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
    ) -> Any:
        params = {k: v for k, v in (query or {}).items() if v is not None}
        try:
            response = self._client.request(method, path, params=params, json=body)
        except httpx.RequestError as exc:
            raise RailorConnectionError(
                f"Could not reach {self._client.base_url}. Is the app running? ({exc})"
            ) from exc

        try:
            data = response.json()
        except ValueError:
            data = None

        if response.is_error:
            error = (data or {}).get("error") or {}
            raise RailorAPIError(
                response.status_code,
                error.get("code", f"http_{response.status_code}"),
                error.get("message", response.reason_phrase),
            )
        return data

    def get(self, path: str, *, query: dict[str, Any] | None = None) -> Any:
        return self.request("GET", path, query=query)

    def post(self, path: str, *, body: dict[str, Any] | None = None) -> Any:
        return self.request("POST", path, body=body)

    def patch(self, path: str, *, body: dict[str, Any] | None = None) -> Any:
        return self.request("PATCH", path, body=body)

    def delete(self, path: str) -> Any:
        return self.request("DELETE", path)

    def close(self) -> None:
        self._client.close()
