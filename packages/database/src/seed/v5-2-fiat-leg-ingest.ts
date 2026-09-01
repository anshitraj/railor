/**
 * Targeted fiat-leg intake for INR→AED and AED→CAD.
 *
 * The official documents below establish useful destination and funding
 * fragments, but neither binds the requested source currency, account
 * location, and destination in one provider response.  Therefore this file
 * adds no `provider_routes`; exact legs stay in ACCESS_REQUIRED research.
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const now = () => new Date();

const SOURCES = {
  dlocalUae: {
    provider: "dlocal",
    url: "https://docs.dlocal.com/docs/united-arab-emirates-payouts-v3",
    title: "dLocal — United Arab Emirates payouts v3",
    excerpt: "For United Arab Emirates bank-transfer payouts, the amount is paid in AED and the FX-operation source currency is AED or USD; the API shows both B2C and B2B requests.",
  },
  niumCanada: {
    provider: "nium",
    url: "https://docs.nium.com/docs/payouts/canada-eft-interac",
    title: "Nium — EFT and Interac payments (CAD)",
    excerpt: "Nium documents CAD payouts to bank accounts in Canada using EFT or Interac.",
  },
  niumFx: {
    provider: "nium",
    url: "https://docs.nium.com/docs/foreign-exchange",
    title: "Nium — Foreign exchange",
    excerpt: "Nium can convert a wallet's source currency to a payout destination currency, but availability is limited to payin currencies supported for the customer's account in the applicable Nium location.",
  },
} as const;

async function evidenceId(db: Awaited<ReturnType<typeof getDb>>, source: (typeof SOURCES)[keyof typeof SOURCES]) {
  const [provider] = await db.select().from(s.providers).where(eq(s.providers.slug, source.provider)).limit(1);
  if (!provider) throw new Error(`Expected existing provider ${source.provider}.`);
  let [document] = await db.select().from(s.sourceDocuments)
    .where(and(eq(s.sourceDocuments.providerId, provider.id), eq(s.sourceDocuments.url, source.url))).limit(1);
  if (!document) [document] = await db.insert(s.sourceDocuments).values({ providerId: provider.id, url: source.url, title: source.title, sourceType: "official_docs", crawlFrequencyHours: 168, lastCheckedAt: now() }).returning();
  const rawHash = hash(`${source.url}:${source.excerpt}`);
  let [record] = await db.select().from(s.evidence).where(and(eq(s.evidence.providerId, provider.id), eq(s.evidence.rawHash, rawHash))).limit(1);
  if (!record) [record] = await db.insert(s.evidence).values({ providerId: provider.id, sourceDocumentId: document!.id, sourceUrl: source.url, sourceTitle: source.title, sourceType: "official_docs", verificationType: "provider_reported", retrievedAt: now(), lastVerifiedAt: now(), confidence: "0.95", rawExcerpt: source.excerpt, rawHash }).returning();
  return { provider, id: record!.id };
}

async function main() {
  const db = await getDb();
  const dlocal = await evidenceId(db, SOURCES.dlocalUae);
  const niumCanada = await evidenceId(db, SOURCES.niumCanada);
  const niumFx = await evidenceId(db, SOURCES.niumFx);
  const specs: Array<typeof s.providerCapabilities.$inferInsert> = [
    { providerId: dlocal.provider.id, product: "payout", sourceCurrency: "AED", destinationCountry: "AE", destinationCurrency: "AED", paymentMethod: "bank_transfer_local", availability: "supported", derivation: "source", evidenceId: dlocal.id, lastVerifiedAt: now(), note: "dLocal's UAE payout API explicitly binds AED funding to AED bank-transfer payout. It does not prove INR funding or any entity-country eligibility." },
    { providerId: niumCanada.provider.id, product: "payout", destinationCountry: "CA", destinationCurrency: "CAD", paymentMethod: "bank_transfer_local", availability: "supported", derivation: "source", evidenceId: niumCanada.id, lastVerifiedAt: now(), note: "Nium documents CAD bank-account payouts in Canada via EFT or Interac. It does not name AED as an eligible source currency for a UAE account." },
    { providerId: niumFx.provider.id, product: "payout", availability: "partial", derivation: "source", evidenceId: niumFx.id, lastVerifiedAt: now(), note: "Nium documents wallet FX before payout, but source-currency availability depends on the authenticated customer's account and Nium location." },
  ];
  let capabilitiesCreated = 0;
  for (const spec of specs) {
    const [existing] = await db.select({ id: s.providerCapabilities.id }).from(s.providerCapabilities)
      .where(and(eq(s.providerCapabilities.providerId, spec.providerId), eq(s.providerCapabilities.product, spec.product), eq(s.providerCapabilities.evidenceId, spec.evidenceId!))).limit(1);
    if (!existing) { await db.insert(s.providerCapabilities).values(spec); capabilitiesCreated++; }
  }
  const gaps = [
    { sourceCurrency: "INR", destinationCountry: "AE", destinationCurrency: "AED", verificationNeeded: "A single authenticated provider configuration, route lookup, or quote that proves INR funding may be paid out as AED to a UAE beneficiary, including applicable entity/KYB eligibility and bank rail." },
    { sourceCurrency: "AED", destinationCountry: "CA", destinationCurrency: "CAD", verificationNeeded: "A single authenticated provider configuration, route lookup, or quote that proves AED funding may be paid out as CAD to a Canadian beneficiary, including applicable entity/KYB eligibility and bank rail." },
  ] as const;
  for (const gap of gaps) {
    const query = { customerType: "business", product: "payout", endpointType: "bank_account", ...gap };
    await db.insert(s.routeResearchQueue).values({ inputHash: hash(JSON.stringify(query)), sourceName: "v5-2-fiat-leg-ingest", generatedAt: now(), status: "ACCESS_REQUIRED", customerType: "business", sourceCurrency: gap.sourceCurrency, destinationCountry: gap.destinationCountry, destinationCurrency: gap.destinationCurrency, endpointType: "bank_account", query }).onConflictDoNothing({ target: s.routeResearchQueue.inputHash });
  }
  console.log(JSON.stringify({ evidenceUpserted: 3, capabilitiesCreated, atomicRoutesCreated: 0, exactLegs: gaps.map((gap) => ({ ...gap, status: "ACCESS_REQUIRED" })) }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(async () => (await getDbHandle()).close()).catch(async (error) => { console.error(error); await (await getDbHandle()).close(); process.exit(1); });
}
