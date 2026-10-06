import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "railor-platform-reference-"));
process.env.PGLITE_DATA_DIR = dir;
process.env.DATABASE_URL = "";
const { getDb, getDbHandle, ensureMigrated, seedDemoData, providers, providerProducts, providerRoutes, evidence, organizations } = await import("@railor/database");
const { searchPreview } = await import("../search-preview.js");
const { createPolicy, activatePolicyVersion } = await import("../decision-repository.js");
const { PaymentIntent, PolicyRules } = await import("@railor/types");
const now = new Date("2026-09-03T00:00:00Z");
let organizationId: string;
beforeAll(async () => {
  await ensureMigrated(); await seedDemoData(); const db = await getDb();
  const [org] = await db.insert(organizations).values({ name: "Platform reference test", slug: "platform-test" }).returning(); organizationId = org!.id;
  const [p] = await db.insert(providers).values({ slug: "airwallex", name: "Synthetic Reference Provider", isDemo: false, category: "Direct provider", description: "Synthetic test only" }).returning();
  const [ev] = await db.insert(evidence).values({ providerId: p!.id, sourceUrl: "https://reference.example/test", sourceTitle: "Synthetic fiat route fixture", sourceType: "official_docs", retrievedAt: now, lastVerifiedAt: now, confidence: "0.95", rawHash: "reference-test" }).returning();
  await db.insert(providerProducts).values({ providerId: p!.id, product: "payout", name: "Payouts" });
  await db.insert(providerRoutes).values({ providerId: p!.id, product: "payout", entityCountry: "IN", customerType: "business", sourceCurrency: "USD", destinationCountry: "IN", destinationCurrency: "INR", availability: "supported", evidenceId: ev!.id, lastVerifiedAt: now });
}, 30000);
afterAll(async () => { const { close } = await getDbHandle(); await close(); rmSync(dir, { recursive: true, force: true }); });
async function policy(rules: Partial<import("@railor/types").PolicyRules> = {}) {
  const p = await createPolicy(organizationId, crypto.randomUUID(), PolicyRules.parse(rules));
  await activatePolicyVersion(organizationId, p.policy.id, p.version.id);
  return { policyId: p.policy.id, policyVersionId: p.version.id, policyVersionNumber: p.version.versionNumber, rules: PolicyRules.parse(rules) };
}
const intent = (preference: "balanced" | "cheapest" = "balanced") => PaymentIntent.parse({ sourceEntityCountry: "IN", sourceCurrency: "USD", destinationCountry: "IN", destinationCurrency: "INR", amount: 1000, preference });
const fetchQuote = vi.fn(async (_slug: string, _id: string, request: import("../unified.js").QuoteRequest) => ({ ...request, providerSlug: "airwallex", recipientAmount: 90000, costPartial: true, quoteType: "indicative" as const, accountContext: "railor_network" as const, verificationType: "provider_reported" as const, observedAt: now.toISOString(), quotedAt: now.toISOString() }));

describe("Railor-owned reference quote authorization", () => {
  it("requires an explicit reference-provider allowlist and leaves the customer unconnected", async () => {
    const active = await policy(); fetchQuote.mockClear();
    await searchPreview(intent(), active, { organizationId, now, fetchQuote }); expect(fetchQuote).not.toHaveBeenCalled();
    const preview = await searchPreview(intent(), active, { organizationId, now, fetchQuote, referenceQuoteProviders: ["airwallex"] });
    expect(fetchQuote).toHaveBeenCalledOnce();
    expect(preview.candidates.find(c => c.providerSlug === "airwallex")).toMatchObject({ quoteState: "INDICATIVE", quoteAccountContext: "railor_network", connectionState: "not_connected", costCompleteness: "unknown" });
    expect(preview.executionState).toBe("NOT_INITIATED");
  });
  it("cannot satisfy a live-customer-quote policy or win cheapest with reference FX prices", async () => {
    const live = await searchPreview(intent(), await policy({ requireLiveQuote: true }), { organizationId, now, fetchQuote, referenceQuoteProviders: ["airwallex"] });
    expect(live.candidates.find(c => c.providerSlug === "airwallex")?.policyPreview).toBe("fail"); expect(live.bestCandidate).toBeNull();
    const cheapest = await searchPreview(intent("cheapest"), await policy(), { organizationId, now, fetchQuote, referenceQuoteProviders: ["airwallex"] });
    expect(cheapest.bestCandidate).toBeNull();
  });
  it("never calls a platform provider blocked by policy", async () => {
    fetchQuote.mockClear();
    await searchPreview(intent(), await policy({ providerDenylist: ["airwallex"] }), { organizationId, now, fetchQuote, referenceQuoteProviders: ["airwallex"] });
    expect(fetchQuote).not.toHaveBeenCalled();
  });
});
