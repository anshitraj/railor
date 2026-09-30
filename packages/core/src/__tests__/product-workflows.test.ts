import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
const dir = mkdtempSync(join(tmpdir(), "railor-workflows-test-"));
process.env.PGLITE_DATA_DIR = dir; process.env.DATABASE_URL = "";
const database = await import("@railor/database");
const { getDb, ensureMigrated, seedDemoData, organizations, users, organizationMembers, providers, providerProducts, providerRoutes, evidence, decisionApprovals } = database;
const { PaymentIntent, PolicyRules } = await import("@railor/types");
const { createPolicy, activatePolicyVersion, createPolicyVersion, persistDecision, loadDecision } = await import("../decision-repository.js");
const { runDecisionEngine } = await import("../decision-engine.js");
const { reviewApproval, decisionAuthorization, listDecisions } = await import("../product-control.js");
const { registerConnector, revokeConnector, queueConnectorSimulation, claimConnectorJob, completeConnectorJob, authenticateConnector, loadConnectorQuote } = await import("../connectors.js");
const { saveDiscoveryReviews, reviewDiscovery, listDiscoveryReviews } = await import("../discovery-review.js");
const { monitorDecisions } = await import("../decision-monitor.js");
let org: string, otherOrg: string, requester: string, reviewer: string, viewer: string;
const intent = PaymentIntent.parse({ sourceEntityCountry: "IN", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED", amount: 1000 });
beforeAll(async () => {
  await ensureMigrated(); await seedDemoData(); const db = await getDb();
  const orgs = await db.insert(organizations).values([{ name: "Workflow", slug: "workflow" }, { name: "Other", slug: "workflow-other" }]).returning();
  org = orgs[0]!.id; otherOrg = orgs[1]!.id;
  const actors = await db.insert(users).values([{ email: "requester@example.test" }, { email: "reviewer@example.test" }, { email: "viewer@example.test" }]).returning();
  requester = actors[0]!.id; reviewer = actors[1]!.id; viewer = actors[2]!.id;
  await db.insert(organizationMembers).values([{ organizationId: org, userId: requester, role: "owner" }, { organizationId: org, userId: reviewer, role: "admin" }, { organizationId: org, userId: viewer, role: "viewer" }, { organizationId: otherOrg, userId: reviewer, role: "admin" }]);
  const [provider] = await db.insert(providers).values({ slug: "circle", name: "Workflow fixture", category: "Direct provider", description: "Isolated test fixture", isDemo: false }).returning();
  await db.insert(providerProducts).values({ providerId: provider!.id, product: "payout", name: "Payouts" });
  const [source] = await db.insert(evidence).values({ providerId: provider!.id, sourceUrl: "https://example.test/route", sourceTitle: "Fixture route evidence", sourceType: "official_docs", retrievedAt: new Date(), lastVerifiedAt: new Date(), confidence: "0.95", rawExcerpt: "Fixture route", rawHash: "fixture" }).returning();
  await db.insert(providerRoutes).values({ providerId: provider!.id, product: "payout", entityCountry: "IN", customerType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED", availability: "supported", evidenceId: source!.id, lastVerifiedAt: new Date() });
}, 30000);
afterAll(async () => { await (await database.getDbHandle()).close(); rmSync(dir, { recursive: true, force: true }); });

async function decision(approval = false) {
  const rules = PolicyRules.parse(approval ? { humanApprovalAboveAmount: 500 } : {});
  const p = await createPolicy(org, `test-${crypto.randomUUID()}`, rules);
  await activatePolicyVersion(org, p.policy.id, p.version.id);
  const input = await runDecisionEngine(intent, { policyId: p.policy.id, policyVersionId: p.version.id, policyVersionNumber: 1, rules }, { organizationId: org, mode: "enforce", proposedExecutor: { provider: "circle" }, createdBy: requester });
  const saved = await persistDecision(input);
  return { saved, policy: p.policy, version: p.version };
}
async function approvalFor(id: string) { const [a] = await (await getDb()).select().from(decisionApprovals).where(eq(decisionApprovals.decisionId, id)); return a!; }

describe("approval control", () => {
  it("enforces tenant scope, role and separation of duties", async () => {
    const { saved } = await decision(true); const a = await approvalFor(saved.id);
    expect(a.status).toBe("pending"); expect((await decisionAuthorization(org, saved.id)).authorized).toBe(false);
    const request = { id: a.id, action: "approve", comment: "Reviewed exact payment" };
    await expect(reviewApproval(org, requester, request)).rejects.toThrow("self_approval_forbidden");
    await expect(reviewApproval(org, viewer, request)).rejects.toThrow("forbidden");
    await expect(reviewApproval(otherOrg, reviewer, request)).rejects.toThrow("approval_not_found");
    await reviewApproval(org, reviewer, request);
    expect((await decisionAuthorization(org, saved.id)).authorized).toBe(true);
    await expect(reviewApproval(org, reviewer, request)).rejects.toThrow("approval_already_resolved");
    await reviewApproval(org, reviewer, { ...request, action: "revoke" });
    expect((await decisionAuthorization(org, saved.id)).authorized).toBe(false);
  });
  it("expired requests and changed policies cannot authorize", async () => {
    const { saved, policy } = await decision(true); const a = await approvalFor(saved.id);
    await (await getDb()).update(decisionApprovals).set({ expiresAt: new Date(0) }).where(eq(decisionApprovals.id, a.id));
    await expect(reviewApproval(org, reviewer, { id: a.id, action: "approve", comment: "Review" })).rejects.toThrow("approval_expired");
    const next = await createPolicyVersion(org, policy.id, PolicyRules.parse({ providerDenylist: ["circle"] }));
    await activatePolicyVersion(org, policy.id, next!.id);
    expect((await decisionAuthorization(org, saved.id)).reason).toBe("policy_changed");
    expect(await loadDecision(otherOrg, saved.id)).toBeNull(); expect(await listDecisions(otherOrg)).toEqual([]);
  });
  it("rejection is final and never mutates historical decision outcome", async () => {
    const { saved } = await decision(true); const a = await approvalFor(saved.id);
    await reviewApproval(org, reviewer, { id: a.id, action: "reject", comment: "Missing business justification" });
    expect((await loadDecision(org, saved.id))?.decision.status).toBe("approval_required");
    expect((await decisionAuthorization(org, saved.id)).authorized).toBe(false);
  });
});

describe("customer Connector sandbox", () => {
  it("accepts only scoped quote receipts and makes private quotes available to revalidation", async () => {
    const { saved, policy } = await decision(); const install = await registerConnector(org, requester, "Quote runtime");
    const job = await queueConnectorSimulation(org, requester, { installationId: install.id, decisionId: saved.id, idempotencyKey: "quote-receipt-01", operation: "get_quote" });
    expect((await claimConnectorJob(install.token))?.command.operation).toBe("get_quote");
    const observedAt = new Date().toISOString();
    const quote = { providerSlug: "circle", sourceAsset: "USDC", sourceNetwork: "base", destinationCurrency: "AED", destinationCountry: "AE", amount: 1000, feeAmount: 5, feeCurrency: "USDC", costPartial: false, quoteType: "live", accountContext: "customer_connected", verificationType: "provider_reported", observedAt, quotedAt: observedAt, expiresAt: new Date(Date.now() + 60000).toISOString() };
    await expect(completeConnectorJob(install.token, { jobId: job.id, status: "succeeded", code: "quoted", quote: { ...quote, amount: 1 } })).rejects.toThrow("quote_scope_mismatch");
    await completeConnectorJob(install.token, { jobId: job.id, status: "succeeded", code: "quoted", quote });
    const request = { sourceAsset: "USDC", sourceNetwork: "base", destinationCurrency: "AED", destinationCountry: "AE", amount: 1000, entityCountry: "IN" };
    expect(await loadConnectorQuote(otherOrg, "circle", request)).toBeNull();
    expect(await loadConnectorQuote(org, "circle", { ...request, amount: 1 })).toBeNull();
    expect((await loadConnectorQuote(org, "circle", request))?.feeAmount).toBe(5);
    const rules = PolicyRules.parse({ requireLiveQuote: true, requireCustomerConnectedProvider: true });
    const next = await createPolicyVersion(org, policy.id, rules); await activatePolicyVersion(org, policy.id, next!.id);
    const evaluated = await runDecisionEngine(intent, { policyId: policy.id, policyVersionId: next!.id, policyVersionNumber: next!.versionNumber, rules }, { organizationId: org, mode: "enforce", proposedExecutor: { provider: "circle" }, fetchQuote: (slug, _id, req) => loadConnectorQuote(org, slug, req) });
    expect(evaluated.status).toBe("allow"); expect(evaluated.quoteState).toBe("live");
    await revokeConnector(org, requester, install.id);
    expect(await loadConnectorQuote(org, "circle", request)).toBeNull();
  });
  it("claims at most once, deduplicates retries and requires identical receipts", async () => {
    const { saved } = await decision(); const install = await registerConnector(org, requester, "Test runtime");
    const input = { installationId: install.id, decisionId: saved.id, idempotencyKey: "test-dispatch-01" };
    const job = await queueConnectorSimulation(org, requester, input);
    expect(await queueConnectorSimulation(org, requester, input)).toEqual(job);
    await expect(queueConnectorSimulation(org, requester, { ...input, decisionId: crypto.randomUUID() })).rejects.toThrow("idempotency_conflict");
    const claims = await Promise.all([claimConnectorJob(install.token), claimConnectorJob(install.token)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)?.command.operation).toBe("simulate_transfer");
    const receipt = { jobId: job.id, status: "succeeded", code: "simulated", reference: "sim_1" };
    await completeConnectorJob(install.token, receipt); await completeConnectorJob(install.token, receipt);
    await expect(completeConnectorJob(install.token, { ...receipt, reference: "different" })).rejects.toThrow("receipt_conflict");
    await revokeConnector(org, requester, install.id);
    await expect(authenticateConnector(install.token)).rejects.toThrow("invalid_connector_token");
  });
  it("cannot bypass approvals, use another tenant installation, or replay a decision", async () => {
    const { saved } = await decision(true); const install = await registerConnector(otherOrg, reviewer, "Other runtime");
    await expect(queueConnectorSimulation(org, requester, { installationId: install.id, decisionId: saved.id, idempotencyKey: "blocked-approval" })).rejects.toThrow("approval_required");
    const allowed = await decision();
    await expect(queueConnectorSimulation(org, requester, { installationId: install.id, decisionId: allowed.saved.id, idempotencyKey: "blocked-tenant" })).rejects.toThrow("connector_not_found");
    await expect(registerConnector(org, viewer, "Viewer runtime")).rejects.toThrow("forbidden");
  });
  it("rechecks policy between enqueue and claim", async () => {
    const { saved, policy } = await decision(); const install = await registerConnector(org, requester, "Revoked policy");
    await queueConnectorSimulation(org, requester, { installationId: install.id, decisionId: saved.id, idempotencyKey: "policy-changed" });
    const next = await createPolicyVersion(org, policy.id, PolicyRules.parse({ providerDenylist: ["circle"] })); await activatePolicyVersion(org, policy.id, next!.id);
    expect(await claimConnectorJob(install.token)).toBeNull();
  });
});

describe("discovery review and monitoring", () => {
  it("deduplicates cached discoveries and never promotes tenant review into eligibility", async () => {
    const result = { status: "complete" as const, triggerReason: "test", generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), recommendation: null, warnings: [], candidates: [{ name: "Lead", category: "provider" as const, routeSummary: "Unverified claim", pricingSummary: null, feePercent: null, speedSummary: null, whyConsider: [], limitations: [], confidence: 0.5, status: "research_required" as const, sources: [] }] };
    await saveDiscoveryReviews(org, { customerType: "business" }, result); await saveDiscoveryReviews(org, { customerType: "business" }, result);
    const rows = await listDiscoveryReviews(org); expect(rows).toHaveLength(1); expect(await listDiscoveryReviews(otherOrg)).toEqual([]);
    await expect(reviewDiscovery(org, viewer, { id: rows[0]!.id, status: "investigate", comment: "Check" })).rejects.toThrow("forbidden");
    await reviewDiscovery(org, reviewer, { id: rows[0]!.id, status: "investigate", comment: "Confirm with provider before publishing" });
    expect((await listDiscoveryReviews(org))[0]?.status).toBe("investigate");
  });
  it("creates a linked decision on changed policy without carrying approvals forward", async () => {
    const { saved, policy } = await decision(true);
    const next = await createPolicyVersion(org, policy.id, PolicyRules.parse({ providerDenylist: ["circle"] })); await activatePolicyVersion(org, policy.id, next!.id);
    const summary = await monitorDecisions({ organizationId: org, limit: 100 });
    expect(summary.failed).toBe(0); expect(summary.changed).toBeGreaterThan(0);
    expect((await loadDecision(org, saved.id))?.decision.revalidationRequired).toBe(true);
    const rows = await listDecisions(org, { limit: 100 });
    expect(rows.find((d) => d.previousDecisionId === saved.id)?.status).toBe("deny");
    const repeated = await monitorDecisions({ organizationId: org, limit: 100 });
    expect(repeated.changed).toBe(0);
  });
});
