import "server-only";
/**
 * Paying Railor: plans and wallet top-ups by card or UPI (Dodo Payments) or
 * USDC (ArcPay).
 *
 * Railor never takes a provider's word from a redirect or a webhook body.
 * Both only say which checkout to look at; Railor then reads the payment (and,
 * for a card plan, the subscription) back from the provider's API with its own
 * key and applies it through `settleBillingCheckout`, which credits once.
 */
import {
  attachCheckoutSession,
  checkDiscountCode,
  createBillingCheckout,
  currentBillingSubscription,
  findBillingSubscription,
  findCheckoutBySession,
  getBillingCheckout,
  getDb,
  noteCheckoutChecked,
  priceWithDiscount,
  settleBillingCheckout,
  syncBillingSubscription,
  type BillingCheckout,
  type BillingPlan,
  type SubscriptionSnapshot,
} from "@railor/database";
import type { SessionContext } from "../auth";
import { getEntitlement } from "../entitlements";
import { PAID_PLANS, PLAN_PRICES, planName } from "../plans";
import { appOrigin } from "../security";
import { TOP_UP_AMOUNTS_CENTS } from "../wallet-options";
import { arcCheckoutId, createArcPayment, decimalToCents, getArcPayment } from "./arcpay";
import { arcpayConfig, dodoConfig, planForDodoProduct, type DodoConfig, type PayMethod } from "./config";
import { BillingProviderError, changeDodoPlan, createDodoCheckout, getDodoCheckout, getDodoPayment, getDodoSubscription, setDodoCancelAtPeriodEnd, type DodoSubscription } from "./dodo";

import { BILLING_ERROR_TEXT, BillingError } from "./errors";

export { BILLING_ERROR_TEXT, BillingError, type BillingErrorCode } from "./errors";

const managers = new Set(["owner", "admin"]);
const MIN_CHECK_GAP_MS = 4_000;

function requireManager(session: SessionContext) {
  if (!session.organization || !session.role || !managers.has(session.role)) throw new BillingError("forbidden", BILLING_ERROR_TEXT.forbidden);
  return session.organization;
}

const planPriceCents = (plan: BillingPlan) => Math.round(PLAN_PRICES[plan].monthlyUsd * 100);

function providerFailed(error: unknown): never {
  if (error instanceof BillingError) throw error;
  console.error("[billing]", error instanceof Error ? error.message : error);
  throw new BillingError("provider_unavailable", BILLING_ERROR_TEXT.provider_unavailable);
}

export interface CheckoutRequest {
  purpose: "plan" | "top_up";
  plan?: string | null;
  amountCents?: number | null;
  method: PayMethod;
  /** A Railor discount code the person entered, if any. */
  discountCode?: string | null;
}

/** Smallest USDC charge ArcPay is asked to collect, in cents. */
const MIN_USDC_CHARGE_CENTS = 100;

