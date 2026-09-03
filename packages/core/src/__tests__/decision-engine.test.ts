/**
 * Full Decision Engine pipeline against a throwaway PGlite DB — same
 * isolation rules as engine.test.ts / coverage-gaps.test.ts. Real
 * evaluateProvider/scoreProvider run unmocked against a real seeded
 * provider_routes row; only fetchQuote is faked (a test must never call a
 * live provider endpoint — see adapters.test.ts's own rule), returning a
 * controlled UnifiedQuote so ranking/policy-with-quote behavior is
 * exercised without any network call or real credential.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "railor-decision-engine-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.DATABASE_URL = "";

const {
  getDb,
  getDbHandle,
  ensureMigrated,
  seedDemoData,
  providers,
  providerProducts,
  providerRoutes,
  providerConnections,
  evidence,
  organizations,
} = await import("@railor/database");
const { runDecisionEngine, DECISION_ENGINE_VERSION, hashDecisionInputs } = await import("../decision-engine.js");
const { persistDecision, loadDecision, createPolicy, activatePolicyVersion } = await import("../decision-repository.js");
const { revalidateDecision } = await import("../decision-revalidation.js");
const { PaymentIntent, PolicyRules } = await import("@railor/types");

let organizationId: string;
let providerId: string;
let evidenceId: string;
let routeId: string;

const now = new Date("2026-09-03T00:00:00.000Z");

beforeAll(async () => {
  await ensureMigrated();
  // Reference data only (countries/currencies/assets/blockchains/named
  // rails) — seedDemoData's own 15 fabricated providers are isDemo:true and
  // never interfere with these tests, which insert a real (isDemo:false)
  // provider of their own and assert demo providers are never recommended.
  await seedDemoData();
  const db = await getDb();

  const [org] = await db.insert(organizations).values({ name: "Decision Test Org", slug: "decision-test-org" }).returning();
  organizationId = org!.id;

  const [provider] = await db
    .insert(providers)
    .values({ slug: "circle", name: "Decision Test Provider", isDemo: false, category: "Direct provider", description: "test" })
    .returning();
  providerId = provider!.id;
  await db.insert(providerProducts).values({ providerId, product: "payout", name: "Payouts" });

  const [ev] = await db
    .insert(evidence)
    .values({
      providerId,
      sourceUrl: "https://provider.example/docs",
      sourceTitle: "Provider docs",
      sourceType: "official_docs",
      retrievedAt: now,
      lastVerifiedAt: now,
      confidence: "0.95",
      rawExcerpt: "USDC on Base settles to AED bank accounts in the UAE.",
      rawHash: "test-hash-1",
    })
    .returning();
  evidenceId = ev!.id;

  const [route] = await db
    .insert(providerRoutes)
    .values({
      providerId,
      product: "payout",
      entityCountry: "IN",
      customerType: "business",
      sourceAsset: "USDC",
      sourceNetwork: "base",
      destinationCountry: "AE",
      destinationCurrency: "AED",
      availability: "supported",
      evidenceId,
      lastVerifiedAt: now,
    })
    .returning();
  routeId = route!.id;

  await db.insert(providerConnections).values({ organizationId, providerId, status: "connected", connectedAt: now });
}, 30_000);

afterAll(async () => {
  const { close } = await getDbHandle();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
});

function testIntent(overrides: Partial<import("@railor/types").PaymentIntent> = {}) {
  return PaymentIntent.parse({
    sourceEntityCountry: "IN",
    destinationCountry: "AE",
    destinationCurrency: "AED",
    sourceAsset: "USDC",
    sourceNetwork: "base",
    amount: 1000,
    ...overrides,
  });
}

async function permissivePolicy(rules: Partial<import("@railor/types").PolicyRules> = {}) {
  const { policy, version } = await createPolicy(organizationId, `policy-${crypto.randomUUID()}`, PolicyRules.parse(rules));
  const activated = await activatePolicyVersion(organizationId, policy.id, version.id);
  if (!activated.ok) throw new Error("failed to activate test policy");
  return { policyId: policy.id, policyVersionId: version.id, policyVersionNumber: version.versionNumber, rules: PolicyRules.parse(rules) };
}

const fakeQuote = async () => ({
  providerSlug: "circle",
  sourceAsset: "USDC",
  sourceNetwork: "base",
  destinationCurrency: "AED",
  destinationCountry: "AE",
  amount: 1000,
  recipientAmount: 995,
  feeAmount: 5,
  feeCurrency: "AED",
  costPartial: false,
  quoteType: "live" as const,
  accountContext: "customer_connected" as const,
  verificationType: "provider_reported" as const,
  observedAt: now.toISOString(),
  quotedAt: now.toISOString(),
});

describe("runDecisionEngine — base pipeline", () => {
  it("recommends the real, evidence-backed provider with status allow", async () => {
    const policy = await permissivePolicy();
    const input = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    expect(input.status).toBe("allow");
    expect(input.recommendedProviderSlug).toBe("circle");
    expect(input.certainty).toBe("confirmed");
    expect(input.engineVersion).toBe(DECISION_ENGINE_VERSION);
  });

  it("never recommends a demo provider even if one would otherwise match", async () => {
    const db = await getDb();
    const [demo] = await db
      .insert(providers)
      .values({ slug: "decision-test-demo", name: "Fake Demo Co", isDemo: true, category: "Direct provider", description: "demo" })
      .returning();
    await db.insert(providerProducts).values({ providerId: demo!.id, product: "payout", name: "Payouts" });
    await db.insert(providerRoutes).values({
      providerId: demo!.id,
      product: "payout",
      entityCountry: "IN",
      customerType: "business",
      sourceAsset: "USDC",
      sourceNetwork: "base",
      destinationCountry: "AE",
      destinationCurrency: "AED",
      availability: "supported",
      lastVerifiedAt: now,
    });
    const policy = await permissivePolicy();
    const input = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    expect(input.candidates.some((c) => c.providerSlug === "decision-test-demo")).toBe(false);
  });
});

describe("policy-denied candidate never wins", () => {
  it("a denied provider is excluded from the recommendation even as the only real candidate", async () => {
    const policy = await permissivePolicy({ providerDenylist: ["circle"] });
    const input = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    expect(input.status).toBe("deny");
    expect(input.recommendedProviderId).toBeNull();
    const own = input.candidates.find((c) => c.providerSlug === "circle")!;
    expect(own.selected).toBe(false);
    expect(own.policyEvaluation.result).toBe("fail");
  });
});

describe("live quotes where genuinely available", () => {
  it("fetches a quote only for the connected, policy-surviving candidate and records it on the winner", async () => {
    const policy = await permissivePolicy();
    const input = await runDecisionEngine(testIntent(), policy, { organizationId, now, fetchQuote: fakeQuote });
    const winner = input.candidates.find((c) => c.selected)!;
    expect(winner.quoteSnapshot).not.toBeNull();
    expect(winner.quoteSnapshot!.quoteType).toBe("live");
    expect(input.quoteState).toBe("live");
  });

  it("with no fetchQuote supplied, still produces a full Decision with quoteState none", async () => {
    const policy = await permissivePolicy();
    const input = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    expect(input.status).toBe("allow");
    expect(input.quoteState).toBe("none");
    expect(input.warnings.some((w) => w.includes("no quote fetcher"))).toBe(true);
  });
});

describe("insufficient data", () => {
  it("reports insufficient_data, not a fabricated allow, when the only eligible candidate can't clear an evidence-dependent rule", async () => {
    const policy = await permissivePolicy({ maximumEtaMinutes: 60 }); // provider has no advertised settlement -> unknown, not fail
    const input = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    expect(input.status).toBe("insufficient_data");
    expect(input.recommendedProviderId).toBeNull();
  });
});

describe("approval threshold", () => {
  it("flags approval_required while still computing a recommendation for the approver to see", async () => {
    const policy = await permissivePolicy({ humanApprovalAboveAmount: 100 });
    const input = await runDecisionEngine(testIntent({ amount: 100_000 }), policy, { organizationId, now });
    expect(input.status).toBe("approval_required");
    expect(input.warnings.some((w) => w.includes("human-approval threshold"))).toBe(true);
  });
});

describe("decision hash determinism and replay", () => {
  it("the same inputs at the same policy/engine version always hash identically", async () => {
    const policy = await permissivePolicy();
    const a = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    const b = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    expect(a.decisionHash).toBe(b.decisionHash);
    expect(a.recommendedProviderSlug).toBe(b.recommendedProviderSlug);
  });

  it("changes when the recommended provider changes", async () => {
    const policyA = await permissivePolicy();
    const a = await runDecisionEngine(testIntent(), policyA, { organizationId, now });
    const policyB = await permissivePolicy({ providerDenylist: ["circle"] });
    const b = await runDecisionEngine(testIntent(), policyB, { organizationId, now });
    expect(a.decisionHash).not.toBe(b.decisionHash);
  });

  it("hashDecisionInputs is order-independent over object/array key order", () => {
    const base = {
      organizationId: "org-1",
      intentSnapshot: { a: 1, b: 2 },
      policyId: "p1",
      policyVersionId: "v1",
      policyVersionNumber: 1,
      engineVersion: "1.0.0",
      status: "allow" as const,
      recommendedProviderId: "prov-1",
      recommendedProviderSlug: "circle",
      recommendedRouteId: null,
      certainty: "confirmed" as const,
      rankingConfidence: 1,
      quoteState: "none" as const,
      connectionState: "connected" as const,
      validUntil: null,
      revalidationRequired: false,
      warnings: [],
      explain: {},
      previousDecisionId: null,
      candidates: [],
    };
    const reordered = { ...base, intentSnapshot: { b: 2, a: 1 } };
    expect(hashDecisionInputs(base)).toBe(hashDecisionInputs(reordered));
  });
});

describe("deterministic ranking", () => {
  it("ranking is stable across repeated runs with identical inputs", async () => {
    const policy = await permissivePolicy();
    const runs = await Promise.all([1, 2, 3].map(() => runDecisionEngine(testIntent(), policy, { organizationId, now })));
    const scores = runs.map((r) => r.candidates.find((c) => c.selected)?.providerSlug);
    expect(new Set(scores).size).toBe(1);
  });
});

describe("Decision persistence and tenant isolation", () => {
  it("persists a Decision with its candidates and reads it back", async () => {
    const policy = await permissivePolicy();
    const input = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    const created = await persistDecision(input);
    const loaded = await loadDecision(organizationId, created.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.decision.decisionHash).toBe(input.decisionHash);
    expect(loaded!.candidates.length).toBe(input.candidates.length);
  });

  it("a decision is invisible to a different organization", async () => {
    const db = await getDb();
    const [otherOrg] = await db.insert(organizations).values({ name: "Other Org", slug: `other-org-${crypto.randomUUID()}` }).returning();
    const policy = await permissivePolicy();
    const input = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    const created = await persistDecision(input);

    const wrongOrgRead = await loadDecision(otherOrg!.id, created.id);
    expect(wrongOrgRead).toBeNull();
    const rightOrgRead = await loadDecision(organizationId, created.id);
    expect(rightOrgRead).not.toBeNull();
  });
});

describe("historical Decision immutability + revalidation", () => {
  it("revalidation creates a new linked Decision and never mutates the original", async () => {
    const policy = await permissivePolicy();
    const input = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    const original = await persistDecision(input);
    const originalSnapshotBefore = await loadDecision(organizationId, original.id);

    const result = await revalidateDecision(original.id, { organizationId, trigger: "manual", now, fetchQuote: fakeQuote });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.previousDecisionId).toBe(original.id);
    expect(result.decisionId).not.toBe(original.id);

    const originalSnapshotAfter = await loadDecision(organizationId, original.id);
    expect(originalSnapshotAfter!.decision.decisionHash).toBe(originalSnapshotBefore!.decision.decisionHash);
    expect(originalSnapshotAfter!.decision.recommendedProviderSlug).toBe(originalSnapshotBefore!.decision.recommendedProviderSlug);
    // revalidationRequired is the one allowed flag flip — a signal, not a rewrite of the recorded explanation.
    expect(originalSnapshotAfter!.decision.revalidationRequired).toBe(true);

    const newDecision = await loadDecision(organizationId, result.decisionId);
    expect(newDecision!.decision.previousDecisionId).toBe(original.id);
  });

  it("records a recommendation_changed event only when the winner actually changes", async () => {
    const { loadDecisionEvents } = await import("../decision-repository.js");
    const policy = await permissivePolicy();
    const input = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    const original = await persistDecision(input);

    // Same policy, same data -> no change expected.
    const same = await revalidateDecision(original.id, { organizationId, trigger: "manual", now });
    expect(same.ok).toBe(true);
    if (same.ok) expect(same.recommendationChanged).toBe(false);

    // Denying the only real provider forces a recommendation change (allow -> deny).
    const changedPolicy = await permissivePolicy({ providerDenylist: ["circle"] });
    const changed = await revalidateDecision(original.id, {
      organizationId,
      trigger: "policy_changed",
      now,
      policyOverride: changedPolicy,
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.recommendationChanged).toBe(true);

    const events = await loadDecisionEvents(organizationId, changed.decisionId);
    expect(events!.some((e) => e.kind === "recommendation_changed")).toBe(true);
    const revalidationEvents = await loadDecisionEvents(organizationId, original.id);
    expect(revalidationEvents!.filter((e) => e.kind === "revalidation_requested").length).toBeGreaterThanOrEqual(2);
  });

  it("quote_expired, evidence_changed and provider_incident triggers all produce a real, linked revalidation", async () => {
    const policy = await permissivePolicy();
    const input = await runDecisionEngine(testIntent(), policy, { organizationId, now });
    const original = await persistDecision(input);

    for (const trigger of ["quote_expired", "evidence_changed", "provider_incident"] as const) {
      const result = await revalidateDecision(original.id, { organizationId, trigger, now });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.previousDecisionId).toBe(original.id);
    }
  });
});
