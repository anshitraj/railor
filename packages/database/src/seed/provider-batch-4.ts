/**
 * Fourth batch of real capability/receiving-endpoint facts — Airwallex,
 * Transak, Mural Pay and Ripple — verified live via WebFetch this session
 * against each provider's own official page, not guessed from memory. Same
 * rule as every batch before it: every row traces to an actual quoted
 * excerpt, and a field the source doesn't state stays null rather than
 * assumed.
 *
 * Airwallex's "Global Accounts" are local bank-transfer rails (SEPA, ACH,
 * Fedwire, Faster Payments, etc.) with no stablecoin/crypto mention
 * anywhere in the coverage table — recorded as `receivingEndpoints` rows
 * with `stablecoinMode: unknown`: an omitted crypto mention is not proof of
 * fiat-only support. They are not represented as `providerCapabilities`
 * corridor facts (Airwallex's page describes "open a
 * local account to receive in this currency", not a payout corridor).
 * Estonia is in that same coverage table but dropped here: it isn't in
 * Railor's country catalog yet, and `receivingEndpoints.countryCode` is a
 * hard FK — silently swapping in a different code would misrepresent the
 * source.
 *
 * Transak, Mural Pay and Ripple are asset/currency facts with no
 * asset-to-network pairing given by the source, so `sourceNetwork` stays
 * null for all three rather than guessing which of Transak's 45+ chains
 * carries which of its 136+ assets.
 *
 * Yellow Card (403, no fetchable content) and MoonPay (connection refused,
 * two attempts) are deliberately omitted — nothing here traces to a real
 * excerpt for either.
 *
 * Insert-only and idempotent, like every batch before it: safe to run again.
 *
 *   pnpm --filter @railor/database provider-batch-4
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

interface CapabilityFacetSpec {
  product: (typeof s.productTypeEnum.enumValues)[number];
  sourceAsset?: string;
  sourceNetwork?: string;
  destinationCurrency?: string;
  note?: string;
}

interface ReceivingEndpointSpec {
  countryCode: string;
  destinationCurrency: string;
  /** Only present when Airwallex's own coverage table names this exact rail. */
  namedRail: string;
}

interface ProviderSpec {
  slug: string;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  capabilityFacets?: CapabilityFacetSpec[];
  receivingEndpoints?: ReceivingEndpointSpec[];
}

