/**
 * Real capability facets for the stablecoin-infra providers seed-sources.py
 * registers (circle, tether, ethena, paxos, bridge) — verified live via
 * WebFetch this session against each provider's own official page, not
 * guessed from memory. Coinbase is deliberately omitted: its CDP docs and
 * help-center page returned no fetchable per-network/per-country specifics
 * in this pass (help center 403'd), and this file only ever encodes facts
 * that trace to an actual quoted excerpt.
 *
 * These are asset/network (or currency) facts, not corridor facts: none of
 * the five publishes a simple per-country payout eligibility list the way a
 * remittance/payout provider does, so entityCountry/destinationCountry stay
 * null throughout — that is the honest shape of the underlying business,
 * not a gap in this file. See RealProviderSeed's header comment in
 * receiving-endpoints.ts for the same principle applied to Skydo/Xflow.
 *
 * Insert-only and idempotent, like receiving-endpoints.ts: safe to run again.
 *
 *   pnpm --filter @railor/database stablecoin-capabilities
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

interface FacetSpec {
  product: (typeof s.productTypeEnum.enumValues)[number];
  sourceAsset?: string;
  sourceNetwork?: string;
  destinationCurrency?: string;
  customerType?: (typeof s.customerTypeEnum.enumValues)[number];
  note?: string;
}

interface ProviderEvidenceSpec {
  slug: string;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  facets: FacetSpec[];
}

const SPECS: ProviderEvidenceSpec[] = [
  {
    slug: "circle",
    sourceUrl: "https://www.circle.com/multi-chain-usdc",
    sourceTitle: "Circle — Multi-chain USDC",
    excerpt:
      "\"USDC is natively supported across 36 blockchain networks, giving businesses and developers trusted liquidity across a diverse set of ecosystems.\" Page confirms USDC presence on (among others) Ethereum, Base, Polygon, Arbitrum, Solana, Avalanche, Optimism, Celo and Stellar.",
    facets: ["ethereum", "base", "polygon", "arbitrum", "solana", "avalanche", "optimism", "celo", "stellar"].map(
      (sourceNetwork) => ({ product: "wallet", sourceAsset: "USDC", sourceNetwork }),
    ),
  },
  {
    slug: "tether",
    sourceUrl: "https://tether.to/en/supported-protocols/",
    sourceTitle: "Tether — Supported Protocols",
    excerpt:
      "Lists USDT as: \"ERC20 Token via Ethereum Blockchain\"; \"ERC20 Token via Avalanche Blockchain\"; \"BNB Smart Chain\"; \"Celo Blockchain\"; \"TRC20 Token via Tron Blockchain\"; \"Solana Token via Solana Blockchain\"; \"Ton Jetton via Ton Blockchain\" (plus several chains not in Railor's blockchain catalog: Kava/Cosmos, Kaia, Liquid, Polkadot AssetHub, Tezos, Near, Aptos).",
    facets: ["ethereum", "avalanche", "bnb-chain", "celo", "tron", "solana", "ton"].map((sourceNetwork) => ({
      product: "wallet",
      sourceAsset: "USDT",
      sourceNetwork,
    })),
  },
  {
    slug: "ethena",
    sourceUrl: "https://docs.ethena.fi/",
    sourceTitle: "Ethena Docs",
    excerpt:
      "\"[Direct minting and redemption of USDe are] subject to clearing KYC/KYB checks exclusively for approved market making counterparties.\" No self-serve retail mint/redeem path is documented.",
    facets: [
      {
        product: "kyc_kyb",
        sourceAsset: "USDe",
        customerType: "business",
        note: "Direct USDe mint/redeem is restricted to approved market-making counterparties clearing KYC/KYB — not self-serve retail.",
      },
    ],
  },
  {
    slug: "paxos",
    sourceUrl: "https://paxos.com/usdp",
    sourceTitle: "Paxos — USDP",
    excerpt: "\"USDP is available on Ethereum and Solana.\"",
    facets: ["ethereum", "solana"].map((sourceNetwork) => ({
      product: "wallet",
      sourceAsset: "USDP",
      sourceNetwork,
    })),
  },
  {
    slug: "bridge",
    sourceUrl: "https://apidocs.bridge.xyz/",
    sourceTitle: "Bridge API Docs",
    excerpt: "Virtual accounts: \"USD, EUR, GBP, MXN, and more.\"",
    facets: ["USD", "EUR", "GBP", "MXN"].map((destinationCurrency) => ({
      product: "virtual_account",
      destinationCurrency,
    })),
  },
];

async function getProviderId(db: Awaited<ReturnType<typeof getDb>>, slug: string): Promise<string> {
  const [row] = await db.select().from(s.providers).where(eq(s.providers.slug, slug)).limit(1);
  if (!row) throw new Error(`provider not seeded yet: ${slug} — run seed-sources first`);
  return row.id;
}

async function upsertSourceDocument(
  db: Awaited<ReturnType<typeof getDb>>,
  providerId: string,
  url: string,
  title: string,
): Promise<string> {
  const [existing] = await db.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.url, url)).limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(s.sourceDocuments)
    .values({ providerId, url, title, sourceType: "official_docs", crawlFrequencyHours: 168 })
    .returning({ id: s.sourceDocuments.id });
  return row!.id;
}

/** retrievedAt/lastVerifiedAt are today: verified live via WebFetch this session, not scraped by the crawler. */
async function upsertEvidence(
  db: Awaited<ReturnType<typeof getDb>>,
  providerId: string,
  sourceDocumentId: string,
  url: string,
  title: string,
  excerpt: string,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(s.evidence)
    .where(and(eq(s.evidence.providerId, providerId), eq(s.evidence.sourceUrl, url)))
    .limit(1);
  if (existing) return existing.id;
  const now = new Date();
  const [row] = await db
    .insert(s.evidence)
    .values({
      providerId,
      sourceDocumentId,
      sourceUrl: url,
      sourceTitle: title,
      sourceType: "official_docs",
      retrievedAt: now,
      lastVerifiedAt: now,
      confidence: "0.90",
      rawExcerpt: excerpt,
      rawHash: hash(url + excerpt),
    })
    .returning({ id: s.evidence.id });
  return row!.id;
}

