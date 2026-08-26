"""Everything this client raises. Two failure modes only: the request never
reached Railor, or Railor answered with an error — never a bare httpx/JSON
exception leaking through to caller code.
"""

from __future__ import annotations


class RailorError(Exception):
    """Base class for every error raised by this client."""


class RailorConnectionError(RailorError):
    """The request never reached Railor — network, DNS or timeout failure."""


class RailorAPIError(RailorError):
    """Railor received the request and answered with an error."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.status = status
        self.code = code
        self.message = message
