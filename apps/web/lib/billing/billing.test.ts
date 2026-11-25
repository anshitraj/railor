import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const directory = mkdtempSync(join(tmpdir(), "railor-billing-"));
process.env.PGLITE_DATA_DIR = directory;
process.env.DATABASE_URL = "";
const database = await import("@railor/database");
const { ensureMigrated, getDb, getDbHandle, organizations, users, organizationEntitlements, billingCheckouts, discountCodes, discountRedemptions, walletBalanceCents, walletHistory } = database;
const { eq } = await import("drizzle-orm");
const { verifyDodoWebhook } = await import("./dodo");
const { centsToDecimal, decimalToCents, verifyArcWebhook } = await import("./arcpay");
const { availableMethods, dodoConfig } = await import("./config");
const { BillingError, handleArcEvent, handleDodoEvent, refreshCheckout, startCheckout } = await import("./service");

const DODO_SECRET = `whsec_${Buffer.from("dodo-test-signing-key-0123456789").toString("base64")}`;

describe("webhook signatures", () => {
  const body = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_1" } });
  const now = 1_795_600_000_000;
  const sign = (id: string, ts: string, raw: string) => `v1,${createHmac("sha256", Buffer.from(DODO_SECRET.slice(6), "base64")).update(`${id}.${ts}.${raw}`).digest("base64")}`;
  const ts = String(Math.floor(now / 1000));

  it("accepts Dodo's Standard Webhooks signature, including one of several", () => {
    expect(verifyDodoWebhook(body, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, DODO_SECRET, now)).toBe(true);
    expect(verifyDodoWebhook(body, { id: "msg_1", timestamp: ts, signature: `v1,AAAA ${sign("msg_1", ts, body)}` }, DODO_SECRET, now)).toBe(true);
  });

  it("rejects a changed body, a different message id, a stale timestamp and a missing header", () => {
    const signature = sign("msg_1", ts, body);
    expect(verifyDodoWebhook(body.replace("pay_1", "pay_2"), { id: "msg_1", timestamp: ts, signature }, DODO_SECRET, now)).toBe(false);
    expect(verifyDodoWebhook(body, { id: "msg_2", timestamp: ts, signature }, DODO_SECRET, now)).toBe(false);
    expect(verifyDodoWebhook(body, { id: "msg_1", timestamp: ts, signature }, DODO_SECRET, now + 6 * 60_000)).toBe(false);
    expect(verifyDodoWebhook(body, { id: "msg_1", timestamp: ts, signature: null }, DODO_SECRET, now)).toBe(false);
    expect(verifyDodoWebhook(body, { id: "msg_1", timestamp: ts, signature: signature.replace("v1,", "v2,") }, DODO_SECRET, now)).toBe(false);
  });

  it("checks ArcPay's hex HMAC of the raw body", () => {
    const good = createHmac("sha256", "arc-secret").update(body).digest("hex");
    expect(verifyArcWebhook(body, good, "arc-secret")).toBe(true);
    expect(verifyArcWebhook(`${body} `, good, "arc-secret")).toBe(false);
    expect(verifyArcWebhook(body, good, "other-secret")).toBe(false);
    expect(verifyArcWebhook(body, "zz", "arc-secret")).toBe(false);
  });

  it("converts between cents and ArcPay's decimal amounts without float drift", () => {
    expect(centsToDecimal(2500)).toBe("25.00");
    expect(centsToDecimal(299)).toBe("2.99");
    expect(decimalToCents("2.99")).toBe(299);
    expect(decimalToCents("29.000000")).toBe(2900);
    expect(decimalToCents(9.99)).toBe(999);
    expect(decimalToCents("1.005")).toBeNull();
    expect(decimalToCents("-1")).toBeNull();
    expect(decimalToCents("abc")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Checkout flows against a fake Dodo and a fake ArcPay                        */
/* -------------------------------------------------------------------------- */

type Call = { method: string; url: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let dodoSessions: Record<string, { payment_id?: string; payment_status?: string }> = {};
let dodoPayments: Record<string, Record<string, unknown>> = {};
let dodoSubscriptions: Record<string, Record<string, unknown>> = {};
let arcPayments: Record<string, Record<string, unknown>> = {};
let sessionCount = 0;

function fakeProviders() {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    calls.push({ method, url: url.toString(), body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
    if (url.hostname === "test.dodopayments.com") {
      if (method === "POST" && url.pathname === "/checkouts") {
        const id = `cks_${++sessionCount}`;
        dodoSessions[id] = {};
        return json({ session_id: id, checkout_url: `https://test.checkout.dodopayments.com/session/${id}` });
      }
      const [, kind, id, action] = url.pathname.split("/");
      if (kind === "checkouts" && dodoSessions[id!]) return json({ id, ...dodoSessions[id!] });
      if (kind === "payments" && dodoPayments[id!]) return json(dodoPayments[id!]);
      if (kind === "subscriptions" && dodoSubscriptions[id!]) {
        if (method === "POST" && action === "change-plan") { dodoSubscriptions[id!]!.product_id = body!.product_id; return json({}); }
        if (method === "PATCH") { dodoSubscriptions[id!]!.cancel_at_next_billing_date = body!.cancel_at_next_billing_date; return json({}); }
        return json(dodoSubscriptions[id!]);
      }
      return json({ message: "not found" }, 404);
    }
    if (url.hostname === "arcpay.test") {
      if (method === "POST" && url.pathname === "/api/payments/create") {
        const id = `arc_${++sessionCount}`;
        arcPayments[id] = { id, status: "created", amount: body!.amount, currency: "USDC", isTest: true, metadata: body!.metadata };
        return json({ id, status: "created", checkout_url: `https://arcpay.test/checkout/${id}`, amount: Number(body!.amount), currency: "USDC" });
      }
      const id = url.pathname.split("/").pop()!;
      if (arcPayments[id]) return json(arcPayments[id]);
      return json({ error: "Payment not found" }, 404);
    }
    throw new Error(`unexpected request ${method} ${url}`);
  });
}

let orgRow: typeof organizations.$inferSelect;
let userId: string;
const session = (role = "owner") => ({ user: { id: userId, email: "owner@railor.test", name: "Owner", avatarUrl: null, isAdmin: false }, organization: orgRow, role });
const checkoutIdFrom = (redirect: string) => {
  const match = redirect.match(/checkout=([0-9a-f-]{36})/);
  if (match) return match[1]!;
  const sessionId = redirect.split("/").pop()!;
  return sessionId;
};
async function checkoutBySession(sessionId: string) {
  const db = await getDb();
  const [row] = await db.select().from(billingCheckouts).where(eq(billingCheckouts.providerSessionId, sessionId));
  return row!;
}
async function plan() {
  const db = await getDb();
  const [row] = await db.select().from(organizationEntitlements).where(eq(organizationEntitlements.organizationId, orgRow.id));
  return row ?? null;
}

beforeAll(async () => {
  await ensureMigrated();
  const db = await getDb();
  const [created] = await db.insert(users).values({ email: "owner@railor.test" }).returning();
  userId = created!.id;
});
afterAll(async () => {
  await (await getDbHandle()).close?.();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  calls = []; dodoSessions = {}; dodoPayments = {}; dodoSubscriptions = {}; arcPayments = {};
  vi.stubGlobal("fetch", fakeProviders());
  vi.stubEnv("APP_ORIGIN", "https://railor.test");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("DODO_PAYMENTS_API_KEY", "dodo_test_key");
  vi.stubEnv("DODO_PAYMENTS_WEBHOOK_KEY", DODO_SECRET);
  vi.stubEnv("DODO_PAYMENTS_ENVIRONMENT", "test_mode");
  vi.stubEnv("DODO_PRODUCT_PLUS", "pdt_plus");
  vi.stubEnv("DODO_PRODUCT_PRO", "pdt_pro");
  vi.stubEnv("DODO_PRODUCT_BUSINESS", "pdt_business");
  vi.stubEnv("DODO_PRODUCT_TOP_UP", "pdt_topup");
  vi.stubEnv("ARCPAY_API_KEY", "sk_arc_test_123");
  vi.stubEnv("ARCPAY_WEBHOOK_SECRET", "arc-secret");
  vi.stubEnv("ARCPAY_BASE_URL", "https://arcpay.test");
  const db = await getDb();
  [orgRow] = await db.insert(organizations).values({ name: "Billing", slug: `billing-${Math.random().toString(36).slice(2, 8)}` }).returning() as [typeof organizations.$inferSelect];
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("which ways to pay are on", () => {
  it("offers a method only when its keys and product are set", () => {
    expect(availableMethods("plan", "pro")).toMatchObject({ card: true, usdc: true, cardTest: true, usdcTest: true });
    vi.stubEnv("DODO_PRODUCT_PRO", "");
    vi.stubEnv("ARCPAY_API_KEY", "");
    expect(availableMethods("plan", "pro")).toMatchObject({ card: false, usdc: false });
  });

  it("never offers test-mode payments on production unless told to", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(dodoConfig()).toBeNull();
    expect(availableMethods("top_up")).toMatchObject({ card: false, usdc: false });
    vi.stubEnv("BILLING_ALLOW_TEST_MODE", "enabled");
    expect(availableMethods("top_up")).toMatchObject({ card: true, usdc: true });
  });
});

describe("a card top-up", () => {
  it("opens a Dodo checkout for the exact amount and credits the wallet once the payment reads back as paid", async () => {
    const { redirect } = await startCheckout(session(), { purpose: "top_up", amountCents: 2500, method: "card" });
    expect(redirect).toMatch(/^https:\/\/test\.checkout\.dodopayments\.com\/session\/cks_/);
    const created = calls.find((call) => call.method === "POST" && call.url.endsWith("/checkouts"))!;
    const checkout = await checkoutBySession(checkoutIdFrom(redirect));
    expect(created.body).toMatchObject({
      product_cart: [{ product_id: "pdt_topup", quantity: 1, amount: 2500 }],
      customer: { email: "owner@railor.test" },
      return_url: `https://railor.test/app/billing/return?checkout=${checkout.id}`,
      metadata: { railor_checkout: checkout.id, railor_org: orgRow.id, railor_purpose: "top_up" },
    });
    expect(calls[0]!.url).not.toContain("dodo_test_key");

    // Not paid yet: nothing credited.
    expect((await refreshCheckout(checkout, { force: true })).status).toBe("pending");
    expect(await walletBalanceCents(await getDb(), orgRow.id)).toBe(0);

    dodoSessions[checkout.providerSessionId!] = { payment_id: "pay_top", payment_status: "succeeded" };
    dodoPayments.pay_top = { payment_id: "pay_top", status: "succeeded", total_amount: 2500, currency: "USD", metadata: { railor_checkout: checkout.id }, checkout_session_id: checkout.providerSessionId };
    // A webhook and two polls race; the wallet still gets $25 once.
    await Promise.all([
      refreshCheckout(checkout, { force: true }),
      refreshCheckout(checkout, { force: true }),
      handleDodoEvent({ type: "payment.succeeded", data: { payment_id: "pay_top", metadata: { railor_checkout: checkout.id } } }),
    ]);
    const db = await getDb();
    expect(await walletBalanceCents(db, orgRow.id)).toBe(2500);
    const [entry] = await walletHistory(db, orgRow.id);
    expect(entry).toMatchObject({ kind: "top_up", amountCents: 2500, label: "Top-up · card (test)", reference: "pay_top" });
  });

  it("never credits a payment that belongs to another checkout", async () => {
    const { redirect } = await startCheckout(session(), { purpose: "top_up", amountCents: 1000, method: "card" });
    const checkout = await checkoutBySession(checkoutIdFrom(redirect));
    dodoSessions[checkout.providerSessionId!] = { payment_id: "pay_other", payment_status: "succeeded" };
    dodoPayments.pay_other = { payment_id: "pay_other", status: "succeeded", total_amount: 1000, currency: "USD", metadata: { railor_checkout: "00000000-0000-0000-0000-000000000000" }, checkout_session_id: "cks_someone_else" };
    expect((await refreshCheckout(checkout, { force: true })).status).toBe("pending");
    expect(await walletBalanceCents(await getDb(), orgRow.id)).toBe(0);
  });

  it("records a declined card as failed with Dodo's reason", async () => {
    const { redirect } = await startCheckout(session(), { purpose: "top_up", amountCents: 1000, method: "card" });
    const checkout = await checkoutBySession(checkoutIdFrom(redirect));
    dodoSessions[checkout.providerSessionId!] = { payment_id: "pay_declined", payment_status: "failed" };
    dodoPayments.pay_declined = { payment_id: "pay_declined", status: "failed", total_amount: 1000, currency: "USD", metadata: { railor_checkout: checkout.id }, error_message: "Card declined" };
    const after = await refreshCheckout(checkout, { force: true });
    expect(after).toMatchObject({ status: "failed", failureReason: "Card declined" });
  });

  it("refuses amounts that aren't on the menu, and members who can't manage billing", async () => {
    await expect(startCheckout(session(), { purpose: "top_up", amountCents: 1, method: "card" })).rejects.toMatchObject({ code: "bad_amount" });
    await expect(startCheckout(session("member"), { purpose: "top_up", amountCents: 2500, method: "card" })).rejects.toBeInstanceOf(BillingError);
    expect(calls).toHaveLength(0);
  });
});

describe("a card plan", () => {
  async function subscribe(planId: "plus" | "pro") {
    const { redirect } = await startCheckout(session(), { purpose: "plan", plan: planId, method: "card" });
    const checkout = await checkoutBySession(checkoutIdFrom(redirect));
    dodoSessions[checkout.providerSessionId!] = { payment_id: `pay_${checkout.id.slice(0, 6)}`, payment_status: "succeeded" };
    dodoPayments[`pay_${checkout.id.slice(0, 6)}`] = { payment_id: `pay_${checkout.id.slice(0, 6)}`, status: "succeeded", total_amount: 299, currency: "USD", metadata: { railor_checkout: checkout.id }, subscription_id: `sub_${checkout.id.slice(0, 6)}` };
    dodoSubscriptions[`sub_${checkout.id.slice(0, 6)}`] = { subscription_id: `sub_${checkout.id.slice(0, 6)}`, status: "active", product_id: `pdt_${planId}`, next_billing_date: "2027-01-01T00:00:00Z", cancel_at_next_billing_date: false, metadata: { railor_checkout: checkout.id, railor_org: orgRow.id }, customer: { customer_id: "cus_1" } };
    return { checkout, subscriptionId: `sub_${checkout.id.slice(0, 6)}` };
  }

  it("subscribes with the plan's product and turns the plan on from the subscription Dodo reports", async () => {
    const { checkout } = await subscribe("plus");
    const created = calls.find((call) => call.method === "POST" && call.url.endsWith("/checkouts"))!;
    expect(created.body).toMatchObject({ product_cart: [{ product_id: "pdt_plus", quantity: 1 }] });
    expect((created.body!.product_cart as Array<Record<string, unknown>>)[0]).not.toHaveProperty("amount");
    expect(checkout.amountCents).toBe(299);
    await refreshCheckout(checkout, { force: true });
    const row = await plan();
    expect(row).toMatchObject({ plan: "plus", status: "active" });
    expect(row!.validUntil!.toISOString()).toBe("2027-01-03T00:00:00.000Z");
  });

  it("a renewal webhook moves the paid-through date on", async () => {
    const { checkout, subscriptionId } = await subscribe("plus");
    await refreshCheckout(checkout, { force: true });
    dodoSubscriptions[subscriptionId]!.next_billing_date = "2027-02-01T00:00:00Z";
    await handleDodoEvent({ type: "subscription.renewed", data: { subscription_id: subscriptionId } });
    expect((await plan())!.validUntil!.toISOString()).toBe("2027-02-03T00:00:00.000Z");
  });

  it("switching plans changes the one subscription instead of opening a second", async () => {
    const { checkout, subscriptionId } = await subscribe("plus");
    await refreshCheckout(checkout, { force: true });
    calls = [];
    const { redirect } = await startCheckout(session(), { purpose: "plan", plan: "pro", method: "card" });
    expect(redirect).toBe("/app/upgrade?billing=changed");
    expect(calls.some((call) => call.url.endsWith(`/subscriptions/${subscriptionId}/change-plan`) && call.body?.product_id === "pdt_pro")).toBe(true);
    expect(calls.some((call) => call.url.endsWith("/checkouts") && call.method === "POST")).toBe(false);
    expect((await plan())!.plan).toBe("pro");
    await expect(startCheckout(session(), { purpose: "plan", plan: "pro", method: "usdc" })).rejects.toMatchObject({ code: "has_subscription" });
  });
});

describe("USDC through ArcPay", () => {
  it("credits a top-up once the payment confirms for the exact amount", async () => {
    const { redirect } = await startCheckout(session(), { purpose: "top_up", amountCents: 5000, method: "usdc" });
    expect(redirect).toMatch(/^\/app\/billing\/return\?checkout=/);
    const db = await getDb();
    const [checkout] = await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, checkoutIdFrom(redirect)));
    const created = calls.find((call) => call.url.endsWith("/api/payments/create"))!;
    expect(created.body).toMatchObject({ amount: "50.00", currency: "USDC", idempotencyKey: checkout!.id });
    expect(JSON.parse(String(created.body!.metadata))).toMatchObject({ railor_checkout: checkout!.id });
    expect(checkout!.checkoutUrl).toBe(`https://arcpay.test/checkout/${checkout!.providerSessionId}`);

    arcPayments[checkout!.providerSessionId!]!.status = "confirmed";
    const body = JSON.stringify({ type: "payment.succeeded", data: { id: checkout!.providerSessionId } });
    await handleArcEvent(JSON.parse(body));
    await handleArcEvent(JSON.parse(body));
    expect(await walletBalanceCents(db, orgRow.id)).toBe(5000);
    expect((await walletHistory(db, orgRow.id))[0]).toMatchObject({ label: "Top-up · USDC (test)" });
  });

  it("refuses a confirmed payment for a different amount", async () => {
    const { redirect } = await startCheckout(session(), { purpose: "top_up", amountCents: 5000, method: "usdc" });
    const db = await getDb();
    const [checkout] = await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, checkoutIdFrom(redirect)));
    Object.assign(arcPayments[checkout!.providerSessionId!]!, { status: "confirmed", amount: "0.50" });
    const after = await refreshCheckout(checkout!, { force: true });
    expect(after.status).toBe("failed");
    expect(await walletBalanceCents(db, orgRow.id)).toBe(0);
  });

  it("a plan paid in USDC runs for one month", async () => {
    const { redirect } = await startCheckout(session(), { purpose: "plan", plan: "pro", method: "usdc" });
    const db = await getDb();
    const [checkout] = await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, checkoutIdFrom(redirect)));
    expect(calls.find((call) => call.url.endsWith("/api/payments/create"))!.body).toMatchObject({ amount: "9.99" });
    arcPayments[checkout!.providerSessionId!]!.status = "confirmed";
    const before = Date.now();
    await refreshCheckout(checkout!, { force: true });
    const row = await plan();
    expect(row!.plan).toBe("pro");
    const days = (row!.validUntil!.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
  });
});

describe("discount codes at checkout", () => {
  async function addCode(values: Partial<typeof discountCodes.$inferInsert> & { code: string }) {
    const db = await getDb();
    const [row] = await db.insert(discountCodes).values({ kind: "percent", percentBps: 5000, appliesTo: "any", ...values }).returning();
    return row!;
  }

  it("charges the discounted price in USDC, credits the full plan and counts the redemption", async () => {
    await addCode({ code: `HALF${sessionCount}` });
    const { redirect } = await startCheckout(session(), { purpose: "plan", plan: "pro", method: "usdc", discountCode: `half${sessionCount}` });
    const db = await getDb();
    const [checkout] = await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, checkoutIdFrom(redirect)));
    expect(checkout).toMatchObject({ amountCents: 999, chargeCents: 499 });
    expect(calls.find((call) => call.url.endsWith("/api/payments/create"))!.body).toMatchObject({ amount: "4.99" });
    arcPayments[checkout!.providerSessionId!]!.status = "confirmed";
    await refreshCheckout(checkout!, { force: true });
    expect((await plan())!.plan).toBe("pro");
    const used = await db.select().from(discountRedemptions).where(eq(discountRedemptions.checkoutId, checkout!.id));
    expect(used).toHaveLength(1);
    expect(used[0]!.discountCents).toBe(500);
  });

  it("passes the code to Dodo for card checkouts once it exists there, and refuses it before", async () => {
    const synced = await addCode({ code: `CARD${sessionCount}`, dodoDiscountId: "dsc_123" });
    await startCheckout(session(), { purpose: "plan", plan: "plus", method: "card", discountCode: synced.code });
    expect(calls.find((call) => call.url.endsWith("/checkouts"))!.body).toMatchObject({ discount_codes: [synced.code], feature_flags: { allow_discount_code: false } });
    const usdcOnly = await addCode({ code: `USDC${sessionCount}` });
    await expect(startCheckout(session(), { purpose: "plan", plan: "plus", method: "card", discountCode: usdcOnly.code })).rejects.toMatchObject({ code: "discount_card_unavailable" });
  });

  it("refuses unknown codes, codes for another purchase, and a USDC charge with nothing left to pay", async () => {
    await expect(startCheckout(session(), { purpose: "plan", plan: "pro", method: "usdc", discountCode: "NOSUCHCODE" })).rejects.toMatchObject({ code: "discount_invalid" });
    const topUps = await addCode({ code: `TOPUP${sessionCount}`, appliesTo: "top_up" });
    await expect(startCheckout(session(), { purpose: "plan", plan: "pro", method: "usdc", discountCode: topUps.code })).rejects.toMatchObject({ code: "discount_not_here" });
    const free = await addCode({ code: `FREE${sessionCount}`, percentBps: 10_000 });
    await expect(startCheckout(session(), { purpose: "plan", plan: "plus", method: "usdc", discountCode: free.code })).rejects.toMatchObject({ code: "discount_too_large" });
  });
});
