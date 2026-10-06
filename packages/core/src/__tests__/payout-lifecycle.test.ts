import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Every real rail, end to end through the payment service: policy → route plan →
 * submit → provider API → reconcile/webhook. Only the provider HTTP is replaced
 * (by a recording fake that speaks each provider's published protocol); the
 * database is a throwaway embedded Postgres. No network, no credentials, no money.
 */

const dir = mkdtempSync(join(tmpdir(), "railor-lifecycle-test-"));
process.env.PGLITE_DATA_DIR = dir;
process.env.DATABASE_URL = "";
process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.RAILOR_LIVE_PAYMENTS;

const database = await import("@railor/database");
const { getDb, ensureMigrated, seedDemoData, organizations, users, organizationMembers, providers, providerProducts, providerRoutes, evidence, providerConnections, paymentAttempts, payments: paymentsTable, providerWebhookEvents } = database;
const { PolicyRules } = await import("@railor/types");
const { createPolicy, activatePolicyVersion } = await import("../decision-repository.js");
const { encryptJson } = await import("../secrets.js");
const payments = await import("../payments/index.js");

type Handler = (ctx: { method: string; url: URL; body: any; headers: Headers }) => [number, unknown] | null;
interface Call {
  method: string;
  url: string;
  path: string;
  body: any;
  headers: Headers;
  status?: number;
}

/** One fake for all four providers: stateful where the real ones are (ids, idempotent replays, statuses). */
const remote = {
  calls: [] as Call[],
  overrides: [] as Array<{ match: (c: Call) => boolean; reply: [number, unknown]; once?: boolean }>,
  status: { wise: "processing", airwallex: "PROCESSING", circle: "pending", bridge: "payment_submitted" },
  seq: 0,
  wiseTransfers: new Map<string, { id: number; customerTransactionId: string }>(),
  airwallexTransfers: new Map<string, { id: string; request_id: string }>(),
  bridgeTransfers: new Map<string, string>(),
  reset() {
    this.calls = [];
    this.overrides = [];
    this.status = { wise: "processing", airwallex: "PROCESSING", circle: "pending", bridge: "payment_submitted" };
  },
  callsTo(pattern: RegExp) {
    return this.calls.filter((c) => pattern.test(`${c.method} ${c.path}`));
  },
};

function respond(call: Call): [number, unknown] {
  const override = remote.overrides.findIndex((o) => o.match(call));
  if (override >= 0) {
    const o = remote.overrides[override]!;
    if (o.once) remote.overrides.splice(override, 1);
    return o.reply;
  }
  const { method, path, body, headers } = call;
  const host = new URL(call.url).host;
  const id = () => ++remote.seq;

  if (/wise/.test(host)) {
    if (method === "POST" && path === "/v1/accounts") return [200, { id: 7000 + id() }];
    if (method === "POST" && /^\/v3\/profiles\/\d+\/quotes$/.test(path)) return [200, { id: `quote-${id()}`, rate: 0.92, paymentOptions: [{ payIn: "BALANCE", payOut: "BANK_TRANSFER", disabled: false, targetAmount: 919.5, fee: { total: 4.5 } }] }];
    if (method === "POST" && path === "/v1/transfers") {
      const existing = remote.wiseTransfers.get(body.customerTransactionId);
      if (existing) return [200, { id: existing.id, status: "incoming_payment_waiting" }];
      const t = { id: 9000 + id(), customerTransactionId: body.customerTransactionId as string };
      remote.wiseTransfers.set(t.customerTransactionId, t);
      return [200, { id: t.id, status: "incoming_payment_waiting" }];
    }
    if (method === "POST" && /\/transfers\/\d+\/payments$/.test(path)) return [200, { status: "COMPLETED" }];
    if (method === "GET" && path === "/v1/transfers") return [200, [...remote.wiseTransfers.values()]];
    const one = /^\/v1\/transfers\/(\d+)$/.exec(path);
    if (method === "GET" && one) return [200, { id: Number(one[1]), status: remote.status.wise }];
  }
  if (/airwallex/.test(host)) {
    if (path === "/api/v1/authentication/login") return [200, { token: "aw-token", expires_at: new Date(Date.now() + 1_800_000).toISOString() }];
    if (method === "POST" && path === "/api/v1/transfers/create") {
      if (remote.airwallexTransfers.has(body.request_id)) return [400, { code: "duplicate_request", message: "request_id already exists" }];
      const t = { id: `aw_${id()}`, request_id: body.request_id as string };
      remote.airwallexTransfers.set(t.request_id, t);
      return [200, { id: t.id, status: "PROCESSING", amount_beneficiary_receives: 911.11, fee_amount: 4, fee_currency: "USD" }];
    }
    if (method === "POST" && path === "/api/v1/fx/quotes/create") return [200, { quote_id: `fx_${id()}`, currency_pair: "USDEUR", client_rate: 0.92, mid_rate: 0.921, buy_amount: 920, valid_to_at: new Date(Date.now() + 60_000).toISOString().replace("Z", "+0000") }];
    if (method === "GET" && path === "/api/v1/transfers") return [200, { items: [...remote.airwallexTransfers.values()].map((t) => ({ ...t, status: remote.status.airwallex })) }];
    const one = /^\/api\/v1\/transfers\/(aw_\d+)$/.exec(path);
    if (method === "GET" && one) return [200, { id: one[1], status: remote.status.airwallex }];
  }
  if (/circle/.test(host)) {
    if (method === "POST" && path === "/v1/addressBook/recipients") return [200, { data: { id: `rcp_${id()}` } }];
    if (method === "POST" && path === "/v1/businessAccount/banks/wires") return [201, { data: { id: `wire_${id()}` } }];
    if (method === "POST" && (path === "/v1/payouts" || path === "/v1/businessAccount/payouts")) return [201, { data: { id: `po_${id()}`, status: "pending", fees: { amount: "1.00", currency: "USD" } } }];
    const one = /^\/v1\/(?:businessAccount\/)?payouts\/(po_\d+)$/.exec(path);
    if (method === "GET" && one) return [200, { data: { id: one[1], status: remote.status.circle } }];
  }
  if (/bridge/.test(host)) {
    if (method === "GET" && path === "/v0/exchange_rates") return [200, { midmarket_rate: "0.92" }];
    if (method === "POST" && /\/customers\/[^/]+\/external_accounts$/.test(path)) return [201, { id: `ext_${id()}` }];
    if (method === "POST" && path === "/v0/transfers") {
      const key = headers.get("idempotency-key")!;
      const tid = remote.bridgeTransfers.get(key) ?? `br_${id()}`;
      remote.bridgeTransfers.set(key, tid);
      return [201, { id: tid, state: "payment_submitted", currency: "usd", receipt: { final_amount: "990.00", developer_fee: "1.00" } }];
    }
    const one = /^\/v0\/transfers\/(br_\d+)$/.exec(path);
    if (method === "GET" && one) return [200, { id: one[1], state: remote.status.bridge }];
  }
  return [599, { message: `UNEXPECTED ${method} ${call.url}` }];
}

function installFakes() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const call: Call = {
        method: (init.method ?? "GET").toUpperCase(),
        url: url.toString(),
        path: url.pathname,
        body: typeof init.body === "string" && init.body ? JSON.parse(init.body) : undefined,
        headers: new Headers(init.headers),
      };
      remote.calls.push(call);
      const [status, body] = respond(call);
      call.status = status;
      return new Response(JSON.stringify(body), { status });
    }),
  );
}

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------- */

