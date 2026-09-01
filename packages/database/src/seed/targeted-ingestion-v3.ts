/**
 * Targeted Ingestion V3: a deliberately small, source-verified P0 update.
 * It consumes no broad crawl output and never turns independent facts into a
 * supported route. The public sources establish only the atomic facts below.
 *
 * pnpm --filter @railor/database targeted-ingestion-v3
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const verifiedAt = () => new Date();

const SOURCES = {
  zeroHashAssets: "https://docs.zerohash.com/page/what-assets-do-you-support",
  zeroHashRegions: "https://docs.zerohash.com/docs/supported-regions",
  zeroHashEligibility: "https://docs.zerohash.com/reference/participant-jurisdictions",
  dlocalCrypto: "https://docs.dlocal.com/docs/global-crypto-payouts",
  niumUae: "https://playbook.nium.com/country/united-arab-emirates",
} as const;

const TITLES: Record<string, string> = {
  [SOURCES.zeroHashAssets]: "Zero Hash — Production Environment Assets",
  [SOURCES.zeroHashRegions]: "Zero Hash — Payouts Supported Regions",
  [SOURCES.zeroHashEligibility]: "Zero Hash — Participant Jurisdictions",
  [SOURCES.dlocalCrypto]: "dLocal — Global Crypto Payouts",
  [SOURCES.niumUae]: "Nium — Payouts to United Arab Emirates",
};

async function providerId(db: Awaited<ReturnType<typeof getDb>>, slug: string): Promise<string> {
  const [provider] = await db.select({ id: s.providers.id }).from(s.providers).where(eq(s.providers.slug, slug)).limit(1);
  if (!provider) throw new Error(`Targeted V3 expected provider ${slug} to exist`);
  return provider.id;
}

async function sourceDocument(
  db: Awaited<ReturnType<typeof getDb>>, provider: string, url: string, sourceType: "official_docs" | "api",
): Promise<string> {
  const [existing] = await db.select({ id: s.sourceDocuments.id }).from(s.sourceDocuments)
    .where(and(eq(s.sourceDocuments.providerId, provider), eq(s.sourceDocuments.url, url))).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(s.sourceDocuments).values({
    providerId: provider, url, title: TITLES[url]!, sourceType, crawlFrequencyHours: 24,
    parser: sourceType === "api" ? "api_reference" : "generic_html", lastCheckedAt: verifiedAt(),
  }).returning({ id: s.sourceDocuments.id });
  return created!.id;
}

async function evidence(
  db: Awaited<ReturnType<typeof getDb>>, provider: string, documentId: string, url: string, excerpt: string,
): Promise<string> {
  const rawHash = hash(`${url}\n${excerpt}`);
  const [existing] = await db.select({ id: s.evidence.id }).from(s.evidence)
    .where(and(eq(s.evidence.providerId, provider), eq(s.evidence.sourceUrl, url), eq(s.evidence.rawHash, rawHash))).limit(1);
  if (existing) return existing.id;
  const at = verifiedAt();
  const [created] = await db.insert(s.evidence).values({
    providerId: provider, sourceDocumentId: documentId, sourceUrl: url, sourceTitle: TITLES[url]!,
    sourceType: url.includes("reference/") ? "api" : "official_docs", verificationType: "provider_reported",
    retrievedAt: at, lastVerifiedAt: at, confidence: "0.95", rawExcerpt: excerpt, rawHash,
  }).returning({ id: s.evidence.id });
  return created!.id;
}

async function upsertProduct(db: Awaited<ReturnType<typeof getDb>>, provider: string, product: "payout") {
  await db.insert(s.providerProducts).values({
    providerId: provider, product, name: "Payouts", description: "Official provider documentation.", availability: "supported",
  }).onConflictDoNothing();
}

async function upsertCapability(
  db: Awaited<ReturnType<typeof getDb>>, provider: string, values: typeof s.providerCapabilities.$inferInsert,
): Promise<boolean> {
  const existing = await db.select().from(s.providerCapabilities).where(eq(s.providerCapabilities.providerId, provider));
  const duplicate = existing.find((row) => row.product === values.product && row.entityCountry === (values.entityCountry ?? null) &&
    row.customerType === (values.customerType ?? null) && row.sourceAsset === (values.sourceAsset ?? null) &&
    row.sourceNetwork === (values.sourceNetwork ?? null) && row.destinationCountry === (values.destinationCountry ?? null) &&
    row.destinationCurrency === (values.destinationCurrency ?? null) && row.paymentMethod === (values.paymentMethod ?? null) && row.availability === values.availability);
  if (!duplicate) { await db.insert(s.providerCapabilities).values(values); return true; }
  // Stronger targeted evidence supersedes the old seed's generic evidence.
  await db.update(s.providerCapabilities).set({ evidenceId: values.evidenceId, note: values.note, lastVerifiedAt: values.lastVerifiedAt })
    .where(eq(s.providerCapabilities.id, duplicate.id));
  return false;
}

async function upsertEndpoint(
  db: Awaited<ReturnType<typeof getDb>>, provider: string, evidenceId: string,
): Promise<boolean> {
  const existing = await db.select().from(s.receivingEndpoints).where(eq(s.receivingEndpoints.providerId, provider));
  const match = existing.find((row) => row.countryCode === "AE" && row.destinationCurrency === "AED" && row.endpointType === "bank_account" && row.customerType === "business" && row.namedRail === "RTGS_AE");
  const values = {
    providerId: provider, countryCode: "AE", endpointType: "bank_account" as const, stablecoinMode: "unknown" as const,
    customerType: "business" as const, destinationCurrency: "AED", namedRail: "RTGS_AE", paymentMethod: "bank_transfer_local" as const,
    settlementEstimate: "T0; same-day credit subject to local 18:30 cutoff.",
    complianceDocs: "Remitter/beneficiary relationship, nature of business, contract and current invoice.",
    availability: "supported" as const,
    note: "Nium UAE B2B AED bank payout. This endpoint does not establish source asset/network or Indian-entity eligibility.",
    derivation: "source" as const, evidenceId, lastVerifiedAt: verifiedAt(),
  };
  if (!match) { await db.insert(s.receivingEndpoints).values(values); return true; }
  await db.update(s.receivingEndpoints).set(values).where(eq(s.receivingEndpoints.id, match.id));
  return false;
}

export async function runTargetedIngestionV3() {
  const db = await getDb();
  let capabilitiesCreated = 0;
  let endpointsCreated = 0;
  let limitsCreated = 0;

  const zeroHash = await providerId(db, "zero-hash");
  const zeroHashAssetsDoc = await sourceDocument(db, zeroHash, SOURCES.zeroHashAssets, "official_docs");
  const zeroHashAssetsEvidence = await evidence(db, zeroHash, zeroHashAssetsDoc, SOURCES.zeroHashAssets,
    "Production asset table lists USDC (Base), symbol USDC.BASE, with full support and deposit support.");
  await upsertProduct(db, zeroHash, "payout");
  if (await upsertCapability(db, zeroHash, {
    providerId: zeroHash, product: "payout", sourceAsset: "USDC", sourceNetwork: "base", availability: "supported", derivation: "source",
    note: "Exact provider asset/network support only; it does not establish a UAE AED payout corridor.", evidenceId: zeroHashAssetsEvidence, lastVerifiedAt: verifiedAt(),
  })) capabilitiesCreated++;

  const zeroHashRegionsDoc = await sourceDocument(db, zeroHash, SOURCES.zeroHashRegions, "official_docs");
  const zeroHashRegionsEvidence = await evidence(db, zeroHash, zeroHashRegionsDoc, SOURCES.zeroHashRegions,
    "Payouts supported-regions table lists United Arab Emirates as a beneficiary destination.");
  if (await upsertCapability(db, zeroHash, {
    providerId: zeroHash, product: "payout", destinationCountry: "AE", availability: "supported", derivation: "source",
    note: "Beneficiary destination only; the source does not name AED, bank rail, or a source asset/network.", evidenceId: zeroHashRegionsEvidence, lastVerifiedAt: verifiedAt(),
  })) capabilitiesCreated++;

  const zeroHashEligibilityDoc = await sourceDocument(db, zeroHash, SOURCES.zeroHashEligibility, "api");
  const zeroHashEligibilityEvidence = await evidence(db, zeroHash, zeroHashEligibilityDoc, SOURCES.zeroHashEligibility,
    "Zero Hash directs integrators to its runtime List countries/List jurisdictions/Evaluate onboarding endpoints instead of hard-coding or guessing eligibility.");
  if (await upsertCapability(db, zeroHash, {
    providerId: zeroHash, product: "payout", entityCountry: "IN", customerType: "business", availability: "unknown", derivation: "source",
    note: "Public documentation requires a runtime Evaluate onboarding result for Indian-business eligibility; no public positive or negative result was available.", evidenceId: zeroHashEligibilityEvidence, lastVerifiedAt: verifiedAt(),
  })) capabilitiesCreated++;

  const dlocal = await providerId(db, "dlocal");
  const dlocalDoc = await sourceDocument(db, dlocal, SOURCES.dlocalCrypto, "official_docs");
  const dlocalEvidence = await evidence(db, dlocal, dlocalDoc, SOURCES.dlocalCrypto,
    "Global Crypto Payouts table lists USDC on BASE and says this product delivers stablecoins directly to a beneficiary wallet.");
  await upsertProduct(db, dlocal, "payout");
  if (await upsertCapability(db, dlocal, {
    providerId: dlocal, product: "payout", sourceAsset: "USDC", sourceNetwork: "base", availability: "supported", derivation: "source",
    note: "Direct stablecoin wallet payout support only; it is not AED bank-payout evidence.", evidenceId: dlocalEvidence, lastVerifiedAt: verifiedAt(),
  })) capabilitiesCreated++;

  const nium = await providerId(db, "nium");
  const niumDoc = await sourceDocument(db, nium, SOURCES.niumUae, "official_docs");
  const niumEvidence = await evidence(db, nium, niumDoc, SOURCES.niumUae,
    "UAE playbook states Bank Account AED payouts support B2B, use UAE RTGS-participant banks, are T0 with same-day credit subject to a local cutoff, and publish mandatory remitter and beneficiary data.");
  await upsertProduct(db, nium, "payout");
  if (await upsertCapability(db, nium, {
    providerId: nium, product: "payout", customerType: "business", destinationCountry: "AE", destinationCurrency: "AED", paymentMethod: "bank_transfer_local",
    availability: "supported", derivation: "source", note: "UAE B2B AED bank payout only; source asset/network and Indian-entity eligibility are intentionally unset.", evidenceId: niumEvidence, lastVerifiedAt: verifiedAt(),
  })) capabilitiesCreated++;
  if (await upsertEndpoint(db, nium, niumEvidence)) endpointsCreated++;
  const [existingNiumLimit] = await db.select({ id: s.limits.id }).from(s.limits)
    .where(and(eq(s.limits.providerId, nium), eq(s.limits.product, "payout"), eq(s.limits.customerType, "business"), eq(s.limits.currency, "AED"))).limit(1);
  if (!existingNiumLimit) {
    await db.insert(s.limits).values({
      providerId: nium, product: "payout", customerType: "business", currency: "AED", minAmount: "0.01", maxAmount: null,
      summary: "Nium UAE bank-account B2B payouts: AED 0.01 minimum; provider reports no maximum.", evidenceId: niumEvidence, lastVerifiedAt: verifiedAt(),
    });
    limitsCreated++;
  }

  return { capabilitiesCreated, endpointsCreated, limitsCreated, evidenceSources: 5 };
}

async function main() {
  const { close } = await getDbHandle();
  try { console.log(JSON.stringify(await runTargetedIngestionV3(), null, 2)); }
  finally { await close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