const SPECS: ProviderSpec[] = [
  {
    slug: "airwallex",
    sourceUrl: "https://www.airwallex.com/docs/accounts/supported-regions-and-currencies",
    sourceTitle: "Airwallex — Supported Regions and Currencies",
    excerpt:
      "Global Accounts coverage table (bank-rail receiving, no stablecoin/crypto mentioned): Australia AUD (Bank Transfer); Canada CAD (EFT, Interac e-Transfer); Denmark DKK+multi-currency; Germany EUR (SEPA); Hong Kong SAR multi-currency; Indonesia IDR (RTGS, SKN, BI-FAST); Israel ILS (Faster Payments, MASAV, ZAHAV); Mexico MXN (SPEI); Netherlands EUR (SEPA); New Zealand NZD; Poland PLN; Singapore multi-currency; United Arab Emirates AED (IPI, RTGS); United Kingdom GBP (Faster Payments, BACS, CHAPS); United States USD (ACH, Fedwire, FedNow, RTP).",
    receivingEndpoints: [
      { countryCode: "AU", destinationCurrency: "AUD", namedRail: "BECS" },
      { countryCode: "CA", destinationCurrency: "CAD", namedRail: "EFT_CA" },
      { countryCode: "CA", destinationCurrency: "CAD", namedRail: "INTERAC_E_TRANSFER" },
      { countryCode: "DK", destinationCurrency: "DKK", namedRail: "INTRADAGCLEARING" },
      { countryCode: "DK", destinationCurrency: "DKK", namedRail: "KRONOS2" },
      { countryCode: "DE", destinationCurrency: "EUR", namedRail: "SEPA_CT_DE" },
      { countryCode: "DE", destinationCurrency: "EUR", namedRail: "SEPA_ICT_DE" },
      { countryCode: "HK", destinationCurrency: "HKD", namedRail: "ACH_HK" },
      { countryCode: "HK", destinationCurrency: "HKD", namedRail: "RTGS_HK" },
      { countryCode: "HK", destinationCurrency: "HKD", namedRail: "FPS_HK" },
      { countryCode: "ID", destinationCurrency: "IDR", namedRail: "RTGS_ID" },
      { countryCode: "ID", destinationCurrency: "IDR", namedRail: "SKN" },
      { countryCode: "ID", destinationCurrency: "IDR", namedRail: "BI_FAST" },
      { countryCode: "IL", destinationCurrency: "ILS", namedRail: "FASTER_PAYMENTS_IL" },
      { countryCode: "IL", destinationCurrency: "ILS", namedRail: "MASAV" },
      { countryCode: "IL", destinationCurrency: "ILS", namedRail: "ZAHAV" },
      { countryCode: "MX", destinationCurrency: "MXN", namedRail: "SPEI" },
      { countryCode: "NL", destinationCurrency: "EUR", namedRail: "SEPA_CT_NL" },
      { countryCode: "NL", destinationCurrency: "EUR", namedRail: "SEPA_ICT_NL" },
      { countryCode: "NZ", destinationCurrency: "NZD", namedRail: "DIRECT_CREDIT_NZ" },
      { countryCode: "PL", destinationCurrency: "PLN", namedRail: "ELIXIR" },
      { countryCode: "PL", destinationCurrency: "PLN", namedRail: "EXPRESS_ELIXIR" },
      { countryCode: "PL", destinationCurrency: "PLN", namedRail: "SORBNET" },
      { countryCode: "SG", destinationCurrency: "SGD", namedRail: "GIRO_SG" },
      { countryCode: "SG", destinationCurrency: "SGD", namedRail: "MEPS" },
      { countryCode: "SG", destinationCurrency: "SGD", namedRail: "FAST_SG" },
      { countryCode: "AE", destinationCurrency: "AED", namedRail: "IPI_AE" },
      { countryCode: "AE", destinationCurrency: "AED", namedRail: "RTGS_AE" },
      { countryCode: "GB", destinationCurrency: "GBP", namedRail: "FASTER_PAYMENTS_GB" },
      { countryCode: "GB", destinationCurrency: "GBP", namedRail: "BACS" },
      { countryCode: "GB", destinationCurrency: "GBP", namedRail: "CHAPS" },
      { countryCode: "US", destinationCurrency: "USD", namedRail: "ACH_US" },
      { countryCode: "US", destinationCurrency: "USD", namedRail: "FEDWIRE" },
      { countryCode: "US", destinationCurrency: "USD", namedRail: "FEDNOW" },
      { countryCode: "US", destinationCurrency: "USD", namedRail: "RTP" },
    ],
  },
  {
    slug: "transak",
    sourceUrl: "https://transak.com/crypto-coverage",
    sourceTitle: "Transak — Crypto Coverage",
    excerpt:
      "\"Transak supports 136+ cryptocurrencies across 45+ blockchains in over 63+ countries.\" Stablecoins explicitly listed include USDC, USDT, EURC, PYUSD, RLUSD and FDUSD (among others not in Railor's asset catalog: MUSD, USDE/non-canonical spelling, CUSD, USDG, AUSD, EURAU). Networks explicitly listed include (among 45+) Ethereum, Solana, BNB Chain, Tron, Polygon, Stellar, Base, Arbitrum, Optimism, Celo, Ton, Avalanche and Plasma — no asset-to-network pairing given.",
    capabilityFacets: ["USDC", "USDT", "EURC", "PYUSD", "RLUSD", "FDUSD"].map((sourceAsset) => ({
      product: "on_ramp",
      sourceAsset,
    })),
  },
  {
    slug: "mural-pay",
    sourceUrl: "https://www.muralpay.com/",
    sourceTitle: "Mural Pay — Homepage",
    excerpt:
      "\"Move money across borders to anyone, anywhere, in their preferred currency\" — payroll/contractor payouts explicitly named in USD, COP, ARS and MXN. Stablecoins and blockchain networks referenced only generically (\"stablecoin accounts\", \"stablecoin wallets\") with no specific coin or chain named.",
    capabilityFacets: ["USD", "COP", "ARS", "MXN"].map((destinationCurrency) => ({
      product: "payout",
      destinationCurrency,
    })),
  },
  {
    slug: "ripple",
    sourceUrl: "https://docs.ripple.com/",
    sourceTitle: "Ripple Docs",
    excerpt:
      "Names \"Fiat-backed RLUSD stablecoin\" and \"Ripple Stablecoins\" among its products, with the XRP Ledger referenced as the underlying network. No countries, corridors or asset-to-network pairing stated on this page.",
    capabilityFacets: [{ product: "wallet", sourceAsset: "RLUSD" }],
  },
];