const RAILS = ["wise", "airwallex", "circle", "bridge"] as const;
type Rail = (typeof RAILS)[number];

// One corridor per beneficiary method. Fiat-funded for the fiat rails, USDC-funded for Circle and Bridge.
const CORRIDORS = {
  bank_us: { country: "US", currency: "USD", details: { accountNumber: "1234567890", routingNumber: "021000021", bankName: "Chase", addressLine1: "1 Main St", city: "Springfield", state: "IL", postalCode: "62701" } },
  iban: { country: "DE", currency: "EUR", details: { iban: "DE89370400440532013000", bic: "COBADEFFXXX", bankName: "Commerzbank" } },
  gb: { country: "GB", currency: "GBP", details: { accountNumber: "55779911", sortCode: "200000" } },
  clabe: { country: "MX", currency: "MXN", details: { clabe: "032180000118359719" } },
  pix: { country: "BR", currency: "BRL", details: { pixKey: "joao@example.com", documentNumber: "12345678909" } },
  in_bank: { country: "IN", currency: "INR", details: { ifsc: "HDFC0001234", accountNumber: "123456789012" } },
} as const;
type FiatMethod = keyof typeof CORRIDORS;

const FUNDING: Record<Rail, { sourceCurrency?: string; sourceAsset?: string; sourceNetwork?: string }> = {
  wise: { sourceCurrency: "USD" },
  airwallex: { sourceCurrency: "USD" },
  circle: { sourceAsset: "USDC", sourceNetwork: "base" },
  bridge: { sourceAsset: "USDC", sourceNetwork: "base" },
};

