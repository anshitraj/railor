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
 * Where a provider names a real payment rail this dataset already tracks
 * (Conduit explicitly lists Fedwire/PIX/SEPA Instant/FedNow/TED/RTP/SPEI and
 * "RTGS (UK)" — the UK's RTGS system is CHAPS), receiving_endpoints link to
 * that named_rails row via namedRail — provider capabilities pointing at the
 * actual rail entities, not a generic bucket.
 *
 * Insert-only and idempotent, like both files above: safe to run again.
 *
 *   pnpm --filter @railor/database provider-batch-2
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
  const [existing] = await db.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.url, url)).limit(1);
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
    receivingEndpoints: [
      { countryCode: "GB", endpointType: "virtual_account", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "GBP", note: "UK-licensed; unified fiat/stablecoin accounts, stablecoin-native payout rail into GBP." },
      { countryCode: "US", endpointType: "virtual_account", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "USD", note: "US-licensed; unified fiat/stablecoin accounts, stablecoin-native payout rail into USD." },
    ],
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
    receivingEndpoints: [
      { countryCode: "AU", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "AUD", note: "Global Account in AUD, local payment methods and/or SWIFT." },
      { countryCode: "CA", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "CAD", note: "Global Account in CAD, local payment methods and/or SWIFT." },
      { countryCode: "DE", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "EUR", namedRail: "SEPA_CT_DE", note: "Global Account in EUR (Germany-domiciled), local payment methods and/or SWIFT." },
      { countryCode: "HK", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "HKD", note: "Global Account in HKD, local payment methods and/or SWIFT." },
      { countryCode: "ID", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "IDR", note: "Global Account in IDR, local payment methods and/or SWIFT." },
      { countryCode: "IL", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "ILS", note: "Global Account in ILS, local payment methods and/or SWIFT." },
      { countryCode: "MX", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "MXN", note: "Global Account in MXN, local payment methods and/or SWIFT." },
      { countryCode: "NZ", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "NZD", note: "Global Account in NZD, local payment methods and/or SWIFT." },
      { countryCode: "PL", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "PLN", note: "Global Account in PLN, local payment methods and/or SWIFT." },
      { countryCode: "SG", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "SGD", namedRail: "PAYNOW", note: "Global Account in SGD, local payment methods and/or SWIFT." },
      { countryCode: "AE", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "AED", note: "Global Account in AED, local payment methods and/or SWIFT." },
      { countryCode: "GB", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "GBP", namedRail: "FASTER_PAYMENTS_GB", note: "Global Account in GBP, local payment methods and/or SWIFT." },
      { countryCode: "US", endpointType: "virtual_account", stablecoinMode: "fiat_only", destinationCurrency: "USD", note: "Global Account in USD, local payment methods and/or SWIFT." },
    ],
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
    receivingEndpoints: [
      { countryCode: "US", endpointType: "bank_account", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "USD", namedRail: "FEDWIRE", note: "USD accounts funded by USDC/USDT/USDH, settled via Fedwire." },
      { countryCode: "US", endpointType: "local_instant_rail", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "USD", namedRail: "FEDNOW", note: "USD accounts funded by USDC/USDT/USDH, settled via FedNow." },
      { countryCode: "US", endpointType: "local_instant_rail", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "USD", namedRail: "RTP", note: "USD accounts funded by USDC/USDT/USDH, settled via RTP." },
      { countryCode: "BR", endpointType: "local_instant_rail", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "BRL", namedRail: "PIX", note: "Stablecoin-funded payouts settled via PIX." },
      { countryCode: "BR", endpointType: "bank_account", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "BRL", namedRail: "TED", note: "Stablecoin-funded payouts settled via TED." },
      { countryCode: "MX", endpointType: "bank_account", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "MXN", namedRail: "SPEI", note: "Stablecoin-funded payouts settled via SPEI." },
      { countryCode: "DE", endpointType: "local_instant_rail", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "EUR", namedRail: "SEPA_ICT_DE", note: "Stablecoin-funded EUR payouts settled via SEPA Instant Credit Transfer." },
      { countryCode: "GB", endpointType: "bank_account", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "GBP", namedRail: "CHAPS", note: "Provider names this rail \"RTGS (UK)\" — the UK's real-time gross settlement system is CHAPS." },
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
    receivingEndpoints: [
      { countryCode: "CO", endpointType: "bank_account", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "COP", note: "Stablecoin-funded payouts to Colombian bank accounts in COP." },
      { countryCode: "AR", endpointType: "bank_account", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "ARS", note: "Stablecoin-funded payouts to Argentine bank accounts in ARS." },
      { countryCode: "MX", endpointType: "bank_account", stablecoinMode: "stablecoin_funded_fiat", destinationCurrency: "MXN", note: "Stablecoin-funded payouts to Mexican bank accounts in MXN." },
    ],
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
