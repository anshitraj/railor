"""Content and capability extraction.

Two stages, deliberately separate:

  1. Content extraction — HTML to readable text (deterministic, no model).
  2. Structured extraction — text to candidate capability claims.

Stage 2 is rule-based here. A model adapter can be slotted in behind
`StructuredExtractor`, but its output is always marked `derivation="model"`,
always routed to review, and never published as verified.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Protocol

from selectolax.parser import HTMLParser

COUNTRY_CODES = {
    "india": "IN",
    "united arab emirates": "AE",
    "uae": "AE",
    "united states": "US",
    "united kingdom": "GB",
    "singapore": "SG",
    "nigeria": "NG",
    "saudi arabia": "SA",
    "germany": "DE",
    "france": "FR",
    "netherlands": "NL",
    "brazil": "BR",
    "mexico": "MX",
    "kenya": "KE",
    "south africa": "ZA",
    "philippines": "PH",
    "indonesia": "ID",
    "canada": "CA",
    "australia": "AU",
    "hong kong": "HK",
    "switzerland": "CH",
}

CURRENCIES = {"USD", "EUR", "GBP", "AED", "INR", "NGN", "SGD", "BRL"}
ASSETS = {"USDC", "USDT", "EURC", "PYUSD"}
NETWORKS = {"ethereum", "base", "polygon", "arbitrum", "solana", "tron"}

NEGATION = re.compile(
    r"\b(not|cannot|can't|unable to|do not|does not|no longer|unsupported|excluded)\b",
    re.IGNORECASE,
)
SUPPORT = re.compile(
    r"\b(support|supported|available|offer|offered|accept|accepted|enabled)\b", re.IGNORECASE
)


def to_text(html: str) -> str:
    """Strips chrome and returns the readable body text."""
    tree = HTMLParser(html)
    for tag in ("script", "style", "nav", "footer", "header", "noscript", "svg"):
        for node in tree.css(tag):
            node.decompose()
    main = tree.css_first("main") or tree.css_first("article") or tree.body
    text = main.text(separator="\n") if main else tree.text(separator="\n")
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", text)).strip()


@dataclass
class Claim:
    """A candidate capability statement, not yet published truth."""

    kind: str  # entity_country | destination | asset | network | requirement
    key: str
    availability: str  # supported | partial | unsupported | unknown
    excerpt: str
    confidence: float
    derivation: str = "source"
    dimensions: dict[str, str] = field(default_factory=dict)


class StructuredExtractor(Protocol):
    def extract(self, text: str) -> list[Claim]: ...


class RuleExtractor:
    """Deterministic sentence-level extraction. Conservative by design."""

    def extract(self, text: str) -> list[Claim]:
        claims: list[Claim] = []
        for sentence in re.split(r"(?<=[.!?])\s+|\n", text):
            snippet = sentence.strip()
            if not snippet or len(snippet) > 400:
                continue
            lowered = snippet.lower()

            polarity = (
                "unsupported"
                if NEGATION.search(snippet)
                else "supported"
                if SUPPORT.search(snippet)
                else None
            )
            if polarity is None:
                continue

            entity_context = any(
                word in lowered for word in ("incorporated", "registered in", "entities", "businesses based")
            )

            for name, code in COUNTRY_CODES.items():
                if name not in lowered:
                    continue
                claims.append(
                    Claim(
                        kind="entity_country" if entity_context else "destination",
                        key=code,
                        availability=polarity,
                        excerpt=snippet,
                        # Country + explicit polarity in one sentence is a decent
                        # signal, but never treated as certain.
                        confidence=0.75 if entity_context else 0.65,
                        dimensions={"country": code},
                    )
                )

            for asset in ASSETS:
                if asset.lower() in lowered:
                    claims.append(
                        Claim(
                            kind="asset",
                            key=asset,
                            availability=polarity,
                            excerpt=snippet,
                            confidence=0.7,
                            dimensions={"asset": asset},
                        )
                    )

            for network in NETWORKS:
                if re.search(rf"\b{network}\b", lowered):
                    claims.append(
                        Claim(
                            kind="network",
                            key=network,
                            availability=polarity,
                            excerpt=snippet,
                            confidence=0.7,
                            dimensions={"network": network},
                        )
                    )

            for currency in CURRENCIES:
                if re.search(rf"\b{currency}\b", snippet):
                    claims.append(
                        Claim(
                            kind="destination",
                            key=currency,
                            availability=polarity,
                            excerpt=snippet,
                            confidence=0.6,
                            dimensions={"currency": currency},
                        )
                    )

        return _dedupe(claims)


def _dedupe(claims: list[Claim]) -> list[Claim]:
    """Keeps the most negative statement per key: an explicit 'no' outranks a 'yes'."""
    best: dict[tuple[str, str], Claim] = {}
    rank = {"unsupported": 3, "partial": 2, "supported": 1, "unknown": 0}
    for claim in claims:
        key = (claim.kind, claim.key)
        current = best.get(key)
        if current is None or rank[claim.availability] > rank[current.availability]:
            best[key] = claim
    return list(best.values())
