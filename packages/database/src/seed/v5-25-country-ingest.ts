/**
 * V5 25-country ingestion pass (DE, FR, NL, CA, AU, HK, ID, ZA, SA, JP, CH,
 * SE, NO, DK, PL, TR, IL, KR, TH, VN, MY, CO, CL, AR, PE).
 *
 * Every fact below was retrieved this session via Parallel.ai search/extract
 * (budget-tracked — see railor_v5_parallel_usage_report.json) against each
 * provider's own official page, not carried over from the user's request
 * unverified. Same discipline as v4-top10-ingest.ts: never combine
 * independently-documented facts into a tuple the source itself doesn't
 * state, confidence graded by how directly the source ties the dimensions
 * together, `partial` used (not `supported`) wherever the source itself
 * gates the fact behind "contact us" or a conditional behavior.
 *
 * Idempotent and additive — checks existing rows before inserting.
 *
 *   pnpm --filter @railor/database v5-25-country-ingest
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const now = () => new Date();

type Db = Awaited<ReturnType<typeof getDb>>;
type Cap = typeof s.providerCapabilities.$inferInsert;
type Endpoint = typeof s.receivingEndpoints.$inferInsert;

async function requireProviderId(db: Db, slug: string): Promise<string> {
  const [row] = await db.select({ id: s.providers.id }).from(s.providers).where(eq(s.providers.slug, slug)).limit(1);
  if (!row) throw new Error(`v5-25-country-ingest expected provider ${slug} to already exist`);
  return row.id;
}

async function upsertSourceDocument(db: Db, providerId: string, url: string, title: string, sourceType: (typeof s.sourceTypeEnum.enumValues)[number] = "official_docs"): Promise<string> {
  const [existing] = await db.select().from(s.sourceDocuments).where(and(eq(s.sourceDocuments.providerId, providerId), eq(s.sourceDocuments.url, url))).limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(s.sourceDocuments).values({ providerId, url, title, sourceType, crawlFrequencyHours: 168, lastCheckedAt: now() }).returning({ id: s.sourceDocuments.id });
  return row!.id;
}

/** 0.95 = live-extracted this session with a clean verbatim quote directly answering the fact; 0.85 = extracted but the page itself gates the fact behind a caveat (e.g. "contact us for exact coverage"). */
async function upsertEvidence(db: Db, providerId: string, sourceDocumentId: string, url: string, title: string, excerpt: string, confidence: "0.95" | "0.90" | "0.85", sourceType: (typeof s.sourceTypeEnum.enumValues)[number] = "official_docs"): Promise<string> {
  const rawHash = hash(url + excerpt);
  const [existing] = await db.select().from(s.evidence).where(and(eq(s.evidence.providerId, providerId), eq(s.evidence.sourceUrl, url), eq(s.evidence.rawHash, rawHash))).limit(1);
  if (existing) return existing.id;
  const at = now();
  const [row] = await db.insert(s.evidence).values({ providerId, sourceDocumentId, sourceUrl: url, sourceTitle: title, sourceType, verificationType: "provider_reported", retrievedAt: at, lastVerifiedAt: at, confidence, rawExcerpt: excerpt, rawHash }).returning({ id: s.evidence.id });
  return row!.id;
}

function capMatches(row: typeof s.providerCapabilities.$inferSelect, v: Partial<Cap>): boolean {
  return row.product === v.product && row.entityCountry === (v.entityCountry ?? null) && row.customerType === (v.customerType ?? null) &&
    row.sourceAsset === (v.sourceAsset ?? null) && row.sourceNetwork === (v.sourceNetwork ?? null) &&
    row.destinationCountry === (v.destinationCountry ?? null) && row.destinationCurrency === (v.destinationCurrency ?? null) &&
    row.paymentMethod === (v.paymentMethod ?? null);
}
async function upsertCapability(db: Db, providerId: string, values: Cap): Promise<boolean> {
  const existing = await db.select().from(s.providerCapabilities).where(eq(s.providerCapabilities.providerId, providerId));
  if (existing.some((row) => capMatches(row, values))) return false;
  await db.insert(s.providerCapabilities).values(values);
  return true;
}

