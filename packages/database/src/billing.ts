/**
 * Billing records: checkouts Railor opened with a payment provider, the card
 * subscriptions they created, and what a paid checkout turns on (wallet credit
 * or a plan period).
 *
 * Nothing here talks to a provider. Callers read the payment back from the
 * provider first and pass what it said; these functions make the effect
 * happen exactly once. A checkout turns "paid" through a conditional update
 * inside the same transaction as its effect, so a webhook and a status poll
 * racing each other add the credit or the plan time once, never twice.
 *
 * Functions take the database explicitly so they run in tests against a
 * throwaway PGlite.
 */
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { RailorDb } from "./client.js";
import {
  billingCheckouts,
  billingSubscriptions,
  organizationEntitlements,
  organizations,
  type BillingCheckout,
  type BillingPlan,
  type BillingProvider,
  type BillingPurpose,
  type BillingSubscription,
} from "./schema.js";
import { appendWalletEntry } from "./wallet.js";

/** A renewal is charged on the period's last day; this covers the hours until its webhook lands. */
export const SUBSCRIPTION_GRACE_MS = 2 * 86_400_000;

const PLANS: readonly BillingPlan[] = ["plus", "pro", "business"];
export const isBillingPlan = (value: unknown): value is BillingPlan => typeof value === "string" && (PLANS as readonly string[]).includes(value);

type Tx = RailorDb;

/** The same calendar day `months` later, clamped to the month's end (31 Jan + 1 → 28/29 Feb), in UTC. */
export function addMonthsUtc(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(from.getUTCDate(), lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds()));
}

async function lockOrganization(tx: Tx, organizationId: string): Promise<boolean> {
  const [row] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("update");
  return Boolean(row);
}

/* -------------------------------------------------------------------------- */
/* Checkouts                                                                   */
/* -------------------------------------------------------------------------- */

export interface NewBillingCheckout {
  organizationId: string;
  userId: string | null;
  provider: BillingProvider;
  purpose: BillingPurpose;
  plan?: BillingPlan | null;
  amountCents: number;
  testMode: boolean;
}

export async function createBillingCheckout(db: RailorDb, input: NewBillingCheckout): Promise<BillingCheckout> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new RangeError("amountCents must be a positive whole number of cents");
  if (input.purpose === "plan" && !isBillingPlan(input.plan)) throw new RangeError("A plan checkout needs a paid plan");
  const [row] = await db.insert(billingCheckouts).values({
    organizationId: input.organizationId,
    userId: input.userId,
    provider: input.provider,
    purpose: input.purpose,
    plan: input.purpose === "plan" ? input.plan! : null,
    amountCents: input.amountCents,
    testMode: input.testMode,
  }).returning();
  return row!;
}

/** Records the provider's session id and the page the customer pays on. */
export async function attachCheckoutSession(db: RailorDb, id: string, session: { providerSessionId: string; checkoutUrl: string | null }): Promise<BillingCheckout> {
  const [row] = await db.update(billingCheckouts)
    .set({ providerSessionId: session.providerSessionId, checkoutUrl: session.checkoutUrl, updatedAt: new Date() })
    .where(eq(billingCheckouts.id, id))
    .returning();
  if (!row) throw new Error("Checkout not found");
  return row;
}

export async function getBillingCheckout(db: RailorDb, id: string): Promise<BillingCheckout | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, id)).limit(1);
  return row ?? null;
}

export async function findCheckoutBySession(db: RailorDb, provider: BillingProvider, providerSessionId: string): Promise<BillingCheckout | null> {
  const [row] = await db.select().from(billingCheckouts)
    .where(and(eq(billingCheckouts.provider, provider), eq(billingCheckouts.providerSessionId, providerSessionId)))
    .limit(1);
  return row ?? null;
}

/** Notes when Railor last asked the provider, and why the last attempt failed, if it did. A paid checkout stays paid. */
export async function noteCheckoutChecked(db: RailorDb, id: string, update: { failed?: string | null; now?: Date } = {}): Promise<void> {
  const now = update.now ?? new Date();
  await db.update(billingCheckouts)
    .set(update.failed === undefined
      ? { lastCheckedAt: now, updatedAt: now }
      : { lastCheckedAt: now, updatedAt: now, failureReason: update.failed, status: update.failed ? "failed" : "pending" })
    .where(and(eq(billingCheckouts.id, id), ne(billingCheckouts.status, "paid")));
}