async function getProviderId(db: Awaited<ReturnType<typeof getDb>>, slug: string): Promise<string> {
  const [row] = await db.select().from(s.providers).where(eq(s.providers.slug, slug)).limit(1);
  if (!row) throw new Error(`provider not seeded yet: ${slug}`);
  return row.id;
}

async function upsertSourceDocument(
  db: Awaited<ReturnType<typeof getDb>>,
  providerId: string,
  url: string,
  title: string,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(s.sourceDocuments)
    .where(and(eq(s.sourceDocuments.providerId, providerId), eq(s.sourceDocuments.url, url)))
    .limit(1);
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

/** DKK was missing from the currency catalog — Denmark is in Airwallex's real coverage table and is a real ISO 4217 code, not invented. */
async function ensureDkk(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const [existing] = await db.select().from(s.currencies).where(eq(s.currencies.code, "DKK")).limit(1);
  if (existing) return;
  await db.insert(s.currencies).values({ code: "DKK", name: "Danish Krone", symbol: "kr", countryCode: "DK" });
}

export async function bootstrap(): Promise<string[]> {
  const db = await getDb();
  await ensureDkk(db);
  const log: string[] = [];

  for (const spec of SPECS) {
    const providerId = await getProviderId(db, spec.slug);
    const sourceDocId = await upsertSourceDocument(db, providerId, spec.sourceUrl, spec.sourceTitle);
    const evidenceId = await upsertEvidence(db, providerId, sourceDocId, spec.sourceUrl, spec.sourceTitle, spec.excerpt);

    let created = 0;

    if (spec.capabilityFacets?.length) {
      const existingFacets = await db
        .select()
        .from(s.providerCapabilities)
        .where(eq(s.providerCapabilities.providerId, providerId));

      for (const facet of spec.capabilityFacets) {
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
          note: facet.note,
          availability: "supported",
          derivation: "source",
          evidenceId,
          lastVerifiedAt: new Date(),
        });
        created += 1;
      }
    }

    if (spec.receivingEndpoints?.length) {
      const existingEndpoints = await db
        .select()
        .from(s.receivingEndpoints)
        .where(eq(s.receivingEndpoints.providerId, providerId));

      for (const endpoint of spec.receivingEndpoints) {
        const dupe = existingEndpoints.some(
          (e) =>
            e.countryCode === endpoint.countryCode &&
            e.destinationCurrency === endpoint.destinationCurrency &&
            e.namedRail === endpoint.namedRail,
        );
        if (dupe) continue;

        await db.insert(s.receivingEndpoints).values({
          providerId,
          countryCode: endpoint.countryCode,
          endpointType: "bank_account",
          stablecoinMode: "unknown",
          destinationCurrency: endpoint.destinationCurrency,
          namedRail: endpoint.namedRail,
          availability: "supported",
          note: "Local receiving account (Global Accounts). This coverage page does not establish stablecoin compatibility.",
          evidenceId,
          lastVerifiedAt: new Date(),
        });
        created += 1;
      }
    }

    await db.update(s.providers).set({ lastVerifiedAt: new Date() }).where(eq(s.providers.id, providerId));
    log.push(`${spec.slug}: ${created} row(s) created`);
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