let org: string;
let owner: string;
let reviewer: string;
const beneficiaries = {} as Record<FiatMethod, string>;
const connectionIds = {} as Record<Rail, string>;
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const webhookPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const actor = () => ({ userId: owner, source: "user" as const, role: "owner" });

const intentFor = (rail: Rail, method: FiatMethod, amount = 1000) => ({ sourceEntityCountry: "US", ...FUNDING[rail], destinationCountry: CORRIDORS[method].country, destinationCurrency: CORRIDORS[method].currency, amount });

async function activePolicy(rules: Record<string, unknown> = {}) {
  const p = await createPolicy(org, `lifecycle-${crypto.randomUUID()}`, PolicyRules.parse(rules));
  await activatePolicyVersion(org, p.policy.id, p.version.id);
}

async function routeFor(rail: Rail, method: FiatMethod, providerId: string, evidenceId: string) {
  const db = await getDb();
  const funding = FUNDING[rail];
  await db.insert(providerRoutes).values({
    providerId,
    product: "payout",
    entityCountry: "US",
    customerType: "business",
    sourceAsset: funding.sourceAsset ?? null,
    sourceNetwork: funding.sourceNetwork ?? null,
    sourceCurrency: funding.sourceCurrency ?? null,
    destinationCountry: CORRIDORS[method].country,
    destinationCurrency: CORRIDORS[method].currency,
    availability: "supported",
    evidenceId,
    lastVerifiedAt: new Date(),
  });
}

beforeAll(async () => {
  await ensureMigrated();
  await seedDemoData();
  const db = await getDb();
  const [o] = await db.insert(organizations).values({ name: "Lifecycle", slug: "lifecycle-test", entityCountry: "US" }).returning();
  org = o!.id;
  const people = await db.insert(users).values([{ email: "owner@life.test" }, { email: "reviewer@life.test" }]).returning();
  owner = people[0]!.id;
  reviewer = people[1]!.id;
  await db.insert(organizationMembers).values([
    { organizationId: org, userId: owner, role: "owner" },
    { organizationId: org, userId: reviewer, role: "admin" },
  ]);

  const credentials: Record<Rail, Record<string, string>> = {
    wise: { apiToken: "wise-sandbox-token", profileId: "101" },
    airwallex: { clientId: "aw-client", apiKey: "aw-key" },
    circle: { apiKey: "circle-sandbox-key" },
    bridge: { apiKey: "bridge-sandbox-key", customerId: "cust_1", webhookPublicKey: webhookPem },
  };
  const methodsByRail: Record<Rail, FiatMethod[]> = {
    wise: ["bank_us", "iban", "gb", "clabe", "in_bank"],
    airwallex: ["bank_us", "gb", "iban", "in_bank"],
    circle: ["bank_us"],
    bridge: ["bank_us", "iban", "gb", "clabe", "pix"],
  };
  // Corridors the provider registry lists as supported but Railor has no executor for: eligibility passes, execution must not be offered.
  const registryOnly: Record<Rail, FiatMethod[]> = { wise: ["pix"], airwallex: ["clabe", "pix"], circle: ["gb", "iban"], bridge: ["in_bank"] };
  for (const rail of RAILS) {
    const [provider] = await db.insert(providers).values({ slug: rail, name: rail[0]!.toUpperCase() + rail.slice(1), category: "Direct provider", description: "Lifecycle test fixture", isDemo: false }).returning();
    await db.insert(providerProducts).values({ providerId: provider!.id, product: "payout", name: "Payouts" });
    const [source] = await db
      .insert(evidence)
      .values({ providerId: provider!.id, sourceUrl: `https://example.test/${rail}`, sourceTitle: "Fixture", sourceType: "official_docs", retrievedAt: new Date(), lastVerifiedAt: new Date(), confidence: "0.95", rawExcerpt: "Fixture", rawHash: `life-${rail}` })
      .returning();
    for (const method of [...methodsByRail[rail], ...registryOnly[rail]]) await routeFor(rail, method, provider!.id, source!.id);
    const [connection] = await db
      .insert(providerConnections)
      .values({ organizationId: org, providerId: provider!.id, status: "connected", environment: "sandbox", encryptedCredentials: encryptJson(credentials[rail]), connectedAt: new Date() })
      .returning();
    connectionIds[rail] = connection!.id;
  }
  await activePolicy();
  for (const [method, c] of Object.entries(CORRIDORS)) {
    const created = await payments.createBeneficiary(org, owner, { holderType: "business", holderName: `${method} payee`, country: c.country, currency: c.currency, method, details: c.details });
    beneficiaries[method as FiatMethod] = created.beneficiary.id;
  }
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  remote.reset();
  delete process.env.RAILOR_LIVE_PAYMENTS;
});

