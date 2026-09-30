"""Discovery jobs: corridor ("who can do IN business → AE AED?") and provider ("what do Wise's own pages say?")."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Protocol

from . import names
from .gemini import Claim, ExtractionFailed, Gemini, GeminiLike, GroundedResult, UngroundedAnswer
from .verify import FetchedPage, SkippedPage, fetch_cited_pages, normalize, quote_on_page, quote_supports, registrable_domain

DEFAULT_UA = "RailorBot/0.1 (+https://railor.dev/bot; infrastructure capability mapping)"

EXTRACTION_RULES = """You extract facts about payment providers from the SOURCES below — nothing else.
Rules:
- Only facts stated in a source. Never use outside knowledge; never infer.
- `quote` must be ONE contiguous sentence copied exactly from that source's text (it is checked character by character). No ellipses, no joining sentences.
- `provider_website` only when the page itself names or links the company's site; otherwise null.
- Country codes ISO-2, currency codes ISO-4217, only when the source states them.
- Skip marketing fluff with no checkable fact (e.g. "fast and secure").
- At most 30 claims, most specific first."""

KIND_TO_CHANGE = {
    "coverage": "coverage_changed",
    "pricing": "pricing_changed",
    "limit": "limit_changed",
    "requirement": "requirement_changed",
    "product": "product_launched",
    "speed": "documentation_changed",
}


@dataclass
class CorridorQuery:
    entity_country: str
    destination_country: str
    destination_currency: str
    source_asset: str | None = None
    customer_type: str = "business"

    def question(self) -> str:
        source = f"{names.currency(self.source_asset)} " if self.source_asset else ""
        return (
            "Search the web now and cite your sources. "
            f"Which payment providers let a {self.customer_type} incorporated in {names.country(self.entity_country)} send {source}payments "
            f"that arrive as {names.currency(self.destination_currency)} in {names.country(self.destination_country)}? "
            "Prefer each provider's own official pages (pricing, coverage, supported countries, fees, limits, onboarding requirements)."
        )


@dataclass
class VerifiedClaim:
    claim: Claim
    page: FetchedPage
    official: bool


@dataclass
class DiscoveryReport:
    kind: str
    query: dict
    search_queries: list[str] = field(default_factory=list)
    pages: list[FetchedPage] = field(default_factory=list)
    skipped: list[SkippedPage] = field(default_factory=list)
    extracted: int = 0
    verified: list[VerifiedClaim] = field(default_factory=list)
    rejected: list[tuple[Claim, str]] = field(default_factory=list)
    change_events: int = 0
    candidates: int = 0
    error: str | None = None

    def summary(self) -> dict:
        return {
            "search_queries": self.search_queries,
            "pages_fetched": len(self.pages),
            "pages_skipped": len(self.skipped),
            "claims_extracted": self.extracted,
            "claims_verified": len(self.verified),
            "claims_rejected": len(self.rejected),
            "change_events": self.change_events,
            "candidates": self.candidates,
            "sources": [{"url": p.url, "title": p.title} for p in self.pages],
            "skipped": [{"url": s.url, "reason": s.reason} for s in self.skipped[:20]],
            "rejected": [{"provider": c.provider_name, "reason": r} for c, r in self.rejected[:20]],
        }


class Sink(Protocol):
    """Where verified claims go. DbSink writes to the review queue; DryRun only reports."""

    def known_providers(self) -> list[dict]: ...
    def record(self, report: DiscoveryReport, verified: VerifiedClaim, provider: dict | None) -> str: ...


def _match_provider(claim: Claim, page: FetchedPage, providers: list[dict]) -> dict | None:
    stated = registrable_domain(claim.provider_website or "") if claim.provider_website else ""
    name = claim.provider_name.strip().lower()
    for p in providers:
        domain = registrable_domain(p.get("website_url") or "") if p.get("website_url") else ""
        if domain and stated and (stated == domain or stated.endswith("." + domain)):
            return p
        if p["name"].strip().lower() == name or p["slug"] == name.replace(" ", "-"):
            return p
    return None


def _alnum(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def _names_domain(provider_name: str, domain: str) -> bool:
    """A company's own site: its first domain label spells the company name (skydo.com ↔ Skydo)."""
    label, name = _alnum(domain.split(".")[0]), _alnum(provider_name)
    return len(label) >= 4 and len(name) >= 4 and (label == name or label.startswith(name) or name.startswith(label))


