"""Discovery must never let an unverified claim through. No network, no model: fakes only."""

from __future__ import annotations

import pytest

from railor_worker.discovery import run as run_mod
from railor_worker.discovery.gemini import Citation, Claim, GroundedResult, UngroundedAnswer
from railor_worker.discovery.rails import naming_sentence
from railor_worker.discovery.run import CorridorQuery, DryRun, run_company, run_corridor
from railor_worker.discovery.verify import FetchedPage, quote_on_page, quote_supports
from railor_worker.netguard import BlockedURL, assert_public_url, is_private_host

PAGE_TEXT = (
    "Skydo helps Indian exporters get paid. "
    "Skydo charges a flat fee of USD 29 for payments between USD 2,001 and USD 10,000. "
    "Funds settle to your Indian bank account within 24 hours. "
    "No, Skydo works well for freelancers and agencies."
)


def page(sid: int, url: str, text: str = PAGE_TEXT) -> FetchedPage:
    return FetchedPage(sid, url, url, f"<p>{text}</p>", text, 200, "0" * 64)


class FakeGemini:
    def __init__(self, claims: list[Claim], grounded: bool = True) -> None:
        self.claims = claims
        self.grounded = grounded

    def grounded_search(self, prompt: str) -> GroundedResult:
        if not self.grounded:
            raise UngroundedAnswer("answered from memory")
        return GroundedResult(["q"], [Citation("https://vertexaisearch.cloud.google.com/grounding-api-redirect/x", "skydo.com")])

    def extract_claims(self, instructions, sources):
        return self.claims


def claim(**kw) -> Claim:
    base = dict(provider_name="Skydo", provider_website=None, kind="pricing", statement="Skydo charges USD 29 for payments between USD 2,001 and USD 10,000.",
                quote="Skydo charges a flat fee of USD 29 for payments between USD 2,001 and USD 10,000.", source_id=1)
    base.update(kw)
    return Claim(**base)


@pytest.fixture
def pages(monkeypatch):
    fetched = [page(1, "https://www.skydo.com/pricing")]
    monkeypatch.setattr(run_mod, "fetch_cited_pages", lambda citations, **kw: (fetched, []))
    return fetched


def test_quote_must_be_on_the_page_verbatim():
    assert quote_on_page("Funds settle to your Indian bank account within 24 hours.", PAGE_TEXT)
    assert quote_on_page("FUNDS  settle to your Indian bank account within 24 hours.", PAGE_TEXT)  # case/space are presentation
    assert not quote_on_page("Funds settle to your Indian bank account within 12 hours.", PAGE_TEXT)
    assert not quote_on_page("Skydo charges a flat fee ... USD 10,000.", PAGE_TEXT)  # edited quotes never pass
    assert not quote_on_page("Skydo helps", PAGE_TEXT)  # too short to prove anything


def test_quote_must_support_the_statement():
    assert quote_supports("Funds settle within 24 hours.", "Funds settle to your Indian bank account within 24 hours.")
    assert not quote_supports("Funds settle within 12 hours.", "Funds settle to your Indian bank account within 24 hours.")
    assert not quote_supports("There is no limit on how much you can receive.", "No, Skydo works well for freelancers and agencies.", "Skydo")


def test_verified_claims_pass_and_fabrications_are_rejected(pages):
    gemini = FakeGemini([
        claim(),
        claim(statement="Skydo settles in 12 hours.", quote="Funds settle to your Indian bank account within 12 hours."),  # not on page
        claim(kind="limit", statement="There is no limit on transfers.", quote="No, Skydo works well for freelancers and agencies."),  # unrelated quote
        claim(source_id=9),  # cites a page Railor never fetched
    ])
    sink = DryRun([{"id": "p1", "slug": "skydo", "name": "Skydo", "website_url": "https://www.skydo.com"}])
    report = run_corridor(CorridorQuery("IN", "IN", "INR", "USD"), sink, gemini=gemini)
    assert len(report.verified) == 1
    assert report.verified[0].official  # skydo.com page, skydo.com company
    reasons = sorted(r for _, r in report.rejected)
    assert any("not found verbatim" in r for r in reasons)
    assert any("does not state" in r for r in reasons)
    assert any("not one of the fetched pages" in r for r in reasons)
    assert [o for o, _, _ in sink.records] == ["change_event"]


def test_ungrounded_answers_record_nothing(pages):
    report = run_corridor(CorridorQuery("IN", "AE", "AED"), DryRun(), gemini=FakeGemini([claim()], grounded=False))
    assert report.error and not report.verified


def test_unknown_company_becomes_a_candidate(pages):
    sink = DryRun([])
    report = run_company("Skydo", "skydo.com", sink, gemini=FakeGemini([claim()]))
    assert report.kind == "company" and len(report.verified) == 1
    assert [o for o, _, _ in sink.records] == ["candidate"]


def test_rail_sentence_is_whole_and_descriptive():
    text = "Home News Blog\nThe New Payments Platform (NPP) is open access infrastructure for fast payments in\nAustralia. NPP news this week."
    assert naming_sentence(text, ("New Payments Platform", "NPP")) == "The New Payments Platform (NPP) is open access infrastructure for fast payments in Australia."
    assert naming_sentence("NPP Chairman meets delegation.", ("NPP",)) is None


def test_private_addresses_are_blocked():
    for host in ("localhost", "127.0.0.1", "10.0.0.5", "169.254.169.254", "::1", "::ffff:10.0.0.1", "metadata.internal"):
        assert is_private_host(host), host
    assert not is_private_host("93.184.216.34")
    with pytest.raises(BlockedURL):
        assert_public_url("http://127.0.0.1:8080/admin")
    with pytest.raises(BlockedURL):
        assert_public_url("file:///etc/passwd")