afterAll(async () => {
  await (await database.getDbHandle()).close();
  rmSync(dir, { recursive: true, force: true });
});

async function pay(rail: Rail, method: FiatMethod, extra: Record<string, unknown> = {}, amount = 1000) {
  const { payment } = await payments.createPayment(org, actor(), { mode: "test", intent: intentFor(rail, method, amount), beneficiaryId: beneficiaries[method], pinnedProvider: rail, ...extra });
  return payment;
}

async function settle(paymentId: string) {
  await (await getDb()).update(paymentsTable).set({ updatedAt: new Date(0) }).where(eq(paymentsTable.id, paymentId));
  await payments.reconcilePayment(paymentId);
  return (await payments.getPaymentDetail(org, paymentId)).payment;
}

/* ---------------------------------------------------------------------------
 * Every rail × every method it advertises
 * ------------------------------------------------------------------------- */

describe("each real rail pays each method it advertises, end to end", () => {
  const matrix: Array<[Rail, FiatMethod[]]> = [
    ["wise", ["bank_us", "iban", "gb", "clabe", "in_bank"]],
    ["airwallex", ["bank_us", "gb", "iban", "in_bank"]],
    ["circle", ["bank_us"]],
    ["bridge", ["bank_us", "iban", "gb", "clabe", "pix"]],
  ];
  for (const [rail, methods] of matrix) {
    for (const method of methods) {
      it(`${rail} → ${method} (${CORRIDORS[method].country} ${CORRIDORS[method].currency})`, async () => {
        installFakes();
        const payment = await pay(rail, method);
        expect(payment.status, `plan: ${JSON.stringify((payment.routePlan as any).excluded)}`).toBe("ready");
        expect((payment.routePlan as any).candidates.map((c: any) => `${c.providerSlug}:${c.executor.kind}`)).toEqual([`${rail}:provider`]);

        const detail = await payments.submitPayment(org, actor(), payment.id);
        expect(detail.payment.status).toBe("processing");
        expect(detail.payment.selectedProvider).toBe(rail);
        expect(detail.attempts).toHaveLength(1);
        expect(detail.attempts[0]).toMatchObject({ status: "accepted", executor: "provider", providerSlug: rail });
        expect(detail.attempts[0]!.providerReference).toBeTruthy();
        // Sandbox connections only ever talk to the provider's sandbox host.
        expect(remote.calls.length).toBeGreaterThan(0);
        expect(remote.calls.every((c) => /sandbox/.test(c.url))).toBe(true);
        expect(remote.calls.filter((c) => c.status === 599).map((c) => `${c.method} ${c.url}`)).toEqual([]);

        remote.status = { wise: "outgoing_payment_sent", airwallex: "PAID", circle: "complete", bridge: "payment_processed" };
        expect((await settle(payment.id)).status).toBe("completed");
      });
    }
  }
});

/* ---------------------------------------------------------------------------
 * Routing honesty
 * ------------------------------------------------------------------------- */

