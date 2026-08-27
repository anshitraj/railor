/**
 * Third batch of real (non-demo) providers — DashX and Payoneer, both real
 * receiving platforms for Indian businesses that were missing from the
 * dataset. Verified live via WebFetch/WebSearch/browser this session against
 * each provider's own official page, not guessed from memory. Same rule as
 * every other batch file: every capability/receiving-endpoint row traces to
 * an actual quoted excerpt.
 *
 * DashX's homepage never names specific stablecoins or blockchain networks
 * for its "Global payments, local settlement" stablecoin rail — unlike
 * Xflow, which does — so no incomingAsset/incomingNetwork is recorded here;
 * inventing one would violate the same rule that made Xflow's rows worth
 * fixing in the first place.
 *
 * Payoneer's India-specific receiving product (FIRC, multi-currency
 * withdrawal to a local bank account) and its separate stablecoin wallet
 * (USDC/USDT, launched Feb 2026 via Bridge) are two distinct, separately
 * evidenced facts — no source ties the two together, so they are kept
 * apart: the India receiving_endpoints row stays `stablecoinMode: fiat_only`
 * and the wallet stablecoins are recorded as ordinary providerCapabilities
 * "wallet" facets with no country attached.
 *
 * Insert-only and idempotent, like every batch file before it: safe to run
 * again.
 *
 *   pnpm --filter @railor/database provider-batch-3
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

interface RealProviderSeed {
  slug: string;
  name: string;
  category: string;
  description: string;
  websiteUrl: string;
  docsUrl: string;
  headquartersCountry?: string;
  apiAccess: "public" | "private" | "partner" | "none" | "unknown";
  hasApi: boolean;
  hasSandbox: boolean;
}

const PROVIDERS: RealProviderSeed[] = [
  {
    slug: "dashx",
    name: "DashX",
    category: "Cross-border payments",
    description:
      "Receiving platform for Indian freelancers and businesses: multi-currency virtual accounts, stablecoin-funded INR settlement with automated FIRA, and payouts to 55 countries.",
    websiteUrl: "https://dashx.xyz",
    docsUrl: "https://gateway.dashx.xyz",
    headquartersCountry: "IN",
    apiAccess: "unknown",
    hasApi: false,
    hasSandbox: false,
  },
  {
    slug: "payoneer",
    name: "Payoneer",
    category: "Cross-border payments",
    description:
      "Global cross-border payments platform: multi-currency receiving accounts, marketplace mass payouts, Digital FIRC for Indian exporters, and (since February 2026) a Bridge-powered stablecoin wallet supporting USDC and USDT.",
    websiteUrl: "https://www.payoneer.com",
    docsUrl: "https://developer.payoneer.com",
    headquartersCountry: "US",
    apiAccess: "partner",
    hasApi: true,
    hasSandbox: false,
  },
];

async function upsertProvider(db: Awaited<ReturnType<typeof getDb>>, p: RealProviderSeed): Promise<string> {
  const [existing] = await db.select().from(s.providers).where(eq(s.providers.slug, p.slug)).limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(s.providers)
    .values({
      slug: p.slug,
      name: p.name,
      isDemo: false,
      category: p.category,
      description: p.description,
      websiteUrl: p.websiteUrl,
      docsUrl: p.docsUrl,
      headquartersCountry: p.headquartersCountry,
      apiAccess: p.apiAccess,
      hasApi: p.hasApi,
      hasSandbox: p.hasSandbox,
    })
    .returning({ id: s.providers.id });
  return row!.id;
}

async function upsertSourceDocument(db: Awaited<ReturnType<typeof getDb>>, providerId: string, url: string, title: string): Promise<string> {
  const [existing] = await db.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.url, url)).limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(s.sourceDocuments)
    .values({ providerId, url, title, sourceType: "official_docs", crawlFrequencyHours: 168 })
    .returning({ id: s.sourceDocuments.id });
  return row!.id;
}

/** retrievedAt/lastVerifiedAt are today: verified live via WebFetch/browser this session, not scraped by the crawler. */
async function upsertEvidence(
  db: Awaited<ReturnType<typeof getDb>>,
  providerId: string,
  sourceDocumentId: string,
  url: string,
  title: string,
  excerpt: string,
  confidence = "0.90",
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
      confidence,
      rawExcerpt: excerpt,
      rawHash: hash(url + excerpt),
    })
    .returning({ id: s.evidence.id });
  return row!.id;
}

interface CapabilitySpec {
  product: (typeof s.productTypeEnum.enumValues)[number];
  sourceAsset?: string;
  sourceNetwork?: string;
  destinationCurrency?: string;
}

interface ReceivingEndpointSpec {
  countryCode: string;
  endpointType: (typeof s.receivingEndpointTypeEnum.enumValues)[number];
  stablecoinMode: (typeof s.stablecoinModeEnum.enumValues)[number];
  destinationCurrency?: string;
  namedRail?: string;
  settlementEstimate?: string;
  complianceDocs?: string;
  note: string;
}

interface EvidenceSpec {
  slug: string;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  confidence?: string;
  capabilities?: CapabilitySpec[];
  receivingEndpoints?: ReceivingEndpointSpec[];
}