def _verify(report: DiscoveryReport, claims: list[Claim], only_provider: dict | None = None) -> None:
    by_id = {p.source_id: p for p in report.pages}
    seen: set[tuple[str, str]] = set()
    for claim in claims:
        page = by_id.get(claim.source_id)
        if page is not None and not claim.provider_website and _names_domain(claim.provider_name, registrable_domain(page.url)):
            claim.provider_website = registrable_domain(page.url)
        page = by_id.get(claim.source_id)
        if page is None:
            report.rejected.append((claim, f"cited source [{claim.source_id}] was not one of the fetched pages"))
            continue
        if not quote_on_page(claim.quote, page.text):
            report.rejected.append((claim, "quote not found verbatim on the page"))
            continue
        if not quote_supports(claim.statement, claim.quote, claim.provider_name):
            report.rejected.append((claim, "quote is on the page but does not state this claim"))
            continue
        key = (claim.provider_name.strip().lower(), normalize(claim.statement))
        if key in seen:
            continue  # the same fact from another locale's copy of the page adds nothing
        seen.add(key)
        page_domain = registrable_domain(page.url)
        stated = registrable_domain(claim.provider_website) if claim.provider_website else ""
        if only_provider is not None:
            official_domain = registrable_domain(only_provider.get("website_url") or "")
            official = bool(official_domain) and (page_domain == official_domain or page_domain.endswith("." + official_domain))
        else:
            official = bool(stated) and (page_domain == stated or page_domain.endswith("." + stated))
        report.verified.append(VerifiedClaim(claim, page, official))


def _run(report: DiscoveryReport, prompt: str, instructions: str, gemini: GeminiLike, sink: Sink, only_provider: dict | None, user_agent: str, max_pages: int) -> DiscoveryReport:
    try:
        grounded: GroundedResult = gemini.grounded_search(prompt)
    except UngroundedAnswer as exc:
        report.error = str(exc)
        return report
    report.search_queries = grounded.queries
    report.pages, report.skipped = fetch_cited_pages(grounded.citations, user_agent=user_agent, max_pages=max_pages)
    if not report.pages:
        report.error = "None of the cited pages could be fetched and read; nothing recorded."
        return report
    try:
        claims = gemini.extract_claims(instructions, [(p.source_id, p.url, p.text) for p in report.pages])
    except ExtractionFailed as exc:
        report.error = str(exc)
        return report
    report.extracted = len(claims)
    _verify(report, claims, only_provider)
    providers = sink.known_providers()
    for verified in report.verified:
        if only_provider and not only_provider.get("id"):
            # Company mode: not in the registry yet — every verified claim is candidate evidence for it.
            verified.claim.provider_name = only_provider["name"]
            verified.claim.provider_website = registrable_domain(only_provider.get("website_url") or "") or verified.claim.provider_website
            target = _match_provider(verified.claim, verified.page, providers)
        else:
            target = only_provider or _match_provider(verified.claim, verified.page, providers)
        outcome = sink.record(report, verified, target)
        if outcome == "change_event":
            report.change_events += 1
        elif outcome == "candidate":
            report.candidates += 1
    return report


def run_corridor(query: CorridorQuery, sink: Sink, *, gemini: GeminiLike | None = None, max_pages: int = 8) -> DiscoveryReport:
    report = DiscoveryReport(kind="corridor", query=query.__dict__)
    instructions = f"{EXTRACTION_RULES}\nFocus: providers serving a {query.customer_type} in {names.country(query.entity_country)} paying into {names.country(query.destination_country)} in {names.currency(query.destination_currency)}."
    return _run(report, query.question(), instructions, gemini or Gemini(), sink, None, os.getenv("RAILOR_USER_AGENT", DEFAULT_UA), max_pages)


def run_provider(provider: dict, sink: Sink, *, gemini: GeminiLike | None = None, max_pages: int = 8) -> DiscoveryReport:
    """Deepen one known provider from its own official pages."""
    report = DiscoveryReport(kind="provider", query={"provider": provider["slug"]})
    domain = registrable_domain(provider.get("website_url") or "")
    site = f" (official site {domain})" if domain else ""
    prompt = (
        "Search the web now and cite your sources. "
        f"Find {provider['name']}{site}'s own official pages about: supported countries and currencies for payouts and collections, "
        "fees and FX pricing, transaction limits, settlement times, and business onboarding requirements."
    )
    instructions = f"{EXTRACTION_RULES}\nOnly claims about {provider['name']}; set provider_name to \"{provider['name']}\"."
    return _run(report, prompt, instructions, gemini or Gemini(), sink, provider, os.getenv("RAILOR_USER_AGENT", DEFAULT_UA), max_pages)


def run_company(name: str, domain: str, sink: Sink, *, gemini: GeminiLike | None = None, max_pages: int = 8) -> DiscoveryReport:
    """A company Railor doesn't list yet: its own pages become a provider candidate for an operator to approve."""
    company = {"id": None, "slug": _alnum(name), "name": name, "website_url": f"https://{registrable_domain(domain)}"}
    report = run_provider(company, sink, gemini=gemini, max_pages=max_pages)
    report.kind = "company"
    report.query = {"name": name, "domain": registrable_domain(domain)}
    return report


class DryRun:
    """Reports what a run would record, touching no database."""

    def __init__(self, providers: list[dict] | None = None) -> None:
        self._providers = providers or []
        self.records: list[tuple[str, VerifiedClaim, dict | None]] = []

    def known_providers(self) -> list[dict]:
        return self._providers

    def record(self, report: DiscoveryReport, verified: VerifiedClaim, provider: dict | None) -> str:
        outcome = "change_event" if provider else ("candidate" if verified.claim.provider_website else "unattributed")
        self.records.append((outcome, verified, provider))
        return outcome
