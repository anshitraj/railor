/**
 * Second batch of real (non-demo) providers — 8 more stablecoin/cross-border
 * payment infrastructure companies, verified live via WebFetch/WebSearch
 * this session against each provider's own official page, not guessed from
 * memory. Same rule as receiving-endpoints.ts and stablecoin-capabilities.ts:
 * every capability/receiving-endpoint row traces to an actual quoted excerpt.
 *
 * Two providers (Transak, Yellow Card) are registered with evidence only, no
 * specific capability rows — their pages state aggregate claims ("136+
 * assets across 45+ networks", "60+ countries") without naming the specifics,
 * and this file only ever encodes facts it can point at directly. Same
 * principle stablecoin-capabilities.ts already applied to Coinbase.
 *
 * A provider listing stablecoins and named payment rails on the same page is
 * not evidence that every stablecoin works on every rail.  Those independent
 * facts are kept unpaired here; only an API route/configuration response may
 * establish a complete stablecoin → network → country → rail tuple.
 *
 * Insert-only and idempotent, like both files above: safe to run again.
 *
 *   pnpm --filter @railor/database provider-batch-2
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
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
    slug: "wise",
    name: "Wise",
    category: "Cross-border payments",
    description: "Cross-border money transfer and business payments infrastructure at the mid-market exchange rate; public platform API with invoicing and payout automation.",
    websiteUrl: "https://wise.com",
    docsUrl: "https://api-docs.wise.com/",
    apiAccess: "public",
    hasApi: true,
    hasSandbox: true,
  },
  {
    slug: "bvnk",
    name: "BVNK",
    category: "Stablecoin infrastructure",
    description: "Stablecoin payments infrastructure: global payouts, payment acceptance, unified fiat/stablecoin accounts, FX conversion, and card issuance against stablecoin balances.",
    websiteUrl: "https://www.bvnk.com",
    docsUrl: "https://docs.bvnk.com",
    apiAccess: "public",
    hasApi: true,
    hasSandbox: true,
  },
  {
    slug: "brale",
    name: "Brale",
    category: "Stablecoin infrastructure",
    description: "Stablecoin issuance-as-a-service: banking, compliance, custody and multi-chain infrastructure behind one REST API for minting, redeeming and moving stablecoins.",
    websiteUrl: "https://brale.xyz",
    docsUrl: "https://docs.brale.xyz",
    apiAccess: "public",
    hasApi: true,
    hasSandbox: true,
  },
  {
    slug: "airwallex",
    name: "Airwallex",
    category: "Cross-border payments",
    description: "Global payments and financial infrastructure platform; multi-currency Global Accounts for receiving funds via local payment methods and SWIFT.",
    websiteUrl: "https://www.airwallex.com",
    docsUrl: "https://www.airwallex.com/docs",
    apiAccess: "public",
    hasApi: true,
    hasSandbox: true,
  },
  {
    slug: "conduit",
    name: "Conduit",
    category: "Stablecoin infrastructure",
    description: "Cross-border money movement combining USD accounts and stablecoins (USDC, USDT, USDH) on one API, routed over Fedwire, SWIFT, PIX, SEPA Instant, FedNow, TED, RTP, RTGS and SPEI.",
    websiteUrl: "https://conduitpay.com",
    docsUrl: "https://conduitpay.com",
    apiAccess: "public",
    hasApi: true,
    hasSandbox: true,
  },
  {
    slug: "transak",
    name: "Transak",
    category: "On/off-ramp",
    description: "Fiat-to-crypto and crypto-to-fiat on/off-ramp infrastructure ('the crypto payment rail for any financial application'), embeddable as a widget or white-label API.",
    websiteUrl: "https://transak.com",
    docsUrl: "https://docs.transak.com",
    apiAccess: "public",
    hasApi: true,
    hasSandbox: true,
  },
  {
    slug: "yellow-card",
    name: "Yellow Card",
    category: "Stablecoin infrastructure",
    description: "Licensed stablecoin payments infrastructure for emerging markets, powering money movement across USD and 50+ local currencies.",
    websiteUrl: "https://yellowcard.io",
    docsUrl: "https://docs.yellowcard.engineering",
    apiAccess: "public",
    hasApi: true,
    hasSandbox: true,
  },
  {
    slug: "mural-pay",
    name: "Mural Pay",
    category: "Stablecoin infrastructure",
    description: "Stablecoin account infrastructure for global money movement: accounts, cross-border payouts, payment acceptance and FX conversion on one API, focused on Latin America.",
    websiteUrl: "https://muralpay.com",
    docsUrl: "https://developers.muralpay.com/docs/getting-started",
    apiAccess: "public",
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

/** retrievedAt/lastVerifiedAt are today: verified live via WebFetch/WebSearch this session, not scraped by the crawler. */
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
    slug: "wise",
    sourceUrl: "https://wise.com/gb/business/api",
    sourceTitle: "Wise — Business Platform API",
    excerpt:
      "\"Wise open API\" with sandbox access (\"It only takes a few minutes to get a Sandbox account\"); automates invoice payments, recurring transfers and disbursements at the mid-market exchange rate. No specific currency/corridor list published on this page.",
  },
  {
    slug: "bvnk",
    sourceUrl: "https://www.bvnk.com/",
    sourceTitle: "BVNK — Stablecoin Infrastructure",
    excerpt:
      "\"Stablecoin infrastructure for the builders making money flow.\" Six product pillars: Send, Receive, Store, Convert, Spend, Earn. \"130+ countries\", \"40+ licenses worldwide\" across the UK, EU and US. \"Support all major chains and tokens through a single API platform.\" Minimum $500k/month processing volume, 6+ months trading history.",
    capabilities: [{ product: "virtual_account" }],
  },
  {
    slug: "brale",
    sourceUrl: "https://brale.xyz/platform",
    sourceTitle: "Brale — Platform",
    excerpt:
      "\"27+ chains deployed & maintained.\" \"Banking, compliance, custody, and chain infrastructure.\" \"One REST API, one webhook endpoint... for issuance, custody, fiat rails, on-chain transfers, compliance, reconciliation, and reporting.\" \"100+ Programs live\", SOC 2 Type II. Separately (brale.xyz/blog/stablecoin-issuance-api): mint/redeem via API on Stellar, Solana, Base, Ethereum, Polygon, Avalanche, Celo, Optimism and Arbitrum.",
    capabilities: ["stellar", "solana", "base", "ethereum", "polygon", "avalanche", "celo", "optimism", "arbitrum"].map((sourceNetwork) => ({
      product: "wallet" as const,
      sourceNetwork,
    })),
  },
  {
    slug: "airwallex",
    sourceUrl: "https://www.airwallex.com/docs/accounts/supported-regions-and-currencies",
    sourceTitle: "Airwallex — Supported regions and currencies",
    excerpt:
      "\"You can create Global Accounts in the following regions and currencies, and receive bank transfers via local payment methods and/or SWIFT.\" 14 regions, 23 currencies including AUD, CAD, EUR, GBP, HKD, IDR, ILS, MXN, NZD, PLN, SGD, USD, ZAR. Regions: Australia, Canada, Denmark, Estonia, Germany, Hong Kong SAR, Indonesia, Israel, Mexico, Netherlands, New Zealand, Poland, Singapore, UAE, UK, US.",
  },
  {
    slug: "conduit",
    sourceUrl: "https://conduitpay.com",
    sourceTitle: "Conduit — Global USD accounts and stablecoin payments",
    excerpt:
      "\"Embed USD accounts, payments, wallets and FX into your product in days. Full sandbox access.\" USDC, USDT and USDH supported for instant payments. \"USD accounts and payments for businesses around the world — including historically hard to bank regions\", \"customers from 100+ countries\". Payment rails: Fedwire, SWIFT, PIX (Brazil), SEPA Instant (Eurozone), FedNow, TED (Brazil), RTP, RTGS (UK), SPEI (Mexico). \"8 banking partners in the US.\"",
    capabilities: [
      { product: "wallet", sourceAsset: "USDC" },
      { product: "wallet", sourceAsset: "USDT" },
    ],
  },
  {
    slug: "transak",
    sourceUrl: "https://transak.com/",
    sourceTitle: "Transak — the crypto payment rail for any financial application",
    excerpt:
      "\"136+ assets across 45+ networks.\" Licensed in the US, UK, Australia, Canada and Hong Kong; \"Compliant fiat and crypto access globally.\" Payment options: \"cards, bank transfer, SEPA, Apple Pay, and more.\" No specific asset/network names or per-country corridor list published on this page — trusted by 600+ platforms, ISO 27001:2022 and SOC 2 Type II certified.",
  },
  {
    slug: "yellow-card",
    sourceUrl: "https://yellowcard.io/",
    sourceTitle: "Yellow Card — Stablecoin payments infrastructure",
    excerpt:
      "\"A licensed stablecoin payments infrastructure provider powering global money movement across USD and 50+ local currencies.\" \"60+ Countries\", \"$10B+ Processed Volume\", \"106+ Tier 1 Banking & Liquidity partners.\" \"Receive and send money across all major Stablecoins and blockchains.\" No specific country names, stablecoins or blockchains enumerated on this page.",
  },
  {
    slug: "mural-pay",
    sourceUrl: "https://muralpay.com/",
    sourceTitle: "Mural Pay — Global Accounts. Realtime Payments. One API.",
    excerpt:
      "\"Deploy enterprise-grade stablecoin infrastructure with Mural Pay — launch accounts, wallets, and payments in weeks.\" Payouts named on-page: USD, COP (Colombian Peso), ARS (Argentine Peso), MXN (Mexican Peso), plus unspecified stablecoins. References Latin America via a customer example (Koywe). \"Move money across borders to anyone, anywhere, in their preferred currency.\"",
  },
];

