"""The two rules the ingestion side must never break:

  1. Provider phrasing maps onto one requirement vocabulary.
  2. A low-confidence extraction never silently overturns a published fact.
"""

from railor_worker.diff import diff_claims
from railor_worker.extract import Claim, RuleExtractor, to_text
from railor_worker.normalize import normalize_requirement, normalize_requirements


def test_requirement_aliases_collapse_to_one_key():
    phrases = [
        "Ultimate Beneficial Owner disclosure",
        "UBO information for all owners above 25%",
        "Beneficial owner details",
    ]
    keys = {r.key for r in normalize_requirements(phrases)}
    assert keys == {"ubo_disclosure"}


def test_unmapped_phrase_is_reported_not_dropped():
    result = normalize_requirement("Notarised board resolution in triplicate")
    assert result.key is None
    assert result.phrase.startswith("Notarised")


def test_html_extraction_strips_chrome():
    html = "<html><body><nav>menu</nav><main><p>We support UAE payouts.</p></main></body></html>"
    assert to_text(html) == "We support UAE payouts."


def test_negation_beats_support_for_the_same_key():
    text = "We support India. Indian incorporated businesses are not accepted for this product."
    claims = {(c.kind, c.key): c for c in RuleExtractor().extract(text)}
    entity = claims[("entity_country", "IN")]
    assert entity.availability == "unsupported"


def test_low_confidence_change_is_flagged_not_applied():
    claim = Claim(
        kind="destination",
        key="AE",
        availability="unsupported",
        excerpt="wording changed",
        confidence=0.55,
    )
    [change] = diff_claims("Marlin Accounts", [claim], {"destination:AE": "supported"})
    assert change.kind == "documentation_changed"
    assert change.review_status == "pending"
    assert "could not determine" in change.summary


def test_material_change_requires_review():
    claim = Claim(
        kind="entity_country",
        key="IN",
        availability="unsupported",
        excerpt="Indian entities are no longer accepted.",
        confidence=0.95,
    )
    [change] = diff_claims("Corvus Financial", [claim], {"entity_country:IN": "supported"})
    assert change.kind == "coverage_changed"
    assert change.review_status == "pending"
    assert "no longer supports" in change.summary


def test_unchanged_claim_produces_no_event():
    claim = Claim(
        kind="asset",
        key="USDC",
        availability="supported",
        excerpt="USDC is supported.",
        confidence=0.9,
    )
    assert diff_claims("Northwind Rails", [claim], {"asset:USDC": "supported"}) == []
