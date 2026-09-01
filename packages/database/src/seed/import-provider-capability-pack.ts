/**
 * Imports a provider-capability bootstrap pack and a capability research
 * queue. It is intentionally conservative: only the dimensions supplied in
 * one record are written to the live graph. Lists from separate fields never
 * become a Cartesian product, and the research queue never feeds routing.
 *
 * pnpm --filter @railor/database import-provider-capability-pack -- \
 *   --providers C:\path\railor_provider_capability_seed_v2.json \
 *   --queue C:\path\railor_route_research_queue_v1.json
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

type Product = (typeof s.productTypeEnum.enumValues)[number];
type Endpoint = (typeof s.receivingEndpointTypeEnum.enumValues)[number];
type PaymentMethod = (typeof s.paymentMethodEnum.enumValues)[number];

interface ProviderInput {
  provider: string;
  category: string[];
  integration?: Record<string, boolean>;
  sources: string[];
  recommended_refresh?: string;
  confirmed_asset_network_edges?: Array<{ asset: string; network?: string; networks?: string[] }>;
  coverage_claims?: Array<{ claim: string }>;
  country_requirement_pages_include?: string[];
  confirmed_route_patterns?: Array<Record<string, unknown>>;
  confirmed_named_payout_methods?: string[];
  confirmed_payment_methods?: string[];
  confirmed_named_rails?: string[];
  confirmed_named_rails_from_provider_page?: string[];
  confirmed_examples?: Array<{ country: string; currency: string; payout_methods: string[] }>;
  confirmed_exact_route_edges?: Array<Record<string, unknown>>;
  quote_support?: { evidence?: string };
  capabilities?: Record<string, unknown>;
  limitations?: string[];
  important_ingestion_note?: string;
  change_monitoring_value?: string;
}

interface QueueInput {
  generated_at: string;
  default_status: string;
  queries: Array<Record<string, string>>;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const normalise = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const providerSlugs: Record<string, string> = {
  "Zero Hash": "zero-hash",
  BVNK: "bvnk",
  dLocal: "dlocal",
  "Bitso / Juno": "bitso-juno",
  Xflow: "xflow",
  "Ramp Network": "ramp-network",
  Transak: "transak",
  "Yellow Card": "yellow-card",
  Crossmint: "crossmint",
  BlindPay: "blindpay",
};

const countryCodes: Record<string, string> = {
  India: "IN", "United Arab Emirates": "AE", Nigeria: "NG", Kenya: "KE", Brazil: "BR", Mexico: "MX",
  Philippines: "PH", Indonesia: "ID", "South Africa": "ZA", Bangladesh: "BD", Malaysia: "MY", Thailand: "TH",
  Vietnam: "VN", Argentina: "AR", Chile: "CL", Colombia: "CO", Peru: "PE", Uruguay: "UY", Botswana: "BW", Cameroon: "CM",
};

const networkSlugs: Record<string, string> = {
  Ethereum: "ethereum", Polygon: "polygon", Tron: "tron", Solana: "solana", Arbitrum: "arbitrum", Base: "base",
  "BNB Chain": "bnb-chain", Stellar: "stellar",
};

const productForCategory: Record<string, Product[]> = {
  stablecoin_payouts: ["payout", "off_ramp"], fiat_remittances: ["payout"], crypto_payouts: ["payout"],
  stablecoin_payments: ["collection", "payout"], wallets: ["wallet"], fiat_accounts: ["virtual_account"], conversion: ["off_ramp"],
  global_payouts: ["payout"], local_bank_payouts: ["payout"], mexico_payins: ["collection"], mexico_payouts: ["payout"],
  stablecoin_local_rail: ["collection", "payout"], india_cross_border_receiving: ["collection"], stablecoin_exports: ["off_ramp"],
  onramp: ["on_ramp"], offramp: ["off_ramp"], live_quotes: ["on_ramp", "off_ramp"], kyc: ["kyc_kyb"],
  africa_payins: ["collection"], africa_payouts: ["payout"], stablecoin_conversion: ["off_ramp"], live_fx: ["off_ramp"],
  stablecoin_offramp: ["off_ramp", "payout"], orchestration: ["treasury"],
  fiat_payouts: ["payout"], virtual_accounts: ["virtual_account"], multi_rail: ["payout"],
};

const railPaymentMethods: Record<string, PaymentMethod> = {
  ACH: "ach", RTP: "bank_transfer_local", SEPA: "sepa", SPEI: "bank_transfer_local", PIX: "bank_transfer_local",
  TED: "bank_transfer_local", WIRE: "wire", SWIFT: "bank_transfer_swift", CARD: "card",
};

const endpointFor = (method: string): Endpoint => method.toUpperCase().includes("MOBILE") ? "mobile_money" : "bank_account";

function sourceType(url: string): (typeof s.sourceTypeEnum.enumValues)[number] {
  if (url.includes("/changelog")) return "official_announcement";
  if (url.includes("api") || url.includes("reference")) return "api";
  if (url.includes("help.")) return "help_center";
  return "official_docs";
}

function frequency(value?: string): number {
  if (value?.includes("hourly")) return 1;
  if (value?.includes("daily")) return 24;
  return 168;
}

function titleFor(url: string): string {
  const parsed = new URL(url);
  return `Official provider source — ${parsed.hostname}${parsed.pathname}`;
}

function readJson<T>(raw: string, label: string): T {
  try { return JSON.parse(raw) as T; } catch (error) { throw new Error(`${label} is not valid JSON: ${(error as Error).message}`); }
}

function requireUrl(url: string, label: string): string {
  try { new URL(url); } catch { throw new Error(`${label} has invalid URL: ${url}`); }
  return url;
}

function parseProviders(raw: string): { generatedAt: Date; providers: ProviderInput[] } {
  const value = readJson<Record<string, unknown>>(raw, "provider pack");
  const generatedAt = new Date(String(value.generated_at));
  if (Number.isNaN(generatedAt.getTime())) throw new Error("provider pack generated_at is invalid");
  if (!Array.isArray(value.providers)) throw new Error("provider pack providers must be an array");
  const providers = value.providers.map((item, index) => {
    const provider = item as ProviderInput;
    if (!provider.provider || !Array.isArray(provider.category) || !Array.isArray(provider.sources) || !provider.sources.length) {
      throw new Error(`provider pack providers[${index}] requires provider, category, and sources`);
    }
    provider.sources.forEach((url, sourceIndex) => requireUrl(url, `providers[${index}].sources[${sourceIndex}]`));
    return provider;
  });
  return { generatedAt, providers };
}

function parseQueue(raw: string): { generatedAt: Date; status: string; queries: Array<Record<string, string>> } {
  const value = readJson<QueueInput>(raw, "route research queue");
  const generatedAt = new Date(value.generated_at);
  if (Number.isNaN(generatedAt.getTime()) || !Array.isArray(value.queries)) throw new Error("route research queue is invalid");
  for (const [index, query] of value.queries.entries()) {
    for (const key of ["entity_country", "customer_type", "source_asset", "source_network", "destination_country", "destination_currency"] as const) {
      if (!query[key]) throw new Error(`route research queue queries[${index}].${key} is required`);
    }
    if (!query.endpoint && !query.rail) throw new Error(`route research queue queries[${index}] requires endpoint or rail`);
  }
  return { generatedAt, status: value.default_status || "RESEARCH_REQUIRED", queries: value.queries };
}

async function upsertProvider(db: Awaited<ReturnType<typeof getDb>>, input: ProviderInput, generatedAt: Date): Promise<{ id: string; slug: string }> {
  const desiredSlug = providerSlugs[input.provider] ?? normalise(input.provider);
  const [byName] = await db.select().from(s.providers).where(eq(s.providers.name, input.provider)).limit(1);
  const [bySlug] = byName ? [byName] : await db.select().from(s.providers).where(eq(s.providers.slug, desiredSlug)).limit(1);
  const values = {
    slug: desiredSlug,
    name: input.provider,
    isDemo: false,
    category: input.category.join(", "),
    description: "Provider-reported bootstrap record. Exact routing remains unknown unless all route dimensions are evidenced.",
    docsUrl: input.sources[0],
    hasApi: input.integration?.api ?? false,
    hasSandbox: Boolean(input.integration?.sandbox || input.integration?.sandbox_or_cert || input.integration?.staging),
    hasWebhooks: input.integration?.webhooks ?? false,
    sdkLanguages: input.integration?.sdk ? ["provider_sdk"] : [],
    lastVerifiedAt: generatedAt,
  };
  if (bySlug) {
    await db.update(s.providers).set(values).where(eq(s.providers.id, bySlug.id));
    return { id: bySlug.id, slug: bySlug.slug };
  }
  const [created] = await db.insert(s.providers).values(values).returning({ id: s.providers.id, slug: s.providers.slug });
  return created!;
}

async function upsertSourceDocument(db: Awaited<ReturnType<typeof getDb>>, providerId: string, url: string, refresh: string | undefined, generatedAt: Date): Promise<string> {
  const [existing] = await db.select().from(s.sourceDocuments).where(and(eq(s.sourceDocuments.providerId, providerId), eq(s.sourceDocuments.url, url))).limit(1);
  const values = { providerId, url, title: titleFor(url), sourceType: sourceType(url), crawlFrequencyHours: frequency(refresh), parser: url.includes("api") ? "api_reference" : "generic_html", lastCheckedAt: generatedAt };
  if (existing) { await db.update(s.sourceDocuments).set(values).where(eq(s.sourceDocuments.id, existing.id)); return existing.id; }
  const [created] = await db.insert(s.sourceDocuments).values(values).returning({ id: s.sourceDocuments.id });
  return created!.id;
}

async function evidenceFor(db: Awaited<ReturnType<typeof getDb>>, providerId: string, sourceDocumentId: string, url: string, claim: string, generatedAt: Date): Promise<string> {
  const rawExcerpt = `Imported provider-reported claim: ${claim}`;
  const rawHash = hash(`${url}\n${rawExcerpt}`);
  const [existing] = await db.select().from(s.evidence).where(and(eq(s.evidence.providerId, providerId), eq(s.evidence.sourceUrl, url), eq(s.evidence.rawHash, rawHash))).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(s.evidence).values({
    providerId, sourceDocumentId, sourceUrl: url, sourceTitle: titleFor(url), sourceType: sourceType(url), verificationType: "provider_reported",
    retrievedAt: generatedAt, lastVerifiedAt: generatedAt, confidence: "0.72", rawExcerpt, rawHash,
  }).returning({ id: s.evidence.id });
  return created!.id;
}

async function ensureProducts(db: Awaited<ReturnType<typeof getDb>>, providerId: string, categories: string[]): Promise<Product[]> {
  const products = [...new Set(categories.flatMap((category) => productForCategory[category] ?? []))];
  for (const product of products) {
    await db.insert(s.providerProducts).values({ providerId, product, name: product.replace(/_/g, " "), description: "Provider-reported product bootstrap.", availability: "supported" })
      .onConflictDoUpdate({ target: [s.providerProducts.providerId, s.providerProducts.product], set: { availability: "supported", description: "Provider-reported product bootstrap." } });
  }
  return products;
}

async function insertCapability(
  db: Awaited<ReturnType<typeof getDb>>, providerId: string, product: Product, evidenceId: string, generatedAt: Date,
  values: Partial<typeof s.providerCapabilities.$inferInsert>,
): Promise<boolean> {
  const existing = await db.select().from(s.providerCapabilities).where(eq(s.providerCapabilities.providerId, providerId));
  const duplicate = existing.some((row) =>
    row.product === product && row.entityCountry === (values.entityCountry ?? null) && row.customerType === (values.customerType ?? null) &&
    row.sourceAsset === (values.sourceAsset ?? null) && row.sourceNetwork === (values.sourceNetwork ?? null) &&
    row.destinationCountry === (values.destinationCountry ?? null) && row.destinationCurrency === (values.destinationCurrency ?? null) &&
    row.paymentMethod === (values.paymentMethod ?? null) && row.availability === "supported",
  );
  if (duplicate) return false;
  await db.insert(s.providerCapabilities).values({ providerId, product, availability: "supported", derivation: "source", evidenceId, lastVerifiedAt: generatedAt, ...values });
  return true;
}

async function insertEndpoint(
  db: Awaited<ReturnType<typeof getDb>>, providerId: string, countryCode: string, destinationCurrency: string, endpointType: Endpoint,
  evidenceId: string, generatedAt: Date, note: string,
): Promise<boolean> {
  const existing = await db.select().from(s.receivingEndpoints).where(eq(s.receivingEndpoints.providerId, providerId));
  if (existing.some((row) => row.countryCode === countryCode && row.destinationCurrency === destinationCurrency && row.endpointType === endpointType && row.note === note)) return false;
  await db.insert(s.receivingEndpoints).values({
    providerId, countryCode, endpointType, stablecoinMode: "unknown", destinationCurrency, availability: "supported", note,
    derivation: "source", evidenceId, lastVerifiedAt: generatedAt,
  });
  return true;
}

function pickSource(input: ProviderInput, preferredIndex = 0): string { return input.sources[Math.min(preferredIndex, input.sources.length - 1)]!; }

async function importProvider(db: Awaited<ReturnType<typeof getDb>>, input: ProviderInput, generatedAt: Date): Promise<number> {
  const provider = await upsertProvider(db, input, generatedAt);
  const documents = new Map<string, string>();
  for (const url of input.sources) documents.set(url, await upsertSourceDocument(db, provider.id, url, input.recommended_refresh, generatedAt));
  const products = await ensureProducts(db, provider.id, input.category);
  const payout = products.includes("payout") ? "payout" : products[0];
  if (!payout) return 0;
  const evidence = async (claim: string, preferredIndex = 0) => {
    const url = pickSource(input, preferredIndex);
    return evidenceFor(db, provider.id, documents.get(url)!, url, claim, generatedAt);
  };
  let inserted = 0;

  for (const edge of input.confirmed_asset_network_edges ?? []) {
    for (const networkName of edge.networks ?? (edge.network ? [edge.network] : [])) {
      const sourceNetwork = networkSlugs[networkName];
      if (!sourceNetwork) continue;
      const evidenceId = await evidence(`${edge.asset} is explicitly listed on ${networkName} for provider deposits/payouts; no destination corridor is asserted.`, 1);
      if (await insertCapability(db, provider.id, payout, evidenceId, generatedAt, { sourceAsset: edge.asset, sourceNetwork, note: "Asset/network support only; does not establish a destination corridor." })) inserted++;
    }
  }

  for (const claim of input.coverage_claims ?? []) {
    const evidenceId = await evidence(claim.claim, 1);
    // The global numerical coverage statement remains in evidence only. The one claim that explicitly enumerates countries may safely create standalone country facts.
    if (claim.claim.includes("including India")) {
      for (const name of ["India", "United Arab Emirates", "Nigeria", "Kenya", "Brazil", "Mexico", "Philippines", "Indonesia", "South Africa"]) {
        if (await insertCapability(db, provider.id, payout, evidenceId, generatedAt, { destinationCountry: countryCodes[name], note: "Standalone beneficiary-country statement; not paired with an asset or network." })) inserted++;
      }
    }
  }

  for (const method of [...(input.confirmed_named_payout_methods ?? []), ...(input.confirmed_payment_methods ?? []), ...(input.confirmed_named_rails ?? []), ...(input.confirmed_named_rails_from_provider_page ?? [])]) {
    const paymentMethod = railPaymentMethods[method.toUpperCase()];
    if (!paymentMethod) continue;
    const evidenceId = await evidence(`${method} is listed as a provider payment or payout method; country and asset pairing are not asserted.`, 0);
    if (await insertCapability(db, provider.id, payout, evidenceId, generatedAt, { paymentMethod, note: "Standalone payment-method statement; not paired with a country or asset." })) inserted++;
  }

  for (const example of input.confirmed_examples ?? []) {
    const countryCode = countryCodes[example.country];
    if (!countryCode) continue;
    const evidenceId = await evidence(`${example.country} ${example.currency} supports ${example.payout_methods.join(" and ")} payout endpoint(s).`, 1);
    for (const method of example.payout_methods) {
      if (await insertEndpoint(db, provider.id, countryCode, example.currency, endpointFor(method), evidenceId, generatedAt, "Provider-reported local endpoint. Stablecoin compatibility is not paired to this endpoint.")) inserted++;
    }
  }

  if (input.provider === "Bitso / Juno") {
    const evidenceId = await evidence("MXNB-to-MXN payout is delivered to a configured external Mexican bank account through SPEI; the seed does not establish a source network.", 1);
    if (await insertCapability(db, provider.id, "payout", evidenceId, generatedAt, { destinationCountry: "MX", destinationCurrency: "MXN", paymentMethod: "bank_transfer_local", note: "MXNB/MXN/SPEI flow; source asset is deliberately omitted because MXNB is not in the Railor reference catalog." })) inserted++;
    if (await insertEndpoint(db, provider.id, "MX", "MXN", "bank_account", evidenceId, generatedAt, "MXNB-funded MXN bank payout via SPEI; source network not asserted in this import.")) inserted++;
  }

  if (input.provider === "BlindPay") {
    const exact = input.confirmed_exact_route_edges?.[0];
    if (exact) {
      const networks = Array.isArray(exact.source_networks) ? exact.source_networks : [];
      for (const networkName of networks.filter((value): value is string => typeof value === "string")) {
        const sourceNetwork = networkSlugs[networkName];
        if (!sourceNetwork) continue;
        const evidenceId = await evidence(`USDC from ${networkName} is provider-reported for EUR SEPA payout in the SEPA zone. The submitted record does not name an individual destination country.`, 2);
        if (await insertCapability(db, provider.id, "payout", evidenceId, generatedAt, { sourceAsset: "USDC", sourceNetwork, destinationCurrency: "EUR", paymentMethod: "sepa", note: "SEPA-zone statement only; individual-country eligibility requires the provider's current route response or country-specific evidence." })) inserted++;
      }
    }
    const us = input.confirmed_exact_route_edges?.[1];
    if (us) {
      const evidenceId = await evidence("US ACH and RTP payout rails are provider-reported; the submitted record does not pair an input asset/network.", 3);
      for (const paymentMethod of ["ach", "bank_transfer_local"] as PaymentMethod[]) {
        if (await insertCapability(db, provider.id, "payout", evidenceId, generatedAt, { destinationCountry: "US", destinationCurrency: "USD", paymentMethod, note: "Standalone US payout-rail statement; not paired with a stablecoin asset/network." })) inserted++;
      }
    }

    // The submitted $50,000 cap conflicts with the current official SEPA
    // announcement (which distinguishes $100,000 individual and $300,000
    // business caps). Never pick a value silently: leave limits untouched
    // and send the material discrepancy to the existing review workflow.
    const currentLimitClaim = "Current official SEPA EUR payout announcement states a $100,000 per-payout maximum for individual receivers and $300,000 for business receivers; this conflicts with the submitted $50,000 claim.";
    const currentLimitUrl = pickSource(input, 1);
    const currentLimitEvidence = await evidenceFor(db, provider.id, documents.get(currentLimitUrl)!, currentLimitUrl, currentLimitClaim, generatedAt);
    const [existingReview] = await db.select({ id: s.changeEvents.id }).from(s.changeEvents)
      .where(and(eq(s.changeEvents.providerId, provider.id), eq(s.changeEvents.field, "blindpay_sepa_per_payout_cap"))).limit(1);
    if (!existingReview) {
      await db.insert(s.changeEvents).values({
        providerId: provider.id,
        kind: "limit_changed",
        field: "blindpay_sepa_per_payout_cap",
        previousValue: "Submitted capability pack: 50,000 USD per payout",
        currentValue: "Official SEPA announcement: 100,000 USD individual / 300,000 USD business",
        summary: "Submitted BlindPay SEPA per-payout cap conflicts with the current official announcement; manual review required before publication.",
        detectedAt: new Date(),
        sourceDocumentId: documents.get(currentLimitUrl)!,
        evidenceId: currentLimitEvidence,
        confidence: "0.95",
        reviewStatus: "pending",
        affects: { sourceAsset: "USDC", destinationCurrency: "EUR", paymentMethod: "sepa" },
      });
    }
  }

  if (input.quote_support?.evidence) await evidence(input.quote_support.evidence, 2);
  if (input.limitations?.length) for (const limitation of input.limitations) await evidence(`Product limitation: ${limitation}`, 2);
  return inserted;
}

async function importQueue(db: Awaited<ReturnType<typeof getDb>>, queue: ReturnType<typeof parseQueue>): Promise<number> {
  const values: (typeof s.routeResearchQueue.$inferInsert)[] = [];
  for (const query of queue.queries) {
    const customerType = query.customer_type!;
    const sourceNetwork = query.source_network!;
    const inputHash = hash(JSON.stringify(query));
    values.push({
      inputHash, sourceName: "railor_route_research_queue_v1.json", generatedAt: queue.generatedAt, status: queue.status,
      entityCountry: query.entity_country, customerType: customerType.toLowerCase() as "business" | "individual",
      sourceAsset: query.source_asset, sourceNetwork: sourceNetwork.toLowerCase(), destinationCountry: query.destination_country,
      destinationCurrency: query.destination_currency, endpointType: query.endpoint?.toLowerCase() as Endpoint | undefined,
      namedRail: query.rail === "SPEI" ? "SPEI" : undefined, query,
    });
  }
  await db.insert(s.routeResearchQueue).values(values).onConflictDoUpdate({
    target: s.routeResearchQueue.inputHash,
    set: {
      sourceName: "railor_route_research_queue_v1.json", generatedAt: queue.generatedAt, status: queue.status,
      updatedAt: new Date(),
    },
  });
  return values.length;
}

export async function importProviderCapabilityPack(providerPath: string, queuePath: string, providerNames?: readonly string[]) {
  const [providerRaw, queueRaw] = await Promise.all([readFile(providerPath, "utf8"), readFile(queuePath, "utf8")]);
  const pack = parseProviders(providerRaw);
  const queue = parseQueue(queueRaw);
  const db = await getDb();
  let capabilityRows = 0;
  const selectedProviders = providerNames?.length
    ? pack.providers.filter((provider) => providerNames.includes(provider.provider))
    : pack.providers;
  for (const provider of selectedProviders) capabilityRows += await importProvider(db, provider, pack.generatedAt);
  const queueRows = await importQueue(db, queue);
  return { providers: selectedProviders.length, capabilityRows, queueRows, queueTotal: queue.queries.length };
}

async function main() {
  const providersIndex = process.argv.indexOf("--providers");
  const queueIndex = process.argv.indexOf("--queue");
  const providerNames = process.argv.flatMap((arg, index) => arg === "--provider" && process.argv[index + 1] ? [process.argv[index + 1]!] : []);
  if (providersIndex < 0 || queueIndex < 0 || !process.argv[providersIndex + 1] || !process.argv[queueIndex + 1]) throw new Error("usage: --providers <file> --queue <file>");
  const { close } = await getDbHandle();
  try { console.log(JSON.stringify(await importProviderCapabilityPack(process.argv[providersIndex + 1]!, process.argv[queueIndex + 1]!, providerNames), null, 2)); }
  finally { await close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