describe("routing", () => {
  it("never offers a rail that cannot pay the beneficiary's method", async () => {
    installFakes();
    // Airwallex has no CLABE rail in Railor, Circle only pays US wires: only Wise and Bridge may be candidates.
    const { payment } = await payments.createPayment(org, actor(), { mode: "test", intent: intentFor("wise", "clabe"), beneficiaryId: beneficiaries.clabe });
    const plan = payment.routePlan as any;
    expect(plan.candidates.map((c: any) => c.providerSlug).sort()).not.toContain("airwallex");
    expect(plan.candidates.map((c: any) => c.providerSlug).sort()).not.toContain("circle");

    const pinned = await pay("airwallex", "clabe");
    expect(pinned).toMatchObject({ status: "blocked", failureCode: "no_executable_route" });
    expect((pinned.routePlan as any).excluded.map((e: any) => e.reason).join(" ")).toMatch(/cannot pay Mexican CLABE/);
    expect(remote.callsTo(/transfers/)).toHaveLength(0);
  });

  it("falls back across real rails on a definitive rejection, in the operator's preferred order", async () => {
    installFakes();
    await payments.updateRoutingSettings(org, { preferredProviders: ["wise", "airwallex"], fallbackEnabled: true, maxAttempts: 3 });
    remote.overrides.push({ match: (c) => c.method === "POST" && /\/quotes$/.test(c.path) && /wise/.test(c.url), reply: [400, { message: "insufficient balance" }] });
    const { payment } = await payments.createPayment(org, actor(), { mode: "test", intent: intentFor("wise", "iban"), beneficiaryId: beneficiaries.iban });
    const order = (payment.routePlan as any).candidates.map((c: any) => c.providerSlug);
    expect(order.slice(0, 2)).toEqual(["wise", "airwallex"]);
    const detail = await payments.submitPayment(org, actor(), payment.id);
    expect(detail.attempts.map((a) => `${a.providerSlug}:${a.status}`)).toEqual(["wise:rejected", "airwallex:accepted"]);
    expect(detail.payment).toMatchObject({ status: "processing", selectedProvider: "airwallex" });
    await payments.updateRoutingSettings(org, { preferredProviders: [], fallbackEnabled: true, maxAttempts: 3 });
  });

  it("stops at a compliance rejection and never tries another rail", async () => {
    installFakes();
    await payments.updateRoutingSettings(org, { preferredProviders: ["wise", "airwallex"], fallbackEnabled: true, maxAttempts: 3 });
    remote.overrides.push({ match: (c) => c.method === "POST" && c.path === "/v1/transfers", reply: [403, { message: "sanctions screening" }] });
    const { payment } = await payments.createPayment(org, actor(), { mode: "test", intent: intentFor("wise", "iban"), beneficiaryId: beneficiaries.iban });
    const detail = await payments.submitPayment(org, actor(), payment.id);
    expect(detail.payment).toMatchObject({ status: "failed", failureCode: "provider_forbidden" });
    expect(detail.attempts).toHaveLength(1);
    expect(remote.callsTo(/POST \/api\/v1\/transfers\/create/)).toHaveLength(0);
    await payments.updateRoutingSettings(org, { preferredProviders: [], fallbackEnabled: true, maxAttempts: 3 });
  });
});

/* ---------------------------------------------------------------------------
 * Ambiguity: never double-pay, never lose a payment
 * ------------------------------------------------------------------------- */