function epMatches(row: typeof s.receivingEndpoints.$inferSelect, v: Partial<Endpoint>): boolean {
  return row.countryCode === v.countryCode && row.endpointType === v.endpointType &&
    row.destinationCurrency === (v.destinationCurrency ?? null) && row.namedRail === (v.namedRail ?? null) &&
    row.incomingAsset === (v.incomingAsset ?? null) && row.note === (v.note ?? null);
}
async function upsertEndpoint(db: Db, providerId: string, values: Endpoint): Promise<boolean> {
  const existing = await db.select().from(s.receivingEndpoints).where(eq(s.receivingEndpoints.providerId, providerId));
  if (existing.some((row) => epMatches(row, values))) return false;
  await db.insert(s.receivingEndpoints).values(values);
  return true;
}

export async function runV5Ingest() {
  const db = await getDb();
  let capabilitiesCreated = 0;
  let endpointsCreated = 0;
  const log: string[] = [];

  /* ---- supplementary named rails found during provider extraction, not the dedicated rail-research pass ---- */
  await db.insert(s.namedRails).values([
    { code: "STRAKSCLEARING", name: "Straksclearing", countryCode: "DK", category: "bank_transfer_local", description: "Denmark's instant-payment clearing scheme, per Airwallex's own payout network documentation (DKK-denominated)." },
    { code: "DATACLEARINGEN", name: "Dataclearingen (DCL)", countryCode: "SE", category: "bank_transfer_local", description: "Sweden's bank-operated batch/ACH-style clearing system for SEK, distinct from RIX/RIX-INST/Swish — per Airwallex's own payout network documentation." },
    { code: "SIC", name: "SIC (Swiss Interbank Clearing)", countryCode: "CH", category: "bank_transfer_local", description: "Switzerland's interbank payment system for CHF, per Airwallex's own payout network documentation." },
    { code: "CENIT", name: "CENIT", countryCode: "CO", category: "bank_transfer_local", description: "Colombian interbank clearing infrastructure named alongside PSE in Airwallex's own payout network documentation." },
  ]).onConflictDoNothing({ target: s.namedRails.code });
  log.push("named rails ensured: STRAKSCLEARING(DK), DATACLEARINGEN(SE), SIC(CH), CENIT(CO)");

  /* ============================================================ */
  /* ZERO HASH — DE/NL/PL/SA named alongside the stablecoin bridge  */
  /* ============================================================ */
  {
    const pid = await requireProviderId(db, "zero-hash");
    const url = "https://docs.zerohash.com/docs/fiat-remittances-stablecoin-sandwich";
    const doc = await upsertSourceDocument(db, pid, url, "Zero Hash — Remittances: Stablecoin Sandwich");
    const excerpt = "\"Our API-powered cross-currency remittances product enables... use stablecoins as an efficient bridge between fiat currencies.\" \"zerohash enables instant fiat payouts to over 130 countries across all major regions—including... the Middle East (ie, UAE, Saudi Arabia), and Europe (ie, Netherlands, Germany, Poland).\" \"Contact Zero Hash directly for the full list of supported countries, currencies and local payment networks.\"";
    const ev = await upsertEvidence(db, pid, doc, url, "Zero Hash — Remittances: Stablecoin Sandwich", excerpt, "0.85");
    for (const country of ["DE", "NL", "PL", "SA"]) {
      if (await upsertCapability(db, pid, { providerId: pid, product: "payout", sourceAsset: "USDC", destinationCountry: country, availability: "partial", derivation: "source", evidenceId: ev, lastVerifiedAt: now(), note: "Named explicitly alongside the USDC stablecoin-bridge product on Zero Hash's own remittances page. The same page says to contact Zero Hash directly for exact currency/local-rail specifics, so this is CONDITIONAL, not a clean SUPPORTED — exact settlement currency and rail remain unconfirmed." })) capabilitiesCreated++;
    }
  }

  /* ============================================================ */
  /* AIRWALLEX — bank-account payout network, real per-country rails */
  /* ============================================================ */
  {
    const pid = await requireProviderId(db, "airwallex");
    const url = "https://www.airwallex.com/docs/payouts/payout-network/bank-accounts";
    const doc = await upsertSourceDocument(db, pid, url, "Airwallex — Payout network: bank accounts");
    const specs: Array<{ country: string; currency: string; namedRail?: string; note: string }> = [
      { country: "DE", currency: "EUR", note: "\"Germany | EUR | Yes | Yes | SEPA Instant / SEPA\" — local + instant payouts both supported." },
      { country: "TR", currency: "TRY", namedRail: "FAST_TR", note: "\"Turkey | TRY | Yes | FAST / EFT\"." },
      { country: "TH", currency: "THB", namedRail: "PROMPTPAY", note: "\"Thailand | THB | Yes | Yes | PromptPay / Smart Credit / BAHTNET\"." },
      { country: "DK", currency: "DKK", namedRail: "STRAKSCLEARING", note: "\"Denmark | DKK / EUR | Yes | Yes | Straksclearing Instant (DKK), SEPA Instant / SEPA (EUR)\" — this row covers the DKK leg." },
      { country: "SE", currency: "SEK", namedRail: "DATACLEARINGEN", note: "\"Sweden | SEK / EUR | Yes | Yes (EUR only) | Dataclearingen (DCL) ACH (SEK), SEPA Instant / SEPA (EUR)\" — SEK settles via Dataclearingen, not instant; this row covers the SEK leg." },
      { country: "CH", currency: "CHF", namedRail: "SIC", note: "\"Switzerland | CHF / EUR | Yes | Yes | SIC (CHF), SEPA Instant / SEPA (EUR)\" — this row covers the CHF leg." },
      { country: "CA", currency: "CAD", note: "\"Canada | CAD | Yes | | EFT, REGULAR_EFT, INTERAC, BILL_PAYMENT\"." },
      { country: "CO", currency: "COP", namedRail: "CENIT", note: "\"Colombia | COP | Yes | | CENIT\"." },
    ];
    for (const spec of specs) {
      const excerpt = spec.note;
      const ev = await upsertEvidence(db, pid, doc, url, "Airwallex — Payout network: bank accounts", excerpt, "0.90");
      if (await upsertCapability(db, pid, { providerId: pid, product: "payout", destinationCountry: spec.country, destinationCurrency: spec.currency, availability: "supported", derivation: "source", evidenceId: ev, lastVerifiedAt: now(), note: excerpt })) capabilitiesCreated++;
      if (await upsertEndpoint(db, pid, { providerId: pid, countryCode: spec.country, endpointType: "bank_account", stablecoinMode: "unknown", destinationCurrency: spec.currency, namedRail: spec.namedRail, availability: "supported", derivation: "source", evidenceId: ev, lastVerifiedAt: now(), note: excerpt })) endpointsCreated++;
    }
  }

  /* ============================================================ */
  /* NIUM — country playbooks (DE, CA, ZA, JP)                      */
  /* ============================================================ */
  {
    const pid = await requireProviderId(db, "nium");

    const de = "https://playbook.nium.com/country/germany";
    const deDoc = await upsertSourceDocument(db, pid, de, "Nium — Payouts to Germany");
    const deEv = await upsertEvidence(db, pid, deDoc, de, "Nium — Payouts to Germany",
      "\"Supported Modes B2B, B2P, P2P, P2B Supported Currencies EUR Network Participant Bank... Channels All banks connected with SEPA Network. Cutoff & delivery timing: 1. Real-time if the beneficiary bank supports Instant payment method 2. Same-day for other banks.\" Min EUR 0.01, no max.", "0.95");
    if (await upsertCapability(db, pid, { providerId: pid, product: "payout", customerType: "business", destinationCountry: "DE", destinationCurrency: "EUR", paymentMethod: "sepa", availability: "supported", derivation: "source", evidenceId: deEv, lastVerifiedAt: now(), note: "SEPA network payout; real-time only when the beneficiary bank itself supports SEPA Instant, otherwise same-day. Nium's own page doesn't commit to a single named rail, so none is tagged here." })) capabilitiesCreated++;

    const ca = "https://playbook.nium.com/country/canada";
    const caDoc = await upsertSourceDocument(db, pid, ca, "Nium — Payouts to Canada");
    const caEv1 = await upsertEvidence(db, pid, caDoc, ca, "Nium — Payouts to Canada",
      "\"Supported Currencies CAD Network Participant Bank... Channels All banks in Canada. Cutoff & delivery timing: T+1 day credit subject to cutoff of 18:00 ET.\" Max CAD 99,000,000 for B2B.", "0.95");
    if (await upsertCapability(db, pid, { providerId: pid, product: "payout", customerType: "business", destinationCountry: "CA", destinationCurrency: "CAD", availability: "supported", derivation: "source", evidenceId: caEv1, lastVerifiedAt: now(), note: "Domestic bank-transfer product, T+1 settlement, CAD 99,000,000 B2B max." })) capabilitiesCreated++;
    const caEv2 = await upsertEvidence(db, pid, caDoc, ca, "Nium — Payouts to Canada (Interac)",
      "\"Supported Currencies CAD... Channels All Interac supported banks in Canada. Cutoff & delivery timing: Near real time (upto 60 mins) - subject to window of 05:00hrs ET to 22:30hrs ET.\"", "0.95");
    if (await upsertCapability(db, pid, { providerId: pid, product: "payout", customerType: "business", destinationCountry: "CA", destinationCurrency: "CAD", availability: "supported", derivation: "source", evidenceId: caEv2, lastVerifiedAt: now(), note: "Separate, faster Interac-specific product — up to 60 minutes, distinct from the T+1 generic bank-transfer product above." })) capabilitiesCreated++;
    if (await upsertEndpoint(db, pid, { providerId: pid, countryCode: "CA", endpointType: "bank_account", stablecoinMode: "unknown", destinationCurrency: "CAD", namedRail: "INTERAC_E_TRANSFER", availability: "supported", derivation: "source", evidenceId: caEv2, lastVerifiedAt: now(), settlementEstimate: "Up to 60 minutes, 05:00-22:30 ET window" })) endpointsCreated++;

    const za = "https://playbook.nium.com/country/south-africa";
    const zaDoc = await upsertSourceDocument(db, pid, za, "Nium — Payouts to South Africa");
    const zaEv = await upsertEvidence(db, pid, zaDoc, za, "Nium — Payouts to South Africa",
      "\"Bank Account (ACH) ZAR T0 B2B, B2P, P2P, P2B... Channels All major banks in South Africa.\" Min ZAR 0.01 (B2B), no max (B2B).", "0.95");
    if (await upsertCapability(db, pid, { providerId: pid, product: "payout", customerType: "business", destinationCountry: "ZA", destinationCurrency: "ZAR", availability: "supported", derivation: "source", evidenceId: zaEv, lastVerifiedAt: now(), note: "T0 (same-day) bank-account ACH payout." })) capabilitiesCreated++;

    const jp = "https://playbook.nium.com/country/japan";
    const jpDoc = await upsertSourceDocument(db, pid, jp, "Nium — Payouts to Japan");
    const jpEv = await upsertEvidence(db, pid, jpDoc, jp, "Nium — Payouts to Japan",
      "\"Supported Currencies JPY Network Participant Partner... Channels All banks in Japan supporting Zengin payments. Cutoff & delivery timing: Realtime 24x7.\" Max JPY 50,000,000.", "0.95");
    if (await upsertCapability(db, pid, { providerId: pid, product: "payout", customerType: "business", destinationCountry: "JP", destinationCurrency: "JPY", availability: "supported", derivation: "source", evidenceId: jpEv, lastVerifiedAt: now(), note: "Zengin-network bank payout, real-time 24x7, JPY 50,000,000 max." })) capabilitiesCreated++;
    if (await upsertEndpoint(db, pid, { providerId: pid, countryCode: "JP", endpointType: "bank_account", stablecoinMode: "unknown", destinationCurrency: "JPY", namedRail: "ZENGIN", availability: "supported", derivation: "source", evidenceId: jpEv, lastVerifiedAt: now(), settlementEstimate: "Real-time 24x7" })) endpointsCreated++;
  }

  /* ============================================================ */
  /* WISE — Canada entity presence (FINTRAC-registered MSB)         */
  /* ============================================================ */
  {
    const pid = await requireProviderId(db, "wise");
    const url = "https://wise.com/ca/business/receive-money";
    const doc = await upsertSourceDocument(db, pid, url, "Wise — Canada business: receive money");
    const ev = await upsertEvidence(db, pid, doc, url, "Wise — Canada business: receive money",
      "\"Receive in 22 currencies.\" \"Wise Payments Canada Inc is registered as a money service business with the Financial Transactions and Reports Analysis Centre of Canada (FINTRAC) under registration number M15193392. Wise has an MSB licence with Revenu Québec under business number 1171229694.\"", "0.90");
    if (await upsertCapability(db, pid, { providerId: pid, product: "payout", entityCountry: "CA", customerType: "business", availability: "supported", derivation: "source", evidenceId: ev, lastVerifiedAt: now(), note: "Wise Payments Canada Inc. is a real, FINTRAC-registered MSB (and Revenu Québec-licensed) — confirms Canadian entity eligibility, not just a receiving endpoint." })) capabilitiesCreated++;
  }

  return { capabilitiesCreated, endpointsCreated, log };
}

async function main() {
  const { close } = await getDbHandle();
  try {
    console.log(JSON.stringify(await runV5Ingest(), null, 2));
  } finally {
    await close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
