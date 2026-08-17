"""Change detection.

Diffs are taken on *normalized values*, never on raw HTML: a marketing rewrite
that leaves the facts intact must not raise a coverage alert, and a one-word
change that flips eligibility must not be lost in the noise.
"""

from __future__ import annotations

from dataclasses import dataclass

from .extract import Claim

KIND_FOR = {
    "entity_country": "coverage_changed",
    "destination": "coverage_changed",
    "asset": "coverage_changed",
    "network": "coverage_changed",
    "requirement": "requirement_changed",
    "fee": "pricing_changed",
    "limit": "limit_changed",
}

# Changing any of these can break a live integration, so a human sees them first.
REVIEW_REQUIRED = {"entity_country", "requirement", "fee", "limit"}


@dataclass
class Change:
    kind: str
    field: str
    previous_value: str | None
    current_value: str | None
    summary: str
    confidence: float
    affects: dict[str, str]
    review_status: str


def _describe(provider: str, claim: Claim, previous: str | None) -> str:
    subject = {
        "entity_country": f"{claim.key}-incorporated businesses",
        "destination": f"payouts involving {claim.key}",
        "asset": f"{claim.key} settlement",
        "network": f"deposits on {claim.key}",
        "requirement": f"the {claim.key} requirement",
    }.get(claim.kind, claim.key)

    if previous is None:
        return f"{provider} published a new statement about {subject}: {claim.availability}."
    if claim.availability == "unsupported":
        return f"{provider} no longer supports {subject}."
    if claim.availability == "supported":
        return f"{provider} now supports {subject}."
    return f"{provider} changed {subject} from {previous} to {claim.availability}."


def diff_claims(
    provider_name: str,
    claims: list[Claim],
    published: dict[str, str],
) -> list[Change]:
    """Compares freshly extracted claims against what Railor currently publishes."""
    changes: list[Change] = []

    for claim in claims:
        key = f"{claim.kind}:{claim.key}"
        previous = published.get(key)

        if previous == claim.availability:
            continue

        # A low-confidence extraction never overturns a published fact on its own.
        if previous is not None and claim.confidence < 0.7:
            changes.append(
                Change(
                    kind="documentation_changed",
                    field=key,
                    previous_value=previous,
                    current_value=claim.availability,
                    summary=(
                        f"{provider_name} changed wording near {claim.key}; Railor could not "
                        f"determine whether the underlying capability changed."
                    ),
                    confidence=claim.confidence,
                    affects=claim.dimensions,
                    review_status="pending",
                )
            )
            continue

        review = "pending" if claim.kind in REVIEW_REQUIRED or claim.confidence < 0.9 else "approved"
        changes.append(
            Change(
                kind=KIND_FOR.get(claim.kind, "documentation_changed"),
                field=key,
                previous_value=previous,
                current_value=claim.availability,
                summary=_describe(provider_name, claim, previous),
                confidence=claim.confidence,
                affects=claim.dimensions,
                review_status=review,
            )
        )

    return changes