export async function bootstrap(): Promise<string[]> {
  const db = await getDb();
  const log: string[] = [];

  for (const spec of SPECS) {
    const providerId = await getProviderId(db, spec.slug);
    const sourceDocId = await upsertSourceDocument(db, providerId, spec.sourceUrl, spec.sourceTitle);
    const evidenceId = await upsertEvidence(db, providerId, sourceDocId, spec.sourceUrl, spec.sourceTitle, spec.excerpt);

    const existingFacets = await db
      .select()
      .from(s.providerCapabilities)
      .where(eq(s.providerCapabilities.providerId, providerId));

    let created = 0;
    for (const facet of spec.facets) {
      const dupe = existingFacets.some(
        (f) =>
          f.product === facet.product &&
          f.sourceAsset === (facet.sourceAsset ?? null) &&
          f.sourceNetwork === (facet.sourceNetwork ?? null) &&
          f.destinationCurrency === (facet.destinationCurrency ?? null),
      );
      if (dupe) continue;

      await db.insert(s.providerCapabilities).values({
        providerId,
        product: facet.product,
        sourceAsset: facet.sourceAsset,
        sourceNetwork: facet.sourceNetwork,
        destinationCurrency: facet.destinationCurrency,
        customerType: facet.customerType,
        note: facet.note,
        availability: "supported",
        derivation: "source",
        evidenceId,
        lastVerifiedAt: new Date(),
      });
      created += 1;
    }
    await db.update(s.providers).set({ lastVerifiedAt: new Date() }).where(eq(s.providers.id, providerId));
    log.push(`${spec.slug}: ${created} facet(s) created (${spec.facets.length - created} already present)`);
  }

  return log;
}

async function main() {
  const { close } = await getDbHandle();
  for (const line of await bootstrap()) console.log(line);
  await close();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