/**
 * Remove only the rows emitted by an earlier version of this same seed when
 * it joined independent stablecoin, rail and jurisdiction mentions.  Keeping
 * them would continue to advertise routes the cited pages never established.
 * The predicates intentionally use the old seed's exact note wording, so a
 * future, genuinely verified endpoint for the same provider is never touched.
 */
async function retractLegacyInferences(
  db: Awaited<ReturnType<typeof getDb>>,
  providerIds: Record<string, string>,
  log: string[],
): Promise<void> {
  const legacyNotes: Record<string, (note: string | null) => boolean> = {
    bvnk: (note) => note?.startsWith("UK-licensed; unified fiat/stablecoin accounts") === true || note?.startsWith("US-licensed; unified fiat/stablecoin accounts") === true,
    conduit: (note) =>
      note?.startsWith("Stablecoin-funded payouts") === true ||
      note?.startsWith("Stablecoin-funded EUR payouts") === true ||
      note?.startsWith("USD accounts funded by USDC/USDT/USDH") === true ||
      note?.startsWith('Provider names this rail "RTGS (UK)"') === true,
    "mural-pay": (note) => note?.startsWith("Stablecoin-funded payouts") === true,
  };

  for (const [slug, match] of Object.entries(legacyNotes)) {
    const rows = await db
      .select({ id: s.receivingEndpoints.id, note: s.receivingEndpoints.note })
      .from(s.receivingEndpoints)
      .where(eq(s.receivingEndpoints.providerId, providerIds[slug]!));
    const ids = rows.filter((row) => match(row.note)).map((row) => row.id);
    if (!ids.length) continue;
    await db.delete(s.receivingEndpoints).where(inArray(s.receivingEndpoints.id, ids));
    log.push(`removed ${ids.length} legacy inferred ${slug} endpoint(s)`);
  }

  // The earlier Airwallex rows correctly establish receiving accounts, but
  // incorrectly labelled an absent crypto statement as "fiat_only". Preserve
  // the endpoint fact and make the compatibility mode explicitly unknown.
  const airwallexRows = await db
    .select({ id: s.receivingEndpoints.id, note: s.receivingEndpoints.note })
    .from(s.receivingEndpoints)
    .where(and(eq(s.receivingEndpoints.providerId, providerIds.airwallex!), eq(s.receivingEndpoints.stablecoinMode, "fiat_only")));
  const ambiguousAirwallexIds = airwallexRows
    .filter((row) => row.note?.startsWith("Global Account in ") || row.note?.startsWith("Local receiving account (Global Accounts)"))
    .map((row) => row.id);
  if (ambiguousAirwallexIds.length) {
    await db
      .update(s.receivingEndpoints)
      .set({ stablecoinMode: "unknown" })
      .where(inArray(s.receivingEndpoints.id, ambiguousAirwallexIds));
    log.push(`downgraded ${ambiguousAirwallexIds.length} Airwallex stablecoin mode(s) to unknown`);
  }

  // The older generic "local payment methods" interpretation chose PayNow
  // for Singapore.  The coverage table does not establish that rail, so keep
  // the receiving account but remove the unverified rail label.
  const legacyPayNowRows = await db
    .select({ id: s.receivingEndpoints.id, note: s.receivingEndpoints.note })
    .from(s.receivingEndpoints)
    .where(
      and(
        eq(s.receivingEndpoints.providerId, providerIds.airwallex!),
        eq(s.receivingEndpoints.namedRail, "PAYNOW"),
        eq(s.receivingEndpoints.destinationCurrency, "SGD"),
      ),
    );
  const legacyPayNowIds = legacyPayNowRows
    .filter((row) => row.note === "Global Account in SGD, local payment methods and/or SWIFT.")
    .map((row) => row.id);
  if (legacyPayNowIds.length) {
    await db
      .update(s.receivingEndpoints)
      .set({ namedRail: null })
      .where(inArray(s.receivingEndpoints.id, legacyPayNowIds));
    log.push(`removed ${legacyPayNowIds.length} unverified Airwallex PayNow rail label(s)`);
  }
}

export async function bootstrap(): Promise<string[]> {
  const db = await getDb();
  const log: string[] = [];

  const providerIds: Record<string, string> = {};
  for (const p of PROVIDERS) {
    providerIds[p.slug] = await upsertProvider(db, p);
    log.push(`provider ready: ${p.slug}`);
  }

  await retractLegacyInferences(db, providerIds, log);

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
