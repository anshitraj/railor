/**
 * Narrow V5.1 follow-up ingestion. These are deliberately separate facts:
 * Bridge's docs prove Base/USDC↔EUR, SEPA's German IBAN coverage, and an
 * account-specific endorsement gate on different pages. Do not write a
 * provider_routes row until an authenticated quote/configuration response
 * binds the complete Germany business route.
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const timestamp = () => new Date();

const SOURCES = [
  {
    url: "https://apidocs.bridge.xyz/get-started/introduction/what-we-support/fiat",
    title: "Bridge — Fiat payment methods",
    excerpt: "Bridge supports EURO via SEPA; its supported crypto-to-fiat table lists Base / USDC → EUR.",
  },
  {
    url: "https://apidocs.bridge.xyz/platform/orchestration/more/rail-specific",
    title: "Bridge — Rail specific details",
    excerpt: "For EUR SEPA standard credit and SEPA instant offramps, supported IBAN-issued countries include Germany; third-party business transfers are unlimited and the minimum is EUR 1.",
  },
  {
    url: "https://apidocs.bridge.xyz/platform/customers/customers/sepa-euro-transactions",
    title: "Bridge — SEPA/Euro transactions",
    excerpt: "Bridge can offramp crypto to an external SEPA-enabled bank account. Germany is an EEA country, but users must inspect the Customer API endorsements status; an incomplete SEPA endorsement can require proof of address and ToS acceptance.",
  },
] as const;

async function main() {
  const db = await getDb();
  const [provider] = await db.select().from(s.providers).where(eq(s.providers.slug, "bridge")).limit(1);
  if (!provider) throw new Error("Expected the existing Bridge provider before V5.1 targeted ingest.");
  const evidenceIds: string[] = [];
  for (const source of SOURCES) {
    let [document] = await db.select().from(s.sourceDocuments)
      .where(and(eq(s.sourceDocuments.providerId, provider.id), eq(s.sourceDocuments.url, source.url))).limit(1);
    if (!document) {
      [document] = await db.insert(s.sourceDocuments).values({ providerId: provider.id, url: source.url, title: source.title, sourceType: "official_docs", crawlFrequencyHours: 168, lastCheckedAt: timestamp() }).returning();
    }
    const rawHash = hash(`${source.url}:${source.excerpt}`);
    let [record] = await db.select().from(s.evidence).where(and(eq(s.evidence.providerId, provider.id), eq(s.evidence.rawHash, rawHash))).limit(1);
    if (!record) {
      [record] = await db.insert(s.evidence).values({
        providerId: provider.id, sourceDocumentId: document!.id, sourceUrl: source.url, sourceTitle: source.title,
        sourceType: "official_docs", verificationType: "provider_reported", retrievedAt: timestamp(), lastVerifiedAt: timestamp(),
        confidence: "0.95", rawExcerpt: source.excerpt, rawHash,
      }).returning();
    }
    evidenceIds.push(record!.id);
  }

  const capabilitySpecs: Array<typeof s.providerCapabilities.$inferInsert> = [
    { providerId: provider.id, product: "off_ramp", customerType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCurrency: "EUR", paymentMethod: "sepa", availability: "partial", note: "Bridge documents the Base/USDC↔EUR/SEPA route, but this page does not establish a Germany entity or beneficiary country.", evidenceId: evidenceIds[0], lastVerifiedAt: timestamp() },
    { providerId: provider.id, product: "off_ramp", customerType: "business", destinationCountry: "DE", destinationCurrency: "EUR", paymentMethod: "sepa", availability: "partial", note: "Bridge documents German-issued IBAN support for EUR SEPA offramps; no asset/network is asserted on this page.", evidenceId: evidenceIds[1], lastVerifiedAt: timestamp() },
    { providerId: provider.id, product: "off_ramp", entityCountry: "DE", customerType: "business", availability: "partial", note: "Germany is in Bridge's EEA onboarding coverage, subject to SEPA endorsement/KYC/ToS status returned by the Customer API.", evidenceId: evidenceIds[2], lastVerifiedAt: timestamp() },
  ];
  let capabilitiesCreated = 0;
  for (const spec of capabilitySpecs) {
    const [existing] = await db.select({ id: s.providerCapabilities.id }).from(s.providerCapabilities)
      .where(and(eq(s.providerCapabilities.providerId, provider.id), eq(s.providerCapabilities.product, spec.product), eq(s.providerCapabilities.evidenceId, spec.evidenceId!))).limit(1);
    if (!existing) {
      await db.insert(s.providerCapabilities).values(spec);
      capabilitiesCreated++;
    }
  }

  const query = { entityCountry: "DE", customerType: "business", sourceCountry: "DE", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "DE", destinationCurrency: "EUR", endpointType: "bank_account", namedRail: "SEPA", product: "off_ramp", verificationNeeded: "Authenticated Bridge Customer endorsement plus quote/configuration result proving all dimensions together." };
  const inputHash = hash(JSON.stringify(query));
  await db.insert(s.routeResearchQueue).values({ inputHash, sourceName: "v5-1-bridge-targeted-ingest", generatedAt: timestamp(), status: "ACCESS_REQUIRED", entityCountry: "DE", customerType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "DE", destinationCurrency: "EUR", endpointType: "bank_account", namedRail: "SEPA", query }).onConflictDoNothing({ target: s.routeResearchQueue.inputHash });
  console.log(JSON.stringify({ provider: provider.slug, evidenceUpserted: evidenceIds.length, capabilitiesCreated, atomicRoutesCreated: 0, queueStatus: "ACCESS_REQUIRED" }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(async () => (await getDbHandle()).close()).catch(async (error) => { console.error(error); await (await getDbHandle()).close(); process.exit(1); });
}
