"""Requirement normalization.

Providers say the same thing five different ways. Everything maps onto one
vocabulary so an organization's KYB profile can be reused across providers.
Unmapped phrases are returned as unknowns rather than silently dropped — an
unknown requirement is a gap in the vocabulary, and gaps should be visible.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

REQUIREMENT_ALIASES: dict[str, tuple[str, ...]] = {
    "company_registration": (
        "certificate of incorporation",
        "company registration",
        "registration certificate",
        "coi",
        "trade licence",
        "trade license",
    ),
    "director_identity": (
        "director id",
        "director identification",
        "officer identity",
        "passport of director",
        "government id",
    ),
    "ubo_disclosure": (
        "ultimate beneficial owner",
        "beneficial owner",
        "ubo",
        "ownership structure",
        "shareholder register",
    ),
    "business_address_proof": (
        "proof of address",
        "address proof",
        "registered office",
        "utility bill",
    ),
    "sanctions_screening": ("sanctions", "aml screening", "watchlist screening", "pep check"),
    "source_of_funds": ("source of funds", "source of wealth", "sof", "funds origin"),
    "bank_statement": ("bank statement", "account statement", "statement of account"),
    "director_selfie": ("selfie", "liveness", "video kyc", "face verification"),
    "processing_history": ("processing history", "processing statements", "volume history"),
    "licence_disclosure": ("licence", "license", "msb registration", "regulatory permission"),
    "website_review": ("website review", "product review", "live website", "demo of the product"),
    "webhook_endpoint": ("webhook", "callback url"),
}


@dataclass
class NormalizedRequirement:
    key: str | None
    phrase: str
    confidence: float


def normalize_requirement(phrase: str) -> NormalizedRequirement:
    lowered = re.sub(r"[^a-z0-9 ]+", " ", phrase.lower())
    lowered = re.sub(r"\s+", " ", lowered).strip()

    for key, aliases in REQUIREMENT_ALIASES.items():
        for alias in aliases:
            if alias in lowered:
                # Longer alias matches are less likely to be coincidental.
                confidence = 0.95 if len(alias) > 12 else 0.85
                return NormalizedRequirement(key=key, phrase=phrase, confidence=confidence)

    return NormalizedRequirement(key=None, phrase=phrase, confidence=0.0)


def normalize_requirements(phrases: list[str]) -> list[NormalizedRequirement]:
    return [normalize_requirement(phrase) for phrase in phrases]


def extract_requirement_phrases(text: str) -> list[str]:
    """Pulls list-like lines out of an onboarding page or a provider email."""
    phrases: list[str] = []
    for line in text.splitlines():
        stripped = line.strip(" \t-•*·—")
        if 3 < len(stripped) < 160 and not stripped.endswith((".", "?")):
            phrases.append(stripped)
    return phrases