describe("ambiguous outcomes", () => {
  it("Bridge: a 503 parks the payment; reconciliation replays the SAME idempotency key and the provider dedupes", async () => {
    installFakes();
    remote.overrides.push({ match: (c) => c.method === "POST" && c.path === "/v0/transfers", reply: [503, {}], once: true });
    const payment = await pay("bridge", "iban");
    const parked = await payments.submitPayment(org, actor(), payment.id);
    expect(parked.payment.status).toBe("unknown");
    expect(parked.attempts).toHaveLength(1);
    const firstKey = remote.callsTo(/POST \/v0\/transfers/)[0]!.headers.get("idempotency-key");

    const after = await settle(payment.id);
    expect(after.status).toBe("processing");
    const transferCalls = remote.callsTo(/POST \/v0\/transfers/);
    expect(transferCalls).toHaveLength(2);
    expect(transferCalls[1]!.headers.get("idempotency-key")).toBe(firstKey);
    expect((await payments.getPaymentDetail(org, payment.id)).attempts).toHaveLength(1);
  });

  it("Wise: an ambiguous transfer is found by customerTransactionId instead of being sent twice", async () => {
    installFakes();
    remote.overrides.push({ match: (c) => c.method === "POST" && c.path === "/v1/transfers", reply: [503, {}], once: true });
    const payment = await pay("wise", "iban");
    const parked = await payments.submitPayment(org, actor(), payment.id);
    expect(parked.payment.status).toBe("unknown");
    // The transfer did reach Wise before the connection dropped.
    const key = parked.attempts[0]!.idempotencyKey;
    remote.wiseTransfers.set(key, { id: 4242, customerTransactionId: key });
    remote.status.wise = "outgoing_payment_sent";
    const after = await settle(payment.id);
    expect(after.status).toBe("completed");
    expect(remote.callsTo(/POST \/v1\/transfers$/)).toHaveLength(1);
  });

  it("Airwallex: a duplicate request_id is reconciled by lookup, never re-created", async () => {
    installFakes();
    const payment = await pay("airwallex", "bank_us");
    remote.overrides.push({ match: (c) => c.method === "POST" && c.path === "/api/v1/transfers/create", reply: [504, {}], once: true });
    const parked = await payments.submitPayment(org, actor(), payment.id);
    expect(parked.payment.status).toBe("unknown");
    const key = parked.attempts[0]!.idempotencyKey;
    remote.airwallexTransfers.set(key, { id: "aw_found", request_id: key });
    remote.status.airwallex = "PAID";
    expect((await settle(payment.id)).status).toBe("completed");
    expect(remote.callsTo(/POST \/api\/v1\/transfers\/create/)).toHaveLength(1);
  });

  it("a payment stranded in `submitting` is closed out instead of hanging forever", async () => {
    const db = await getDb();
    const payment = await pay("wise", "iban");
    await db.update(paymentsTable).set({ status: "submitting", updatedAt: new Date(Date.now() - 20 * 60_000) }).where(eq(paymentsTable.id, payment.id));
    const result = await payments.reconcilePayment(payment.id);
    expect(result.outcome).toBe("updated");
    expect((await payments.getPaymentDetail(org, payment.id)).payment).toMatchObject({ status: "failed", failureCode: "submit_interrupted" });

    // A recent one is left alone: its submit may still be running.
    const live = await pay("wise", "iban");
    await db.update(paymentsTable).set({ status: "submitting", updatedAt: new Date(Date.now() - 60_000) }).where(eq(paymentsTable.id, live.id));
    expect((await payments.reconcilePayment(live.id)).outcome).toBe("no_attempt");

    // Last attempt already rejected by the provider, then the process died: fail with the provider's reason.
    const rejected = await pay("wise", "iban");
    await db.update(paymentsTable).set({ status: "submitting", updatedAt: new Date(Date.now() - 20 * 60_000) }).where(eq(paymentsTable.id, rejected.id));
    await db.insert(paymentAttempts).values({ paymentId: rejected.id, organizationId: org, attemptNumber: 1, providerSlug: "wise", executor: "provider", environment: "sandbox", connectionId: connectionIds.wise, idempotencyKey: crypto.randomUUID(), status: "rejected", errorCode: "provider_422", errorMessage: "Invalid recipient" });
    await payments.reconcilePayment(rejected.id);
    expect((await payments.getPaymentDetail(org, rejected.id)).payment).toMatchObject({ status: "failed", failureCode: "provider_422", failureMessage: "Invalid recipient" });
  });
});

/* ---------------------------------------------------------------------------
 * Provider webhooks (Bridge signs them; the others are reconciled by polling)
 * ------------------------------------------------------------------------- */