/** Opens a checkout and returns where to send the person: the provider's page, or Railor's status page for USDC. */
export async function startCheckout(session: SessionContext, request: CheckoutRequest): Promise<{ redirect: string }> {
  const organization = requireManager(session);
  const db = await getDb();
  let plan: BillingPlan | null = null;
  let amountCents: number;
  if (request.purpose === "plan") {
    if (!PAID_PLANS.includes(request.plan as BillingPlan)) throw new BillingError("unknown_plan", BILLING_ERROR_TEXT.unknown_plan);
    plan = request.plan as BillingPlan;
    amountCents = planPriceCents(plan);
    if ((await getEntitlement(organization.id, db)).plan === "founding") throw new BillingError("founding", BILLING_ERROR_TEXT.founding);
  } else {
    amountCents = Number(request.amountCents);
    if (!(TOP_UP_AMOUNTS_CENTS as readonly number[]).includes(amountCents)) throw new BillingError("bad_amount", BILLING_ERROR_TEXT.bad_amount);
  }
  let discount: { codeId: string; code: string; chargeCents: number; onDodo: boolean } | null = null;
  if (request.discountCode?.trim()) {
    const checked = await checkDiscountCode(db, { code: request.discountCode, organizationId: organization.id, purpose: request.purpose, plan });
    if (!checked.ok) {
      const misplaced = checked.reason === "wrong_purchase" || checked.reason === "wrong_plan";
      throw new BillingError(misplaced ? "discount_not_here" : "discount_invalid", BILLING_ERROR_TEXT[misplaced ? "discount_not_here" : "discount_invalid"]);
    }
    const { chargeCents } = priceWithDiscount(checked.code, amountCents);
    discount = { codeId: checked.code.id, code: checked.code.code, chargeCents, onDodo: Boolean(checked.code.dodoDiscountId) };
  }
  const subscription = plan ? await currentBillingSubscription(db, organization.id) : null;
  const renewing = subscription?.status === "active" ? subscription : null;
  const origin = appOrigin();
  const metadata = (id: string) => ({ railor_checkout: id, railor_org: organization.id, railor_purpose: request.purpose, ...(plan ? { railor_plan: plan } : {}) });

  if (request.method === "card") {
    const config = dodoConfig();
    const product = config ? (plan ? config.products[plan] : config.products.topUp) : null;
    if (!config || !product) throw new BillingError("method_unavailable", BILLING_ERROR_TEXT.method_unavailable);
    if (discount && !discount.onDodo) throw new BillingError("discount_card_unavailable", BILLING_ERROR_TEXT.discount_card_unavailable);
    if (plan && renewing) {
      // One subscription per workspace: changing plan moves it rather than opening a second one.
      if (discount) throw new BillingError("discount_not_here", BILLING_ERROR_TEXT.discount_not_here);
      if (renewing.plan === plan) throw new BillingError("already_on_plan", BILLING_ERROR_TEXT.already_on_plan);
      try {
        await changeDodoPlan(config, renewing.providerSubscriptionId, product);
        await reconcileDodoSubscription(renewing.providerSubscriptionId);
      } catch (error) { providerFailed(error); }
      return { redirect: "/app/upgrade?billing=changed" };
    }
    const checkout = await createBillingCheckout(db, { organizationId: organization.id, userId: session.user.id, provider: "dodo", purpose: request.purpose, plan, amountCents, testMode: config.testMode, discount: discount ? { codeId: discount.codeId, chargeCents: discount.chargeCents } : null });
    try {
      const created = await createDodoCheckout(config, {
        productId: product,
        amountCents: plan ? undefined : amountCents,
        customer: { email: session.user.email, name: session.user.name },
        returnUrl: `${origin}/app/billing/return?checkout=${checkout.id}`,
        cancelUrl: `${origin}${plan ? "/app/upgrade" : "/app/wallet"}`,
        metadata: metadata(checkout.id),
        discountCode: discount?.code ?? null,
      });
      await attachCheckoutSession(db, checkout.id, { providerSessionId: created.sessionId, checkoutUrl: created.checkoutUrl });
      return { redirect: created.checkoutUrl };
    } catch (error) { providerFailed(error); }
  }

  const config = arcpayConfig();
  if (!config) throw new BillingError("method_unavailable", BILLING_ERROR_TEXT.method_unavailable);
  if (renewing) throw new BillingError("has_subscription", BILLING_ERROR_TEXT.has_subscription);
  if (discount && discount.chargeCents < MIN_USDC_CHARGE_CENTS) throw new BillingError("discount_too_large", BILLING_ERROR_TEXT.discount_too_large);
  const checkout = await createBillingCheckout(db, { organizationId: organization.id, userId: session.user.id, provider: "arcpay", purpose: request.purpose, plan, amountCents, testMode: config.testMode, discount: discount ? { codeId: discount.codeId, chargeCents: discount.chargeCents } : null });
  try {
    const created = await createArcPayment(config, {
      // What the person pays: the price, less any discount. The checkout still records the full value bought.
      amountCents: discount?.chargeCents ?? amountCents,
      description: plan ? `Railor ${planName(plan)} plan, one month` : "Railor wallet top-up",
      customerEmail: session.user.email,
      metadata: metadata(checkout.id),
      idempotencyKey: checkout.id,
    });
    await attachCheckoutSession(db, checkout.id, { providerSessionId: created.id, checkoutUrl: created.checkoutUrl });
  } catch (error) { providerFailed(error); }
  // ArcPay has no return address, so Railor's status page opens its checkout and watches for the payment.
  return { redirect: `/app/billing/return?checkout=${checkout.id}` };
}

