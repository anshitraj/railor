import { generateKeyPairSync, createHash, createSign, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const dir = mkdtempSync(join(tmpdir(), "railor-payments-test-"));
process.env.PGLITE_DATA_DIR = dir;
process.env.DATABASE_URL = "";
process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.RAILOR_LIVE_PAYMENTS;

const database = await import("@railor/database");
const { getDb, ensureMigrated, seedDemoData, organizations, users, organizationMembers, providers, providerProducts, providerRoutes, evidence, decisionApprovals, paymentAttempts, webhookDeliveries } = database;
const { PolicyRules } = await import("@railor/types");
const { createPolicy, activatePolicyVersion } = await import("../decision-repository.js");
const { reviewApproval } = await import("../product-control.js");
const payments = await import("../payments/index.js");
const { scoreRoute, sandboxPayoutAdapter, bridgePayoutAdapter, signWebhookPayload, verifyWebhookSignature, validateWebhookUrl } = payments;

const intent = { sourceEntityCountry: "IN", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED", amount: 1000 };
const UAE_IBAN = "AE070331234567890123456";
let org: string;
let owner: string;
let reviewer: string;
let beneficiaryId: string;
const actor = () => ({ userId: owner, source: "user" as const, role: "owner" });

async function activePolicy(rules: Record<string, unknown> = {}) {
  const parsed = PolicyRules.parse(rules);
  const p = await createPolicy(org, `payments-${crypto.randomUUID()}`, parsed);
  await activatePolicyVersion(org, p.policy.id, p.version.id);
}

beforeAll(async () => {
  await ensureMigrated();
  await seedDemoData();
  const db = await getDb();
  const [o] = await db.insert(organizations).values({ name: "Payments", slug: "payments-test", entityCountry: "IN" }).returning();
  org = o!.id;
  const people = await db.insert(users).values([{ email: "owner@pay.test" }, { email: "reviewer@pay.test" }]).returning();
  owner = people[0]!.id;
  reviewer = people[1]!.id;
  await db.insert(organizationMembers).values([
    { organizationId: org, userId: owner, role: "owner" },
    { organizationId: org, userId: reviewer, role: "admin" },
  ]);
  for (const slug of ["bridge", "circle"]) {
    const [provider] = await db.insert(providers).values({ slug, name: `${slug} fixture`, category: "Direct provider", description: "Payments test fixture", isDemo: false }).returning();
    await db.insert(providerProducts).values({ providerId: provider!.id, product: "payout", name: "Payouts" });
    const [source] = await db
      .insert(evidence)
      .values({ providerId: provider!.id, sourceUrl: `https://example.test/${slug}`, sourceTitle: "Fixture", sourceType: "official_docs", retrievedAt: new Date(), lastVerifiedAt: new Date(), confidence: "0.95", rawExcerpt: "Fixture", rawHash: slug })
      .returning();
    await db.insert(providerRoutes).values({ providerId: provider!.id, product: "payout", entityCountry: "IN", customerType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED", availability: "supported", evidenceId: source!.id, lastVerifiedAt: new Date() });
  }
  await activePolicy();
  const created = await payments.createBeneficiary(org, owner, { holderType: "business", holderName: "Dubai Supplier LLC", country: "AE", currency: "AED", method: "iban", details: { iban: UAE_IBAN, bankName: "Emirates Test Bank" } });
  beneficiaryId = created.beneficiary.id;
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.RAILOR_LIVE_PAYMENTS;
});

afterAll(async () => {
  await (await database.getDbHandle()).close();
  rmSync(dir, { recursive: true, force: true });
});

describe("routing", () => {
  const base = {
    eligible: true,
    executor: { kind: "railor_sandbox" as const },
    quote: null,
    healthOkRatio: null,
    activeIncident: false,
    observedSuccessRate: null,
    observedAttempts: 0,
    advertisedEtaMinutes: null,
    limitStatus: "unknown" as const,
    preferenceRank: null,
    preferenceCount: 0,
    blocked: false,
  };
  it("never ranks an ineligible, blocked or unexecutable provider, whatever it costs", () => {
    const plan = scoreRoute(
      [
        { ...base, providerSlug: "cheap-but-ineligible", providerName: "A", eligible: false, exclusionReason: "Policy rejected", quote: { feeBps: 1, etaMinutes: 1, recipientAmount: null, quoteType: "live" } },
        { ...base, providerSlug: "blocked", providerName: "B", blocked: true },
        { ...base, providerSlug: "unreachable", providerName: "C", executor: null, executorNote: "Connect it" },
        { ...base, providerSlug: "ok", providerName: "D", healthOkRatio: 0.5 },
      ],
      { mode: "test", preset: "balanced" },
    );
    expect(plan.candidates.map((c) => c.providerSlug)).toEqual(["ok"]);
    expect(plan.excluded.map((e) => e.reason)).toEqual(["Policy rejected", "Blocked in your routing settings.", "Connect it"]);
  });
  it("scores only known dimensions and reports that as confidence", () => {
    const plan = scoreRoute(
      [
        { ...base, providerSlug: "fast", providerName: "Fast", healthOkRatio: 1, quote: { feeBps: 80, etaMinutes: 5, recipientAmount: null, quoteType: "live" } },
        { ...base, providerSlug: "cheap", providerName: "Cheap", healthOkRatio: 1, quote: { feeBps: 20, etaMinutes: 600, recipientAmount: null, quoteType: "live" } },
      ],
      { mode: "test", preset: "cheapest" },
    );
    expect(plan.candidates[0]!.providerSlug).toBe("cheap");
    // health 10 + cost 55 + speed 5 known out of 100
    expect(plan.candidates[0]!.confidence).toBe(0.7);
    expect(scoreRoute(plan.candidates.map(() => ({ ...base, providerSlug: "x", providerName: "x" })), { mode: "test", preset: "balanced" }).candidates[0]!.confidence).toBe(0);
  });
  it("an active incident zeroes health instead of being ignored", () => {
    const plan = scoreRoute([{ ...base, providerSlug: "down", providerName: "Down", healthOkRatio: 1, activeIncident: true }], { mode: "test", preset: "balanced" });
    expect(plan.candidates[0]!.dimensions.health.score).toBe(0);
  });
});

describe("sandbox rail", () => {
  const request = (amount: string) => ({
    paymentId: "p",
    attemptNumber: 1,
    idempotencyKey: crypto.randomUUID(),
    amount,
    sourceCurrency: "USDC",
    destinationCurrency: "AED",
    destinationCountry: "AE",
    beneficiary: { id: crypto.randomUUID(), holderType: "business" as const, holderName: "x", country: "AE", currency: "AED", method: "iban" as const, network: null, details: {} },
    environment: "sandbox" as const,
  });
  it("tells the story encoded in the cents", async () => {
    expect((await sandboxPayoutAdapter.createPayout({}, request("10.13"))).kind).toBe("rejected");
    const compliance = await sandboxPayoutAdapter.createPayout({}, request("10.66"));
    expect(compliance.kind === "rejected" && compliance.retryableElsewhere).toBe(false);
    expect((await sandboxPayoutAdapter.createPayout({}, request("10.99"))).kind).toBe("unknown");
    const ok = await sandboxPayoutAdapter.createPayout({}, request("10.00"));
    expect(ok.kind === "accepted" && ok.status).toBe("processing");
  });
  it("progresses to completed purely from the reference", async () => {
    const ok = await sandboxPayoutAdapter.createPayout({}, request("10.00"));
    if (ok.kind !== "accepted") throw new Error("expected acceptance");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    const status = await sandboxPayoutAdapter.getPayout({}, { providerReference: ok.providerReference, idempotencyKey: "x", environment: "sandbox", createdAt: new Date() });
    expect(status.status).toBe("completed");
  });
});

describe("Bridge adapter", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const sign = (t: string, body: string) => {
    const digest = createHash("sha256").update(`${t}.${body}`).digest();
    const signer = createSign("RSA-SHA256");
    signer.update(digest);
    return signer.sign(privateKey, "base64");
  };
  it("verifies Bridge's RSA-SHA256 signature over the digest and rejects stale or forged events", () => {
    const body = JSON.stringify({ event_id: "wh_1", event_category: "transfer", event_object_id: "tr_1", event_object_status: "payment_processed" });
    const t = String(Date.now());
    const good = new Headers({ "x-webhook-signature": `t=${t},v0=${sign(t, body)}` });
    expect(bridgePayoutAdapter.verifyWebhook!({ webhookPublicKey: pem }, good, body)).toBe(true);
    expect(bridgePayoutAdapter.verifyWebhook!({ webhookPublicKey: pem }, good, body.replace("processed", "submitted"))).toBe(false);
    const old = String(Date.now() - 11 * 60_000);
    expect(bridgePayoutAdapter.verifyWebhook!({ webhookPublicKey: pem }, new Headers({ "x-webhook-signature": `t=${old},v0=${sign(old, body)}` }), body)).toBe(false);
    expect(bridgePayoutAdapter.parseWebhook!(body)).toEqual({ eventId: "wh_1", providerReference: "tr_1", providerStatus: "payment_processed", status: "completed" });
  });
  it("classifies provider responses: accepted, compliance rejection, and ambiguous failures", async () => {
    const creds = { apiKey: "k", customerId: "cust" };
    const req = {
      paymentId: "pay",
      attemptNumber: 1,
      idempotencyKey: crypto.randomUUID(),
      amount: "100",
      sourceCurrency: "USDC",
      sourceNetwork: "base",
      destinationCurrency: "USDC",
      destinationCountry: "AE",
      beneficiary: { id: "b", holderType: "business" as const, holderName: "x", country: "AE", currency: "USDC", method: "crypto_address" as const, network: "base", details: { address: "0x0000000000000000000000000000000000000001" } },
      environment: "sandbox" as const,
    };
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const respond = (status: number, body: unknown) =>
      vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(body), { status });
      }));
    respond(201, { id: "tr_9", state: "awaiting_funds", source_deposit_instructions: { to_address: "0xabc" } });
    const accepted = await bridgePayoutAdapter.createPayout(creds, req);
    expect(accepted).toMatchObject({ kind: "accepted", providerReference: "tr_9", status: "awaiting_funds" });
    expect(calls[0]!.url).toBe("https://api.sandbox.bridge.xyz/v0/transfers");
    expect((calls[0]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBe(req.idempotencyKey);
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ on_behalf_of: "cust", client_reference_id: "pay", source: { payment_rail: "base", currency: "usdc" }, destination: { payment_rail: "base", to_address: "0x0000000000000000000000000000000000000001" } });
    respond(403, { message: "AML violation" });
    expect(await bridgePayoutAdapter.createPayout(creds, req)).toMatchObject({ kind: "rejected", retryableElsewhere: false });
    respond(500, {});
    expect((await bridgePayoutAdapter.createPayout(creds, req)).kind).toBe("unknown");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect((await bridgePayoutAdapter.createPayout(creds, req)).kind).toBe("unknown");
  });
});

