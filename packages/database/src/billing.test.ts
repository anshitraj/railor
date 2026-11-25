/**
 * Billing records against a throwaway in-memory PGlite with every migration
 * applied. Run: pnpm --filter @railor/database test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import type { RailorDb } from "./client.js";
import * as schema from "./schema.js";
import {
  SUBSCRIPTION_GRACE_MS,
  addMonthsUtc,
  applyPlanPeriod,
  attachCheckoutSession,
  createBillingCheckout,
  currentBillingSubscription,
  findCheckoutBySession,
  noteCheckoutChecked,
  settleBillingCheckout,
  syncBillingSubscription,
} from "./billing.js";
import { walletBalanceCents, walletHistory } from "./wallet.js";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as RailorDb;
const NOW = new Date("2026-11-25T10:00:00Z");
const DAY = 86_400_000;

async function org(name: string) {
  const [row] = await db.insert(schema.organizations).values({ name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${Math.random().toString(36).slice(2, 8)}` }).returning();
  return row!.id;
}
async function entitlement(organizationId: string) {
  const [row] = await db.select().from(schema.organizationEntitlements).where(eq(schema.organizationEntitlements.organizationId, organizationId)).limit(1);
  return row ?? null;
}

before(async () => { await migrate(db as never, { migrationsFolder }); });
after(async () => { await client.close(); });

describe("calendar months", () => {
  it("keeps the day and clamps to the end of a shorter month", () => {
    assert.equal(addMonthsUtc(new Date("2026-11-25T10:00:00Z"), 1).toISOString(), "2026-12-25T10:00:00.000Z");
    assert.equal(addMonthsUtc(new Date("2027-01-31T00:00:00Z"), 1).toISOString(), "2027-02-28T00:00:00.000Z");
    assert.equal(addMonthsUtc(new Date("2026-12-15T00:00:00Z"), 1).toISOString(), "2027-01-15T00:00:00.000Z");
  });
});

describe("wallet top-up checkouts", () => {
  it("credits the priced amount once, however many times it is settled", async () => {
    const o = await org("Top up once");
    const checkout = await createBillingCheckout(db, { organizationId: o, userId: null, provider: "dodo", purpose: "top_up", amountCents: 2500, testMode: true });
    await attachCheckoutSession(db, checkout.id, { providerSessionId: "cks_once", checkoutUrl: "https://test.checkout.dodopayments.com/session/cks_once" });
    assert.equal((await findCheckoutBySession(db, "dodo", "cks_once"))?.id, checkout.id);
    const settle = () => settleBillingCheckout(db, { checkoutId: checkout.id, providerPaymentId: "pay_1", effect: { kind: "top_up", label: "Top-up · card" }, now: NOW });
    const results = await Promise.all([settle(), settle(), settle()]);
    assert.equal(results.filter((r) => r.settled).length, 1);
    assert.equal((await settle()).settled, false);
    assert.equal(await walletBalanceCents(db, o), 2500);
    const [entry] = await walletHistory(db, o);
    assert.equal(entry!.kind, "top_up");
    assert.equal(entry!.label, "Top-up · card");
    assert.equal(entry!.reference, "pay_1");
  });

  it("can settle after a failed attempt, but a failure never un-pays a paid checkout", async () => {
    const o = await org("Failed then paid");
    const checkout = await createBillingCheckout(db, { organizationId: o, userId: null, provider: "arcpay", purpose: "top_up", amountCents: 1000, testMode: false });
    await noteCheckoutChecked(db, checkout.id, { failed: "Card declined", now: NOW });
    assert.equal((await settleBillingCheckout(db, { checkoutId: checkout.id, providerPaymentId: "arc_1", effect: { kind: "top_up", label: "Top-up · USDC" }, now: NOW })).settled, true);
    await noteCheckoutChecked(db, checkout.id, { failed: "late failure", now: NOW });
    const [row] = await db.select().from(schema.billingCheckouts).where(eq(schema.billingCheckouts.id, checkout.id));
    assert.equal(row!.status, "paid");
    assert.equal(row!.failureReason, null);
  });

  it("rejects a plan checkout with no plan and a top-up of nothing", async () => {
    const o = await org("Bad checkouts");
    await assert.rejects(createBillingCheckout(db, { organizationId: o, userId: null, provider: "dodo", purpose: "plan", amountCents: 999, testMode: true }));
    await assert.rejects(createBillingCheckout(db, { organizationId: o, userId: null, provider: "dodo", purpose: "top_up", amountCents: 0, testMode: true }));
  });
});

describe("plan checkouts", () => {
  it("a USDC month starts now, and a second month on the same plan adds to the first", async () => {
    const o = await org("Month by month");
    const first = await createBillingCheckout(db, { organizationId: o, userId: null, provider: "arcpay", purpose: "plan", plan: "pro", amountCents: 999, testMode: false });
    const a = await settleBillingCheckout(db, { checkoutId: first.id, providerPaymentId: "arc_a", effect: { kind: "plan_month" }, now: NOW });
    assert.equal(a.settled && a.plan?.applied && a.plan.validUntil.toISOString(), "2026-12-25T10:00:00.000Z");
    const second = await createBillingCheckout(db, { organizationId: o, userId: null, provider: "arcpay", purpose: "plan", plan: "pro", amountCents: 999, testMode: false });
    await settleBillingCheckout(db, { checkoutId: second.id, providerPaymentId: "arc_b", effect: { kind: "plan_month" }, now: new Date(NOW.getTime() + 3 * DAY) });
    const row = await entitlement(o);
    assert.equal(row!.plan, "pro");
    assert.equal(row!.validUntil!.toISOString(), "2027-01-25T10:00:00.000Z");
    assert.equal(row!.validFrom.toISOString(), NOW.toISOString());
    assert.equal(row!.activationReference, "arcpay:arc_b");
  });

  it("never replaces a Founding plan", async () => {
    const o = await org("Founder");
    await db.insert(schema.organizationEntitlements).values({ organizationId: o, plan: "founding", validFrom: new Date(NOW.getTime() - DAY), validUntil: new Date(NOW.getTime() + 300 * DAY) });
    const result = await applyPlanPeriod(db, { organizationId: o, plan: "plus", period: { mode: "extend", months: 1 }, reference: "arcpay:x", now: NOW });
    assert.deepEqual(result, { applied: false, reason: "founding" });
    assert.equal((await entitlement(o))!.plan, "founding");
  });
});

describe("card subscriptions", () => {
  const periodEnd = new Date("2026-12-25T10:00:00Z");
  const snapshot = (organizationId: string, over: Partial<Parameters<typeof syncBillingSubscription>[1]> = {}) => ({
    organizationId,
    providerSubscriptionId: `sub_${organizationId.slice(0, 8)}`,
    providerCustomerId: "cus_1",
    plan: "plus" as const,
    status: "active",
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    testMode: true,
    ...over,
  });

  it("a paid subscription checkout turns the plan on through its period plus a short grace", async () => {
    const o = await org("Card sub");
    const checkout = await createBillingCheckout(db, { organizationId: o, userId: null, provider: "dodo", purpose: "plan", plan: "plus", amountCents: 299, testMode: true });
    const { organizationId: _, ...sub } = snapshot(o);
    const result = await settleBillingCheckout(db, { checkoutId: checkout.id, providerPaymentId: "pay_sub", effect: { kind: "subscription", subscription: sub }, now: NOW });
    assert.equal(result.settled, true);
    const row = await entitlement(o);
    assert.equal(row!.plan, "plus");
    assert.equal(row!.validUntil!.getTime(), periodEnd.getTime() + SUBSCRIPTION_GRACE_MS);
    assert.equal(row!.activationReference, `dodo:${sub.providerSubscriptionId}`);
    const current = await currentBillingSubscription(db, o, NOW);
    assert.equal(current?.providerSubscriptionId, sub.providerSubscriptionId);
    const [paid] = await db.select().from(schema.billingCheckouts).where(eq(schema.billingCheckouts.id, checkout.id));
    assert.equal(paid!.providerSubscriptionId, sub.providerSubscriptionId);
  });

  it("a renewal moves the period on; a cancellation keeps the time already paid for", async () => {
    const o = await org("Renew then cancel");
    await syncBillingSubscription(db, snapshot(o), NOW);
    const nextEnd = new Date("2027-01-25T10:00:00Z");
    await syncBillingSubscription(db, snapshot(o, { currentPeriodEnd: nextEnd }), new Date("2026-12-25T10:05:00Z"));
    assert.equal((await entitlement(o))!.validUntil!.getTime(), nextEnd.getTime() + SUBSCRIPTION_GRACE_MS);
    await syncBillingSubscription(db, snapshot(o, { status: "cancelled", currentPeriodEnd: nextEnd, cancelAtPeriodEnd: true }), new Date("2026-12-30T00:00:00Z"));
    assert.equal((await entitlement(o))!.validUntil!.getTime(), nextEnd.getTime() + SUBSCRIPTION_GRACE_MS);
    assert.equal(await currentBillingSubscription(db, o, new Date("2026-12-30T00:00:00Z")), null);
  });

  it("an old event replayed late never shortens the paid period", async () => {
    const o = await org("Replay");
    await syncBillingSubscription(db, snapshot(o, { currentPeriodEnd: new Date("2027-01-25T10:00:00Z") }), NOW);
    await syncBillingSubscription(db, snapshot(o, { currentPeriodEnd: periodEnd }), NOW);
    assert.equal((await entitlement(o))!.validUntil!.toISOString(), new Date(new Date("2027-01-25T10:00:00Z").getTime() + SUBSCRIPTION_GRACE_MS).toISOString());
  });

  it("a plan change moves the workspace to the new plan", async () => {
    const o = await org("Upgrade");
    await syncBillingSubscription(db, snapshot(o), NOW);
    await syncBillingSubscription(db, snapshot(o, { plan: "business" }), new Date(NOW.getTime() + DAY));
    assert.equal((await entitlement(o))!.plan, "business");
  });

  it("a subscription stays with the workspace it was first recorded for", async () => {
    const owner = await org("Owner");
    const other = await org("Other");
    await syncBillingSubscription(db, snapshot(owner, { providerSubscriptionId: "sub_shared" }), NOW);
    const result = await syncBillingSubscription(db, snapshot(other, { providerSubscriptionId: "sub_shared", plan: "business" }), NOW);
    assert.equal(result, null);
    assert.equal(await entitlement(other), null);
    const [kept] = await db.select().from(schema.billingSubscriptions).where(eq(schema.billingSubscriptions.providerSubscriptionId, "sub_shared"));
    assert.equal(kept!.organizationId, owner);
    assert.equal(kept!.plan, "plus");
  });
});