describe("inbound provider webhooks", () => {
  const signed = (body: string, at = Date.now()) => {
    const digest = createHash("sha256").update(`${at}.${body}`).digest();
    const signer = createSign("RSA-SHA256");
    signer.update(digest);
    return new Headers({ "x-webhook-signature": `t=${at},v0=${signer.sign(privateKey, "base64")}` });
  };

  it("applies a verified Bridge event once, refuses forgeries and replays, and ignores strangers", async () => {
    installFakes();
    const payment = await pay("bridge", "iban");
    const detail = await payments.submitPayment(org, actor(), payment.id);
    const ref = detail.attempts[0]!.providerReference!;
    const event = (id: string, status: string) => JSON.stringify({ event_id: id, event_category: "transfer", event_object_id: ref, event_object_status: status });

    const body = event("evt_1", "payment_processed");
    await expect(payments.ingestProviderWebhook("bridge", connectionIds.bridge, new Headers({ "x-webhook-signature": `t=${Date.now()},v0=AAAA` }), body)).rejects.toMatchObject({ code: "invalid_signature" });
    expect((await payments.getPaymentDetail(org, payment.id)).payment.status).toBe("processing");

    expect(await payments.ingestProviderWebhook("bridge", connectionIds.bridge, signed(body), body)).toEqual({ outcome: "applied" });
    expect((await payments.getPaymentDetail(org, payment.id)).payment.status).toBe("completed");
    expect(await payments.ingestProviderWebhook("bridge", connectionIds.bridge, signed(body), body)).toEqual({ outcome: "duplicate" });

    const stranger = JSON.stringify({ event_id: "evt_2", event_category: "transfer", event_object_id: "br_unknown", event_object_status: "payment_processed" });
    expect(await payments.ingestProviderWebhook("bridge", connectionIds.bridge, signed(stranger), stranger)).toEqual({ outcome: "unmatched" });
    const other = JSON.stringify({ event_id: "evt_3", event_category: "customer", event_object_id: "c1" });
    expect(await payments.ingestProviderWebhook("bridge", connectionIds.bridge, signed(other), other)).toEqual({ outcome: "ignored" });

    const stored = await (await getDb()).select().from(providerWebhookEvents).where(and(eq(providerWebhookEvents.connectionId, connectionIds.bridge)));
    expect(stored.map((e) => e.eventId).sort()).toEqual(["evt_1", "evt_2"]);
  });

  it("does not accept webhooks for providers that are reconciled by polling", async () => {
    for (const slug of ["wise", "airwallex", "circle"]) {
      await expect(payments.ingestProviderWebhook(slug, connectionIds[slug as Rail], new Headers(), "{}"), slug).rejects.toMatchObject({ code: "unsupported" });
    }
    await expect(payments.ingestProviderWebhook("bridge", "not-a-uuid", new Headers(), "{}")).rejects.toMatchObject({ code: "not_found" });
    await expect(payments.ingestProviderWebhook("bridge", connectionIds.wise, new Headers(), "{}")).rejects.toMatchObject({ code: "not_found" });
  });
});

/* ---------------------------------------------------------------------------
 * Railor's own test rail, through the service
 * ------------------------------------------------------------------------- */

describe("returns watch", () => {
  it("leaves a healthy completed payment completed, and asks real providers no more than once per interval", async () => {
    installFakes();
    const payment = await pay("wise", "iban");
    await payments.submitPayment(org, actor(), payment.id);
    remote.status.wise = "outgoing_payment_sent";
    expect((await settle(payment.id)).status).toBe("completed");

    await (await getDb()).update(paymentsTable).set({ updatedAt: new Date(Date.now() - 3_600_000) }).where(eq(paymentsTable.id, payment.id));
    remote.calls = [];
    expect((await payments.watchCompletedForReturns({ organizationId: org })).find((r) => r.paymentId === payment.id)).toEqual({ paymentId: payment.id, outcome: "unchanged" });
    expect(remote.callsTo(/GET \/v1\/transfers\/\d+$/)).toHaveLength(1);
    expect((await payments.getPaymentDetail(org, payment.id)).payment.status).toBe("completed");

    // Just checked: no second provider call until the interval passes (the test rail has no such limit).
    await (await getDb()).update(paymentsTable).set({ updatedAt: new Date(Date.now() - 60_000) }).where(eq(paymentsTable.id, payment.id));
    remote.calls = [];
    expect((await payments.watchCompletedForReturns({ organizationId: org })).find((r) => r.paymentId === payment.id)).toEqual({ paymentId: payment.id, outcome: "skipped" });
    expect(remote.calls).toHaveLength(0);

    // A provider that reports a return is believed.
    await (await getDb()).update(paymentsTable).set({ updatedAt: new Date(Date.now() - 3_600_000) }).where(eq(paymentsTable.id, payment.id));
    remote.status.wise = "funds_refunded";
    expect((await payments.watchCompletedForReturns({ organizationId: org })).find((r) => r.paymentId === payment.id)).toEqual({ paymentId: payment.id, outcome: "returned" });
  });
});

