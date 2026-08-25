"""
Registers the real, non-demo providers this worker actually crawls, and one
official-docs source per provider.

Deliberately separate from the TS demo dataset (packages/database/src/seed):
that script truncates and rebuilds every provider-owned table on every run
(see its header comment), which would destroy real evidence this worker has
already gathered. Real providers live outside that cycle — this module only
ever inserts, never truncates, and is safe to run again.

    python -m railor_worker.cli seed-sources
"""

from __future__ import annotations

from dataclasses import dataclass

from . import db

# Mirrors packages/database/src/seed/data.ts's API_TEST_KINDS + CONFORMANCE_LABELS
# exactly, so the demo and real datasets carry the same catalog shape.
CONFORMANCE_CATALOG: dict[str, str] = {
    "authentication": "Authentication",
    "quote_api": "Quote API",
    "quote_schema": "Quote schema",
    "idempotency": "Idempotency behavior",
    "beneficiary_validation": "Beneficiary validation",
    "status_endpoint": "Status endpoint",
    "asset_network_availability": "Asset/network availability",
    "response_schema": "Response schema",
    "docs_parity": "Docs/API parity",
}


@dataclass(frozen=True)
class RealProvider:
    slug: str
    name: str
    category: str
    description: str
    website_url: str
    docs_url: str


# Docs URLs verified reachable before being added here — see conversation
# history for the ones that 404'd on a first guess (docs.bridge.xyz,
# developers.ripple.com, ripple.com/ripple-usd) and what replaced them.
PROVIDERS: tuple[RealProvider, ...] = (
    RealProvider(
        slug="circle",
        name="Circle",
        category="Stablecoin infrastructure",
        description="Issuer of USDC and EURC; operates CCTP for native cross-chain USDC transfer.",
        website_url="https://www.circle.com",
        docs_url="https://developers.circle.com/",
    ),
    RealProvider(
        slug="tether",
        name="Tether",
        category="Stablecoin infrastructure",
        description="Issuer of USDT, the largest stablecoin by circulation, across multiple blockchains.",
        website_url="https://tether.to",
        docs_url="https://tether.to/en/supported-protocols/",
    ),
    RealProvider(
        slug="ethena",
        name="Ethena",
        category="Stablecoin infrastructure",
        description="Issuer of USDe, a synthetic dollar backed by crypto assets and delta-hedged futures.",
        website_url="https://ethena.fi",
        docs_url="https://docs.ethena.fi/",
    ),
    RealProvider(
        slug="paxos",
        name="Paxos",
        category="Stablecoin infrastructure",
        description="Regulated stablecoin issuer and infrastructure provider (USDP and white-label issuance).",
        website_url="https://paxos.com",
        docs_url="https://docs.paxos.com/",
    ),
    RealProvider(
        slug="coinbase",
        name="Coinbase",
        category="On/off-ramp",
        description="Exchange and developer platform offering onramp, wallet and stablecoin infrastructure APIs.",
        website_url="https://www.coinbase.com",
        docs_url="https://docs.cdp.coinbase.com/",
    ),
    RealProvider(
        slug="bridge",
        name="Bridge",
        category="Stablecoin infrastructure",
        description="Stablecoin orchestration and payments infrastructure API, acquired by Stripe in 2024.",
        website_url="https://bridge.xyz",
        docs_url="https://apidocs.bridge.xyz/",
    ),
    RealProvider(
        slug="moonpay",
        name="MoonPay",
        category="On/off-ramp",
        description="Fiat-to-crypto and crypto-to-fiat on/off-ramp infrastructure, widely embedded in wallets.",
        website_url="https://www.moonpay.com",
        docs_url="https://dev.moonpay.com/",
    ),
    RealProvider(
        slug="ripple",
        name="Ripple",
        category="Stablecoin infrastructure",
        description="Issuer of RLUSD and operator of cross-border payment and liquidity infrastructure.",
        website_url="https://ripple.com",
        docs_url="https://docs.ripple.com/",
    ),
)


def bootstrap() -> list[str]:
    """Inserts each provider and its docs source if not already present."""
    log: list[str] = []
    with db.connection() as conn:
        for p in PROVIDERS:
            row = conn.execute("select id from providers where slug = %s", (p.slug,)).fetchone()
            if row:
                provider_id = row["id"]
                log.append(f"provider already exists: {p.slug}")
            else:
                row = conn.execute(
                    """
                    insert into providers (slug, name, is_demo, category, description, website_url, docs_url)
                    values (%s, %s, false, %s, %s, %s, %s)
                    returning id
                    """,
                    (p.slug, p.name, p.category, p.description, p.website_url, p.docs_url),
                ).fetchone()
                provider_id = row["id"]
                log.append(f"created provider: {p.slug}")

            existing = conn.execute(
                "select id from source_documents where url = %s", (p.docs_url,)
            ).fetchone()
            if existing:
                log.append(f"  source already registered: {p.docs_url}")
            else:
                conn.execute(
                    """
                    insert into source_documents
                      (provider_id, url, title, source_type, crawl_frequency_hours)
                    values (%s, %s, %s, 'official_docs', 168)
                    """,
                    (provider_id, p.docs_url, f"{p.name} developer docs"),
                )
                log.append(f"  registered source: {p.docs_url}")

            for kind, label in CONFORMANCE_CATALOG.items():
                exists = conn.execute(
                    "select 1 from conformance_tests where provider_id = %s and kind = %s",
                    (provider_id, kind),
                ).fetchone()
                if not exists:
                    conn.execute(
                        "insert into conformance_tests (provider_id, kind, label) values (%s, %s, %s)",
                        (provider_id, kind, label),
                    )
            log.append(f"  conformance catalog ready ({len(CONFORMANCE_CATALOG)} kinds)")
        conn.commit()
    return log