describe("outbound webhook signatures", () => {
  it("round-trips and rejects tampering or replay", () => {
    const body = JSON.stringify({ type: "payment.completed" });
    const now = Date.now();
    const header = signWebhookPayload("whsec_test", Math.floor(now / 1000), body);
    expect(verifyWebhookSignature("whsec_test", header, body, 300, now)).toBe(true);
    expect(verifyWebhookSignature("whsec_test", header, `${body} `, 300, now)).toBe(false);
    expect(verifyWebhookSignature("whsec_other", header, body, 300, now)).toBe(false);
    expect(verifyWebhookSignature("whsec_test", header, body, 300, now + 10 * 60_000)).toBe(false);
  });

  it("only accepts public HTTPS endpoints in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(validateWebhookUrl("https://api.example.com/hooks")).toBe("https://api.example.com/hooks");
      for (const bad of [
        "http://api.example.com/hooks",
        "https://localhost/hooks",
        "https://10.1.2.3/hooks",
        "https://169.254.169.254/latest",
        "https://[::1]/hooks",
        "https://[::ffff:127.0.0.1]/hooks",
        "https://[::ffff:10.0.0.1]/hooks",
        "https://user:pass@api.example.com/hooks",
      ]) {
        expect(() => validateWebhookUrl(bad), bad).toThrow();
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("beneficiaries", () => {
  it("validate account details, store them encrypted and deduplicate", async () => {
    await expect(payments.createBeneficiary(org, owner, { holderType: "business", holderName: "Bad", country: "AE", currency: "AED", method: "iban", details: { iban: "AE070331234567890123457" } })).rejects.toThrow(/checksum/);
    await expect(payments.createBeneficiary(org, owner, { holderType: "business", holderName: "Bad", country: "US", currency: "USD", method: "bank_us", details: { accountNumber: "1234567", routingNumber: "123456789" } })).rejects.toThrow(/routing/);
    const again = await payments.createBeneficiary(org, owner, { holderType: "business", holderName: "Dubai Supplier LLC", country: "AE", currency: "AED", method: "iban", details: { iban: UAE_IBAN } });
    expect(again).toMatchObject({ created: false, beneficiary: { id: beneficiaryId, displayHint: "AE07 •••• 3456" } });
    const [row] = await (await getDb()).select().from(database.beneficiaries).where(eq(database.beneficiaries.id, beneficiaryId));
    expect(row!.encryptedDetails).not.toContain(UAE_IBAN);
  });
});

describe("payment lifecycle (test mode)", () => {
  it("routes, submits through the sandbox rail, and settles", async () => {
    const { payment } = await payments.createPayment(org, actor(), { mode: "test", intent, beneficiaryId, idempotencyKey: "idem-lifecycle-1" });
    expect(payment.status).toBe("ready");
    const plan = payment.routePlan as unknown as { candidates: Array<{ executor: { kind: string } }> };
    expect(plan.candidates.length).toBe(2);
    expect(plan.candidates.every((c) => c.executor.kind === "railor_sandbox")).toBe(true);

    const replay = await payments.createPayment(org, actor(), { mode: "test", intent, beneficiaryId, idempotencyKey: "idem-lifecycle-1" });
    expect(replay).toMatchObject({ replayed: true, payment: { id: payment.id } });
    await expect(payments.createPayment(org, actor(), { mode: "test", intent: { ...intent, amount: 5 }, beneficiaryId, idempotencyKey: "idem-lifecycle-1" })).rejects.toMatchObject({ code: "idempotency_conflict" });

    const detail = await payments.submitPayment(org, actor(), payment.id);
    expect(detail.payment.status).toBe("processing");
    expect(detail.attempts).toHaveLength(1);
    expect(detail.attempts[0]).toMatchObject({ status: "accepted", executor: "railor_sandbox" });
    await expect(payments.submitPayment(org, actor(), payment.id)).rejects.toMatchObject({ code: "not_submittable" });
    await expect(payments.cancelPayment(org, actor(), payment.id)).rejects.toMatchObject({ code: "not_cancellable" });

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120_000);
    await (await getDb()).update(database.payments).set({ updatedAt: new Date(0) }).where(eq(database.payments.id, payment.id));
    await payments.reconcileOpenPayments({ organizationId: org });
    const settled = await payments.getPaymentDetail(org, payment.id);
    expect(settled.payment.status).toBe("completed");
    expect(settled.events.map((e) => e.type)).toEqual(expect.arrayContaining(["payment.created", "status.submitting", "attempt.accepted", "status.processing", "status.completed"]));
  });

  it("falls back to the next provider on a definitive rejection, never on a compliance one", async () => {
    const real = sandboxPayoutAdapter.createPayout.bind(sandboxPayoutAdapter);
    let calls = 0;
    vi.spyOn(sandboxPayoutAdapter, "createPayout").mockImplementation(async (c, r) => (++calls === 1 ? { kind: "rejected", code: "insufficient_funds", message: "low", retryableElsewhere: true } : real(c, r)));
    const { payment } = await payments.createPayment(org, actor(), { mode: "test", intent, beneficiaryId });
    const detail = await payments.submitPayment(org, actor(), payment.id);
    expect(detail.attempts.map((a) => a.status)).toEqual(["rejected", "accepted"]);
    expect(detail.payment.status).toBe("processing");

    const compliance = await payments.createPayment(org, actor(), { mode: "test", intent: { ...intent, amount: 1000.66 }, beneficiaryId });
    const failed = await payments.submitPayment(org, actor(), compliance.payment.id);
    expect(failed.payment).toMatchObject({ status: "failed", failureCode: "compliance_rejected" });
    expect(failed.attempts).toHaveLength(1);
  });

  it("parks an ambiguous outcome in unknown and never re-routes it; reconciliation resolves it", async () => {
    const { payment } = await payments.createPayment(org, actor(), { mode: "test", intent: { ...intent, amount: 1000.99 }, beneficiaryId });
    const detail = await payments.submitPayment(org, actor(), payment.id);
    expect(detail.payment.status).toBe("unknown");
    expect(detail.attempts).toHaveLength(1);
    await (await getDb()).update(database.payments).set({ updatedAt: new Date(0) }).where(eq(database.payments.id, payment.id));
    await payments.reconcilePayment(payment.id);
    const after = await payments.getPaymentDetail(org, payment.id);
    expect(["processing", "completed"]).toContain(after.payment.status);
    expect(after.attempts[0]!.providerReference).toMatch(/^sim_ok_/);
  });

  it("requires independent approval above the policy threshold", async () => {
    await activePolicy({ humanApprovalAboveAmount: 500 });
    const { payment } = await payments.createPayment(org, actor(), { mode: "test", intent, beneficiaryId });
    expect(payment.status).toBe("requires_approval");
    await expect(payments.submitPayment(org, actor(), payment.id)).rejects.toMatchObject({ code: "approval_required" });
    const [approval] = await (await getDb()).select().from(decisionApprovals).where(eq(decisionApprovals.decisionId, payment.decisionId!));
    await reviewApproval(org, reviewer, { id: approval!.id, action: "approve", comment: "Checked beneficiary and amount" });
    const detail = await payments.submitPayment(org, actor(), payment.id);
    expect(detail.payment.status).toBe("processing");
    await activePolicy();
  });

  it("honours the operator kill switch", async () => {
    const { payment } = await payments.createPayment(org, actor(), { mode: "test", intent, beneficiaryId });
    await payments.setPlatformSetting("payments.paused", { paused: true, reason: "incident drill" }, owner);
    await expect(payments.submitPayment(org, actor(), payment.id)).rejects.toMatchObject({ code: "payments_paused" });
    await payments.setPlatformSetting("payments.paused", { paused: false }, owner);
    expect((await payments.cancelPayment(org, actor(), payment.id)).payment.status).toBe("cancelled");
  });
});

describe("live mode gates", () => {
  it("refuses live payments until the deployment, the workspace and a production connection all allow it", async () => {
    await expect(payments.createPayment(org, actor(), { mode: "live", intent, beneficiaryId })).rejects.toMatchObject({ code: "live_payments_disabled" });
    process.env.RAILOR_LIVE_PAYMENTS = "enabled";
    await expect(payments.createPayment(org, actor(), { mode: "live", intent, beneficiaryId })).rejects.toMatchObject({ code: "live_access_required" });
    await payments.setOrgLiveAccess(org, owner, { liveEnabled: true, maxPaymentAmount: 5000, dailyPaymentAmount: 10_000 });
    await expect(payments.createPayment(org, actor(), { mode: "live", intent: { ...intent, amount: 6000 }, beneficiaryId })).rejects.toMatchObject({ code: "amount_above_limit" });
    const { payment } = await payments.createPayment(org, actor(), { mode: "live", intent, beneficiaryId });
    // No production connection exists, and the sandbox rail can never carry live money.
    expect(payment).toMatchObject({ status: "blocked", failureCode: "no_executable_route" });
    await payments.setOrgLiveAccess(org, owner, { liveEnabled: false });
  });
});

describe("outbound webhooks", () => {
  it("queues signed deliveries for payment events and retries failures", async () => {
    const { endpoint, secret } = await payments.createWebhookEndpoint(org, owner, { url: "http://localhost:4999/hooks", mode: "test" });
    await payments.createPayment(org, actor(), { mode: "test", intent, beneficiaryId });
    const db = await getDb();
    const queued = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, endpoint.id));
    expect(queued.map((d) => d.eventType)).toContain("payment.created");
    const received: Array<{ signature: string; body: string }> = [];
    await db.update(webhookDeliveries).set({ status: "pending", nextAttemptAt: new Date(0), attempts: 0 }).where(eq(webhookDeliveries.endpointId, endpoint.id));
    const result = await payments.deliverDueWebhooks({
      organizationId: org,
      fetcher: (async (_url: string, init: RequestInit) => {
        received.push({ signature: new Headers(init.headers).get("railor-signature")!, body: String(init.body) });
        return new Response("ok", { status: 200 });
      }) as typeof fetch,
    });
    expect(result.delivered).toBeGreaterThan(0);
    expect(verifyWebhookSignature(secret, received[0]!.signature, received[0]!.body)).toBe(true);
    await db.update(webhookDeliveries).set({ status: "pending", nextAttemptAt: new Date(0) }).where(eq(webhookDeliveries.endpointId, endpoint.id));
    const failing = await payments.deliverDueWebhooks({ organizationId: org, fetcher: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch });
    expect(failing.failed).toBeGreaterThan(0);
    const [after] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, endpoint.id)).limit(1);
    expect(after!.status).toBe("pending");
    expect(after!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await payments.deleteWebhookEndpoint(org, endpoint.id);
  });
});

it("records no provider attempts for payments that never left Railor", async () => {
  const db = await getDb();
  const attempts = await db.select().from(paymentAttempts);
  expect(attempts.every((a) => a.executor === "railor_sandbox")).toBe(true);
});