function snapshotFrom(subscription: DodoSubscription, plan: BillingPlan, testMode: boolean): Omit<SubscriptionSnapshot, "organizationId"> {
  const end = new Date(subscription.next_billing_date);
  return {
    providerSubscriptionId: subscription.subscription_id,
    providerCustomerId: subscription.customer?.customer_id ?? null,
    plan,
    status: subscription.status,
    currentPeriodEnd: Number.isNaN(end.getTime()) ? null : end,
    cancelAtPeriodEnd: subscription.cancel_at_next_billing_date === true,
    testMode,
  };
}

const topUpLabel = (checkout: BillingCheckout) => `Top-up · ${checkout.provider === "dodo" ? "card" : "USDC"}${checkout.testMode ? " (test)" : ""}`;

async function refreshDodo(config: DodoConfig, checkout: BillingCheckout, now: Date): Promise<void> {
  const db = await getDb();
  const sessionId = checkout.providerSessionId!;
  const status = await getDodoCheckout(config, sessionId);
  if (!status.payment_id) { await noteCheckoutChecked(db, checkout.id, { now }); return; }
  const payment = await getDodoPayment(config, status.payment_id);
  const belongs = payment.metadata?.railor_checkout === checkout.id || payment.checkout_session_id === sessionId;
  if (!belongs) {
    console.error("[billing] Dodo payment does not belong to the checkout it was found on", { checkout: checkout.id });
    await noteCheckoutChecked(db, checkout.id, { now });
    return;
  }
  const paymentStatus = payment.status ?? status.payment_status;
  if (paymentStatus === "failed" || paymentStatus === "cancelled") {
    await noteCheckoutChecked(db, checkout.id, { failed: payment.error_message?.slice(0, 200) || "The payment didn’t go through.", now });
    return;
  }
  if (paymentStatus !== "succeeded") { await noteCheckoutChecked(db, checkout.id, { now }); return; }
  if (checkout.purpose === "top_up") {
    await settleBillingCheckout(db, { checkoutId: checkout.id, providerPaymentId: payment.payment_id, effect: { kind: "top_up", label: topUpLabel(checkout) }, now });
    return;
  }
  const subscriptionId = payment.subscription_id ?? payment.subscription_ids?.[0];
  if (!subscriptionId) { await noteCheckoutChecked(db, checkout.id, { now }); return; }
  const subscription = await getDodoSubscription(config, subscriptionId);
  const plan = planForDodoProduct(config, subscription.product_id) ?? checkout.plan!;
  await settleBillingCheckout(db, { checkoutId: checkout.id, providerPaymentId: payment.payment_id, effect: { kind: "subscription", subscription: snapshotFrom(subscription, plan, config.testMode) }, now });
}

async function refreshArc(checkout: BillingCheckout, now: Date): Promise<void> {
  const config = arcpayConfig();
  if (!config) return;
  const db = await getDb();
  const payment = await getArcPayment(config, checkout.providerSessionId!);
  const tagged = arcCheckoutId(payment);
  if (payment.id !== checkout.providerSessionId || (tagged && tagged !== checkout.id)) {
    console.error("[billing] ArcPay payment does not match its checkout", { checkout: checkout.id });
    await noteCheckoutChecked(db, checkout.id, { now });
    return;
  }
  if (payment.status === "failed" || payment.status === "expired" || payment.status === "refunded") {
    await noteCheckoutChecked(db, checkout.id, { failed: payment.status === "expired" ? "The USDC checkout expired before it was paid." : "The USDC payment didn’t go through.", now });
    return;
  }
  if (payment.status !== "confirmed") { await noteCheckoutChecked(db, checkout.id, { now }); return; }
  const cents = decimalToCents(payment.amount);
  const modeMatches = payment.isTest === undefined || payment.isTest === checkout.testMode;
  if (cents !== (checkout.chargeCents ?? checkout.amountCents) || String(payment.currency).toUpperCase() !== "USDC" || !modeMatches) {
    console.error("[billing] ArcPay payment differs from what Railor priced", { checkout: checkout.id, cents, currency: payment.currency });
    await noteCheckoutChecked(db, checkout.id, { failed: "The USDC payment didn’t match the amount due. Contact us and we’ll sort it out.", now });
    return;
  }
  await settleBillingCheckout(db, {
    checkoutId: checkout.id,
    providerPaymentId: payment.id,
    effect: checkout.purpose === "top_up" ? { kind: "top_up", label: topUpLabel(checkout) } : { kind: "plan_month" },
    now,
  });
}