export async function recentBillingCheckouts(db: RailorDb, organizationId: string, limit = 20): Promise<BillingCheckout[]> {
  return db.select().from(billingCheckouts)
    .where(eq(billingCheckouts.organizationId, organizationId))
    .orderBy(desc(billingCheckouts.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

/* -------------------------------------------------------------------------- */
/* Plan periods                                                                */
/* -------------------------------------------------------------------------- */

export type PlanPeriod =
  /** Pay-once month (USDC): adds to time left on the same plan, else starts now. */
  | { mode: "extend"; months: number }
  /** Card subscription: paid through `until`. Never shortens time already paid for on the same plan. */
  | { mode: "until"; until: Date };

export type PlanApplied = { applied: true; plan: BillingPlan; validUntil: Date } | { applied: false; reason: "founding" | "organization_missing" | "expired_period" };

async function applyPlanPeriodTx(tx: Tx, input: { organizationId: string; plan: BillingPlan; period: PlanPeriod; reference: string; userId?: string | null; now: Date }): Promise<PlanApplied> {
  const { now } = input;
  const [existing] = await tx.select().from(organizationEntitlements).where(eq(organizationEntitlements.organizationId, input.organizationId)).limit(1);
  const live = existing && existing.status === "active" && existing.validFrom <= now && existing.validUntil !== null && existing.validUntil > now;
  // The original $29 Founding plan outranks every self-serve plan; a payment never replaces it.
  if (live && existing.plan === "founding") return { applied: false, reason: "founding" };
  const samePlan = Boolean(live && existing.plan === input.plan);
  let validUntil: Date;
  if (input.period.mode === "extend") {
    validUntil = addMonthsUtc(samePlan ? existing!.validUntil! : now, input.period.months);
  } else {
    if (input.period.until <= now) return { applied: false, reason: "expired_period" };
    validUntil = samePlan && existing!.validUntil! > input.period.until ? existing!.validUntil! : input.period.until;
  }
  const values = {
    plan: input.plan,
    status: "active" as const,
    validFrom: samePlan ? existing!.validFrom : now,
    validUntil,
    activationReference: input.reference,
    activatedBy: input.userId ?? null,
    updatedAt: now,
  };
  await tx.insert(organizationEntitlements).values({ organizationId: input.organizationId, ...values })
    .onConflictDoUpdate({ target: organizationEntitlements.organizationId, set: values });
  return { applied: true, plan: input.plan, validUntil };
}

/** Turns on or lengthens a plan for a workspace, serialized on the workspace row. */
export async function applyPlanPeriod(db: RailorDb, input: { organizationId: string; plan: BillingPlan; period: PlanPeriod; reference: string; userId?: string | null; now?: Date }): Promise<PlanApplied> {
  return db.transaction(async (tx) => {
    const conn = tx as unknown as Tx;
    if (!(await lockOrganization(conn, input.organizationId))) return { applied: false, reason: "organization_missing" } as const;
    return applyPlanPeriodTx(conn, { ...input, now: input.now ?? new Date() });
  });
}

/* -------------------------------------------------------------------------- */
/* Card subscriptions                                                          */
/* -------------------------------------------------------------------------- */

export interface SubscriptionSnapshot {
  organizationId: string;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  plan: BillingPlan;
  /** The provider's status word. Only "active" turns plan time on. */
  status: string;
  /** When the paid period ends (the next billing date). */
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  testMode: boolean;
}

async function syncSubscriptionTx(tx: Tx, snapshot: SubscriptionSnapshot, now: Date): Promise<PlanApplied | null> {
  const values = {
    providerCustomerId: snapshot.providerCustomerId,
    plan: snapshot.plan,
    status: snapshot.status,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    testMode: snapshot.testMode,
    updatedAt: now,
  };
  // The workspace a subscription belongs to is fixed at its first record: an
  // update claiming another workspace changes nothing and returns no row.
  const [row] = await tx.insert(billingSubscriptions)
    .values({ organizationId: snapshot.organizationId, provider: "dodo", providerSubscriptionId: snapshot.providerSubscriptionId, ...values })
    .onConflictDoUpdate({
      target: [billingSubscriptions.provider, billingSubscriptions.providerSubscriptionId],
      set: values,
      setWhere: eq(billingSubscriptions.organizationId, snapshot.organizationId),
    })
    .returning();
  if (!row || row.organizationId !== snapshot.organizationId) return null;
  // Cancelled, paused or failed subscriptions keep the time already paid for and simply don't renew it.
  if (snapshot.status !== "active" || !snapshot.currentPeriodEnd) return null;
  return applyPlanPeriodTx(tx, {
    organizationId: snapshot.organizationId,
    plan: snapshot.plan,
    period: { mode: "until", until: new Date(snapshot.currentPeriodEnd.getTime() + SUBSCRIPTION_GRACE_MS) },
    reference: `dodo:${snapshot.providerSubscriptionId}`,
    now,
  });
}

/** Records what the provider says about a subscription and, while it is active, keeps the plan paid through its period. */
export async function syncBillingSubscription(db: RailorDb, snapshot: SubscriptionSnapshot, now = new Date()): Promise<PlanApplied | null> {
  return db.transaction(async (tx) => {
    const conn = tx as unknown as Tx;
    if (!(await lockOrganization(conn, snapshot.organizationId))) return null;
    return syncSubscriptionTx(conn, snapshot, now);
  });
}

export async function findBillingSubscription(db: RailorDb, providerSubscriptionId: string): Promise<BillingSubscription | null> {
  const [row] = await db.select().from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.provider, "dodo"), eq(billingSubscriptions.providerSubscriptionId, providerSubscriptionId)))
    .limit(1);
  return row ?? null;
}