describe("Railor test rail", () => {
  const sandboxIntent = { sourceEntityCountry: "US", sourceCurrency: "USD", destinationCountry: "DE", destinationCurrency: "EUR" };

  async function unconnected(amount: number) {
    // No pin and a rail nobody connected: the sandbox stands in.
    const { payment } = await payments.createPayment(org, actor(), { mode: "test", intent: { ...sandboxIntent, amount }, beneficiaryId: beneficiaries.iban });
    return payment;
  }

  it("carries funds-awaiting and returned scenarios to their endings", async () => {
    await (await getDb()).update(providerConnections).set({ status: "not_connected" }).where(eq(providerConnections.organizationId, org));
    try {
      const funds = await unconnected(300.55);
      expect((funds.routePlan as any).candidates.every((c: any) => c.executor.kind === "railor_sandbox")).toBe(true);
      const detail = await payments.submitPayment(org, actor(), funds.id);
      expect(detail.payment).toMatchObject({ status: "awaiting_funds" });
      expect(detail.payment.depositInstructions).toMatchObject({ amount: "300.55" });

      const returned = await unconnected(300.77);
      await payments.submitPayment(org, actor(), returned.id);
      const realNow = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(realNow + 25_000);
      expect((await settle(returned.id)).status).toBe("completed");
      // Completed, and then the beneficiary's bank sent it back: the returns watch finds it.
      vi.spyOn(Date, "now").mockReturnValue(realNow + 50_000);
      await (await getDb()).update(paymentsTable).set({ updatedAt: new Date(0) }).where(eq(paymentsTable.id, returned.id));
      expect((await payments.watchCompletedForReturns({ organizationId: org })).find((r) => r.paymentId === returned.id)).toEqual({ paymentId: returned.id, outcome: "returned" });
      const back = await payments.getPaymentDetail(org, returned.id);
      expect(back.payment).toMatchObject({ status: "returned", failureCode: "provider_returned" });
    } finally {
      vi.restoreAllMocks();
      await (await getDb()).update(providerConnections).set({ status: "connected" }).where(eq(providerConnections.organizationId, org));
    }
  });
});

/* ---------------------------------------------------------------------------
 * Live mode: production hosts only, and only behind every gate
 * ------------------------------------------------------------------------- */

describe("live mode", () => {
  it("talks to a provider's production host only for approved live payments with a production connection", async () => {
    installFakes();
    const db = await getDb();
    const [wise] = await db.select().from(providers).where(eq(providers.slug, "wise"));
    await db.insert(providerConnections).values({ organizationId: org, providerId: wise!.id, status: "connected", environment: "production", encryptedCredentials: encryptJson({ apiToken: "wise-live-token", profileId: "101" }), connectedAt: new Date() });
    process.env.RAILOR_LIVE_PAYMENTS = "enabled";
    await payments.setOrgLiveAccess(org, owner, { liveEnabled: true, maxPaymentAmount: 5000, dailyPaymentAmount: 10_000 });

    // Connected but not yet approved by an operator for live payouts: blocked, nothing sent.
    const blocked = await payments.createPayment(org, actor(), { mode: "live", intent: intentFor("wise", "iban", 100), beneficiaryId: beneficiaries.iban, pinnedProvider: "wise" });
    expect(blocked.payment).toMatchObject({ status: "blocked", failureCode: "no_executable_route" });
    expect(remote.calls.filter((c) => c.method !== "GET" || /transfers/.test(c.path))).toHaveLength(0);

    await payments.setPlatformSetting("payments.live_providers", ["wise"], owner);
    const ready = await payments.createPayment(org, actor(), { mode: "live", intent: intentFor("wise", "iban", 100), beneficiaryId: beneficiaries.iban, pinnedProvider: "wise" });
    expect(ready.payment.status).toBe("ready");
    remote.calls = [];
    const detail = await payments.submitPayment(org, actor(), ready.payment.id);
    expect(detail.payment.status).toBe("processing");
    expect(remote.calls.length).toBeGreaterThan(0);
    expect(remote.calls.every((c) => c.url.startsWith("https://api.wise.com/"))).toBe(true);
    expect(remote.calls.some((c) => /wise-sandbox/.test(c.url))).toBe(false);
    await payments.setPlatformSetting("payments.live_providers", [], owner);
    await payments.setOrgLiveAccess(org, owner, { liveEnabled: false });
  });
});

/* ---------------------------------------------------------------------------
 * Stablecoin wallets
 * ------------------------------------------------------------------------- */

describe("stablecoin wallet beneficiaries", () => {
  it("are refused up front with a coming-soon message instead of being saved and left unpayable", async () => {
    await expect(
      payments.createBeneficiary(org, owner, { holderType: "business", holderName: "Treasury wallet", country: "AE", currency: "USDC", method: "crypto_address", network: "base", details: { address: "0x00000000000000000000000000000000000000a1" } }),
    ).rejects.toThrow(/coming soon/i);
    expect(payments.WALLET_PAYOUTS_ENABLED).toBe(false);
  });
});