const SPECS: EvidenceSpec[] = [
  {
    slug: "dashx",
    sourceUrl: "https://dashx.xyz/",
    sourceTitle: "DashX — Lightning fast payments for everyone",
    excerpt:
      "\"Accept payments from clients around the world in 25+ currencies and receive them directly in your Indian bank account.\" \"Get virtual bank accounts across 10+ currencies and send funds to 55 countries.\" \"Global payments, local settlement: Receive stablecoins from anywhere and settle with automated FIRA and transparent rates.\" \"Get FIRA issued from AD-1 Banks for eligible international payments, without chasing banks or filling out extra paperwork.\" \"24-Hours Settlement*.\" Virtual accounts shown in USD, EUR, GBP, AED. \"Stablecoin Rails: Stablecoin settlements into 55 countries via licensed partners.\" No specific stablecoin assets or blockchain networks named on this page.",
    receivingEndpoints: [
      {
        countryCode: "IN",
        endpointType: "bank_account",
        stablecoinMode: "stablecoin_funded_fiat",
        destinationCurrency: "INR",
        complianceDocs: "FIRA",
        settlementEstimate: "24 hours",
        note: "Receives stablecoins from overseas clients and settles as INR to the user's Indian bank account with automated FIRA; no specific stablecoin or network named on the homepage.",
      },
    ],
    capabilities: ["USD", "EUR", "GBP", "AED"].map((destinationCurrency) => ({
      product: "virtual_account" as const,
      destinationCurrency,
    })),
  },
  {
    slug: "payoneer",
    sourceUrl: "https://www.payoneer.com/en-in/digital-firc/",
    sourceTitle: "Digital FIRC with Payoneer | Payoneer India",
    excerpt:
      "\"Payoneer enables sellers and service providers in India who get paid globally to automatically receive their FIRA/FIRS/NOC directly to their Payoneer account, at no cost.\" \"Get paid from 190+ countries and territories.\"",
    receivingEndpoints: [
      {
        countryCode: "IN",
        endpointType: "bank_account",
        stablecoinMode: "fiat_only",
        destinationCurrency: "INR",
        complianceDocs: "FIRA/FIRS/NOC",
        note: "Automatic FIRA/FIRS/NOC for India-based sellers, at no additional cost; multi-currency balances withdraw to the user's local Indian bank account. No stablecoin/crypto path confirmed for this India-specific product — see the separate wallet fact below.",
      },
    ],
  },
  {
    slug: "payoneer",
    sourceUrl: "https://www.payoneer.com/en-in/multi-currency-account/",
    sourceTitle: "Multi Currency Business Account | Payoneer India",
    excerpt:
      "\"Accept payments from far and wide in multiple currencies: US dollar, British pound, Euro, Australian dollar, Canadian dollar, Singapore dollar, Hong Kong dollar, UAE dirham, Chinese yuan, and Japanese yen.\" \"when you've been paid, you've got a convenient way to withdraw to your local Indian bank account.\"",
    capabilities: ["USD", "GBP", "EUR", "AUD", "CAD", "SGD", "HKD", "AED", "CNY", "JPY"].map(
      (destinationCurrency) => ({ product: "virtual_account" as const, destinationCurrency }),
    ),
  },
  {
    slug: "payoneer",
    sourceUrl: "https://www.americanbanker.com/payments/news/why-payoneer-decided-to-issue-its-own-stablecoin",
    sourceTitle: "Why Payoneer decided to issue its own stablecoin — American Banker",
    excerpt:
      "\"Third-party stablecoins including Circle's USDC and Tether's USDT are already supported on Payoneer's platform and digital wallet\", launched in February [2026] in partnership with Stripe-owned Bridge. Payoneer has also filed with the OCC for a national trust bank charter to support its own planned stablecoin, PAYO-USD. No specific blockchain networks or country/market restrictions named.",
    confidence: "0.85",
    capabilities: ["USDC", "USDT"].map((sourceAsset) => ({ product: "wallet" as const, sourceAsset })),
  },
];

export async function bootstrap(): Promise<string[]> {
  const db = await getDb();
  const log: string[] = [];

  const providerIds: Record<string, string> = {};
  for (const p of PROVIDERS) {
    providerIds[p.slug] = await upsertProvider(db, p);
    log.push(`provider ready: ${p.slug}`);
  }

  for (const spec of SPECS) {
    const providerId = providerIds[spec.slug]!;
    const sourceDocId = await upsertSourceDocument(db, providerId, spec.sourceUrl, spec.sourceTitle);
    const evidenceId = await upsertEvidence(db, providerId, sourceDocId, spec.sourceUrl, spec.sourceTitle, spec.excerpt, spec.confidence);

    if (spec.capabilities?.length) {
      const existingFacets = await db.select().from(s.providerCapabilities).where(eq(s.providerCapabilities.providerId, providerId));
      let created = 0;
      for (const facet of spec.capabilities) {
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
          availability: "supported",
          derivation: "source",
          evidenceId,
          lastVerifiedAt: new Date(),
        });
        created += 1;
      }
      log.push(`  ${spec.slug}: ${created} capability facet(s) created`);
    }

    if (spec.receivingEndpoints?.length) {
      const existingEndpoints = await db.select().from(s.receivingEndpoints).where(eq(s.receivingEndpoints.providerId, providerId));
      let created = 0;
      for (const ep of spec.receivingEndpoints) {
        const dupe = existingEndpoints.some(
          (e) => e.countryCode === ep.countryCode && e.endpointType === ep.endpointType && e.destinationCurrency === (ep.destinationCurrency ?? null),
        );
        if (dupe) continue;
        await db.insert(s.receivingEndpoints).values({
          providerId,
          countryCode: ep.countryCode,
          endpointType: ep.endpointType,
          stablecoinMode: ep.stablecoinMode,
          destinationCurrency: ep.destinationCurrency,
          namedRail: ep.namedRail,
          settlementEstimate: ep.settlementEstimate,
          complianceDocs: ep.complianceDocs,
          availability: "supported",
          note: ep.note,
          derivation: "source",
          evidenceId,
          lastVerifiedAt: new Date(),
        });
        created += 1;
      }
      log.push(`  ${spec.slug}: ${created} receiving endpoint(s) created`);
    }

    await db.update(s.providers).set({ lastVerifiedAt: new Date() }).where(eq(s.providers.id, providerId));
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