/** The workspace's subscription that still renews or still has paid time, newest first. */
export async function currentBillingSubscription(db: RailorDb, organizationId: string, now = new Date()): Promise<BillingSubscription | null> {
  const [row] = await db.select().from(billingSubscriptions)
    .where(and(
      eq(billingSubscriptions.organizationId, organizationId),
      inArray(billingSubscriptions.status, ["active", "on_hold", "past_due", "paused"]),
      sql`(${billingSubscriptions.currentPeriodEnd} is null or ${billingSubscriptions.currentPeriodEnd} > ${now})`,
    ))
    .orderBy(desc(billingSubscriptions.updatedAt))
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/* Settling a checkout                                                         */
/* -------------------------------------------------------------------------- */

export type CheckoutEffect =
  | { kind: "top_up"; label: string }
  | { kind: "plan_month" }
  | { kind: "subscription"; subscription: Omit<SubscriptionSnapshot, "organizationId"> };

export type Settlement =
  | { settled: true; checkout: BillingCheckout; plan: PlanApplied | null }
  | { settled: false; checkout: BillingCheckout | null };

/**
 * Marks a checkout paid and applies what was bought, once. Call it only after
 * reading the payment back from the provider. A second call for the same
 * checkout, from a retried webhook or a poll, returns `settled: false`.
 */
export async function settleBillingCheckout(
  db: RailorDb,
  input: { checkoutId: string; providerPaymentId: string; effect: CheckoutEffect; now?: Date },
): Promise<Settlement> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const conn = tx as unknown as Tx;
    const [before] = await conn.select().from(billingCheckouts).where(eq(billingCheckouts.id, input.checkoutId)).limit(1);
    if (!before) return { settled: false, checkout: null } as const;
    await lockOrganization(conn, before.organizationId);
    const [checkout] = await conn.update(billingCheckouts)
      .set({
        status: "paid",
        paidAt: now,
        providerPaymentId: input.providerPaymentId,
        providerSubscriptionId: input.effect.kind === "subscription" ? input.effect.subscription.providerSubscriptionId : before.providerSubscriptionId,
        failureReason: null,
        lastCheckedAt: now,
        updatedAt: now,
      })
      .where(and(eq(billingCheckouts.id, input.checkoutId), ne(billingCheckouts.status, "paid")))
      .returning();
    if (!checkout) {
      const [current] = await conn.select().from(billingCheckouts).where(eq(billingCheckouts.id, input.checkoutId)).limit(1);
      return { settled: false, checkout: current ?? null } as const;
    }
    let plan: PlanApplied | null = null;
    if (input.effect.kind === "top_up") {
      if (checkout.purpose !== "top_up") throw new Error("Checkout is not a top-up");
      await appendWalletEntry(conn, {
        organizationId: checkout.organizationId,
        userId: checkout.userId,
        kind: "top_up",
        amountCents: checkout.amountCents,
        label: input.effect.label,
        reference: input.providerPaymentId,
        idempotencyKey: `checkout:${checkout.id}`,
        metadata: { provider: checkout.provider, checkoutId: checkout.id, testMode: checkout.testMode },
      });
    } else {
      if (checkout.purpose !== "plan" || !isBillingPlan(checkout.plan)) throw new Error("Checkout is not a plan");
      plan = input.effect.kind === "plan_month"
        ? await applyPlanPeriodTx(conn, { organizationId: checkout.organizationId, plan: checkout.plan, period: { mode: "extend", months: 1 }, reference: `${checkout.provider}:${input.providerPaymentId}`, userId: checkout.userId, now })
        : await syncSubscriptionTx(conn, { ...input.effect.subscription, organizationId: checkout.organizationId }, now);
    }
    return { settled: true, checkout, plan } as const;
  });
}