/**
 * Asks the provider about a checkout that isn't paid yet and applies what it
 * says. Polls are throttled per checkout; webhooks pass `force`.
 */
export async function refreshCheckout(checkout: BillingCheckout, options: { force?: boolean; now?: Date } = {}): Promise<BillingCheckout> {
  const now = options.now ?? new Date();
  if (checkout.status === "paid" || !checkout.providerSessionId) return checkout;
  if (!options.force && checkout.lastCheckedAt && now.getTime() - checkout.lastCheckedAt.getTime() < MIN_CHECK_GAP_MS) return checkout;
  try {
    if (checkout.provider === "dodo") {
      const config = dodoConfig();
      if (config) await refreshDodo(config, checkout, now);
    } else {
      await refreshArc(checkout, now);
    }
  } catch (error) {
    // A provider hiccup leaves the checkout pending; the next poll or webhook tries again.
    if (!(error instanceof BillingProviderError)) throw error;
    console.error("[billing]", error.message);
  }
  return (await getBillingCheckout(await getDb(), checkout.id)) ?? checkout;
}

/** Reads a card subscription from Dodo and keeps the workspace's plan in step with it. */
export async function reconcileDodoSubscription(subscriptionId: string): Promise<void> {
  const config = dodoConfig();
  if (!config) return;
  const db = await getDb();
  const subscription = await getDodoSubscription(config, subscriptionId);
  const plan = planForDodoProduct(config, subscription.product_id);
  if (!plan) { console.error("[billing] Dodo subscription for a product Railor doesn't sell", { product: subscription.product_id }); return; }
  let organizationId = (await findBillingSubscription(db, subscriptionId))?.organizationId ?? null;
  if (!organizationId) {
    const checkoutId = typeof subscription.metadata?.railor_checkout === "string" ? subscription.metadata.railor_checkout : null;
    const checkout = checkoutId ? await getBillingCheckout(db, checkoutId) : null;
    if (!checkout || checkout.provider !== "dodo" || checkout.purpose !== "plan" || subscription.metadata?.railor_org !== checkout.organizationId) return;
    if (checkout.status !== "paid") await refreshCheckout(checkout, { force: true });
    organizationId = checkout.organizationId;
  }
  await syncBillingSubscription(db, { organizationId, ...snapshotFrom(subscription, plan, config.testMode) });
}

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const text = (value: unknown) => (typeof value === "string" && value.length <= 200 ? value : null);

/** A verified Dodo webhook: find what it is about, then read it back from Dodo. */
export async function handleDodoEvent(event: unknown): Promise<void> {
  const body = record(event);
  const type = text(body.type) ?? "";
  const data = record(body.data);
  const db = await getDb();
  const subscriptionId = text(data.subscription_id);
  if (type.startsWith("payment.")) {
    const checkoutId = text(record(data.metadata).railor_checkout);
    const sessionId = text(data.checkout_session_id);
    const checkout = (checkoutId ? await getBillingCheckout(db, checkoutId) : null) ?? (sessionId ? await findCheckoutBySession(db, "dodo", sessionId) : null);
    if (checkout) await refreshCheckout(checkout, { force: true });
  }
  // Renewals, plan changes and cancellations all arrive with the subscription's id.
  if (subscriptionId && (type.startsWith("subscription.") || type === "payment.succeeded")) await reconcileDodoSubscription(subscriptionId);
}

/** A verified ArcPay webhook: look the payment up and apply it. */
export async function handleArcEvent(event: unknown): Promise<void> {
  const data = record(record(event).data);
  const paymentId = text(data.id) ?? text(data.paymentId);
  if (!paymentId) return;
  const checkout = await findCheckoutBySession(await getDb(), "arcpay", paymentId);
  if (checkout) await refreshCheckout(checkout, { force: true });
}

/** Stops or restarts the card plan's renewal at the end of the paid period. */
export async function setRenewal(session: SessionContext, cancel: boolean): Promise<void> {
  const organization = requireManager(session);
  const config = dodoConfig();
  const subscription = await currentBillingSubscription(await getDb(), organization.id);
  if (!config || !subscription) throw new BillingError("no_subscription", BILLING_ERROR_TEXT.no_subscription);
  try {
    await setDodoCancelAtPeriodEnd(config, subscription.providerSubscriptionId, cancel);
    await reconcileDodoSubscription(subscription.providerSubscriptionId);
  } catch (error) { providerFailed(error); }
}
