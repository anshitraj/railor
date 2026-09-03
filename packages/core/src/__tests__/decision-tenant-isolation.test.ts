/**
 * Explicit negative tests: organization A must never be able to read or
 * update organization B's Policy, PolicyVersion, Decision, DecisionCandidate
 * or DecisionEvent. No Postgres RLS exists in this codebase (see the current
 * state audit) — isolation is enforced entirely by every decision-repository.ts
 * function filtering on organizationId, so these tests exist specifically to
 * catch a regression where a future query forgets that filter.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "railor-tenant-isolation-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.DATABASE_URL = "";

const { getDb, getDbHandle, ensureMigrated, seedDemoData, providers, providerProducts, providerRoutes, organizations } = await import("@railor/database");
const { runDecisionEngine } = await import("../decision-engine.js");
const {
  persistDecision,
  loadDecision,
  loadDecisionEvents,
  appendDecisionEvent,
  createPolicy,
  createPolicyVersion,
  getPolicy,
  getPolicyVersion,
  activatePolicyVersion,
  listPolicies,
  listPolicyVersions,
} = await import("../decision-repository.js");
const { PaymentIntent, PolicyRules } = await import("@railor/types");

let orgA: string;
let orgB: string;
let providerId: string;
const now = new Date("2026-09-03T00:00:00.000Z");

beforeAll(async () => {
  await ensureMigrated();
  await seedDemoData(); // reference data (countries/currencies/assets/blockchains) only.
  const db = await getDb();
  const [a] = await db.insert(organizations).values({ name: "Org A", slug: `org-a-${crypto.randomUUID()}` }).returning();
  const [b] = await db.insert(organizations).values({ name: "Org B", slug: `org-b-${crypto.randomUUID()}` }).returning();
  orgA = a!.id;
  orgB = b!.id;

  const [provider] = await db
    .insert(providers)
    .values({ slug: "tenant-isolation-provider", name: "Tenant Isolation Provider", isDemo: false, category: "Direct provider", description: "test" })
    .returning();
  providerId = provider!.id;
  await db.insert(providerProducts).values({ providerId, product: "payout", name: "Payouts" });
  await db.insert(providerRoutes).values({
    providerId,
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
}, 30_000);

afterAll(async () => {
  const { close } = await getDbHandle();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
});

function intent() {
  return PaymentIntent.parse({
    sourceEntityCountry: "IN",
    destinationCountry: "AE",
    destinationCurrency: "AED",
    sourceAsset: "USDC",
    sourceNetwork: "base",
    amount: 1000,
  });
}

describe("Policy tenant isolation", () => {
  it("org B cannot read org A's policy", async () => {
    const { policy } = await createPolicy(orgA, "org-a-policy", PolicyRules.parse({}));
    expect(await getPolicy(orgA, policy.id)).not.toBeNull();
    expect(await getPolicy(orgB, policy.id)).toBeNull();
  });

  it("org B's policy list never includes org A's policies", async () => {
    await createPolicy(orgA, "org-a-only-policy", PolicyRules.parse({}));
    const listA = await listPolicies(orgA);
    const listB = await listPolicies(orgB);
    expect(listA.some((p) => p.name === "org-a-only-policy")).toBe(true);
    expect(listB.some((p) => p.name === "org-a-only-policy")).toBe(false);
  });

  it("org B cannot create a new version under org A's policy id (returns null, not another org's row)", async () => {
    const { policy } = await createPolicy(orgA, "org-a-policy-2", PolicyRules.parse({}));
    const result = await createPolicyVersion(orgB, policy.id, PolicyRules.parse({}));
    expect(result).toBeNull();
  });

  it("org B cannot activate a version of org A's policy", async () => {
    const { policy, version } = await createPolicy(orgA, "org-a-policy-3", PolicyRules.parse({}));
    const result = await activatePolicyVersion(orgB, policy.id, version.id);
    expect(result.ok).toBe(false);
  });
});

describe("PolicyVersion tenant isolation", () => {
  it("org B cannot read org A's policy version by id", async () => {
    const { version } = await createPolicy(orgA, "org-a-policy-4", PolicyRules.parse({}));
    expect(await getPolicyVersion(orgA, version.id)).not.toBeNull();
    expect(await getPolicyVersion(orgB, version.id)).toBeNull();
  });

  it("org B's version list for org A's policy id is empty", async () => {
    const { policy } = await createPolicy(orgA, "org-a-policy-5", PolicyRules.parse({}));
    const versionsForB = await listPolicyVersions(orgB, policy.id);
    expect(versionsForB).toHaveLength(0);
  });
});

describe("Decision, DecisionCandidate and DecisionEvent tenant isolation", () => {
  it("org B cannot load org A's Decision or its candidates", async () => {
    const { policy, version } = await createPolicy(orgA, "org-a-decision-policy", PolicyRules.parse({}));
    await activatePolicyVersion(orgA, policy.id, version.id);
    const input = await runDecisionEngine(
      intent(),
      { policyId: policy.id, policyVersionId: version.id, policyVersionNumber: version.versionNumber, rules: PolicyRules.parse({}) },
      { organizationId: orgA, now },
    );
    const created = await persistDecision(input);

    const ownRead = await loadDecision(orgA, created.id);
    expect(ownRead).not.toBeNull();
    expect(ownRead!.candidates.length).toBeGreaterThan(0);

    const crossRead = await loadDecision(orgB, created.id);
    expect(crossRead).toBeNull();
  });

  it("org B cannot read org A's Decision events, even knowing the real decision id", async () => {
    const { policy, version } = await createPolicy(orgA, "org-a-decision-policy-2", PolicyRules.parse({}));
    await activatePolicyVersion(orgA, policy.id, version.id);
    const input = await runDecisionEngine(
      intent(),
      { policyId: policy.id, policyVersionId: version.id, policyVersionNumber: version.versionNumber, rules: PolicyRules.parse({}) },
      { organizationId: orgA, now },
    );
    const created = await persistDecision(input);

    const eventsForA = await loadDecisionEvents(orgA, created.id);
    expect(eventsForA).not.toBeNull();
    expect(eventsForA!.length).toBeGreaterThan(0); // at least the "created" event.

    const eventsForB = await loadDecisionEvents(orgB, created.id);
    expect(eventsForB).toBeNull();
  });

  it("org B cannot append an event onto org A's Decision", async () => {
    const { policy, version } = await createPolicy(orgA, "org-a-decision-policy-3", PolicyRules.parse({}));
    await activatePolicyVersion(orgA, policy.id, version.id);
    const input = await runDecisionEngine(
      intent(),
      { policyId: policy.id, policyVersionId: version.id, policyVersionNumber: version.versionNumber, rules: PolicyRules.parse({}) },
      { organizationId: orgA, now },
    );
    const created = await persistDecision(input);

    const attempt = await appendDecisionEvent(orgB, created.id, "revalidation_requested", "attempted cross-tenant write");
    expect(attempt).toBeNull();

    const realEvents = await loadDecisionEvents(orgA, created.id);
    expect(realEvents!.some((e) => e.detail === "attempted cross-tenant write")).toBe(false);
  });
});
