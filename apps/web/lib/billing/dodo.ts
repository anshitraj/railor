/**
 * Dodo Payments, over its REST API: checkout sessions for card and UPI
 * payments, and the payment and subscription records Railor reads back before
 * it credits anything. https://docs.dodopayments.com/api-reference
 *
 * Webhooks follow the Standard Webhooks scheme: HMAC-SHA256 over
 * `{webhook-id}.{webhook-timestamp}.{raw body}` with the base64 secret after
 * `whsec_`, sent as space-separated `v1,<base64>` signatures.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { DodoConfig } from "./config";

export class BillingProviderError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

const TIMEOUT_MS = 12_000;

async function call<T>(config: DodoConfig, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, fetcher: typeof fetch = fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(`${config.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new BillingProviderError(`Dodo Payments did not answer: ${error instanceof Error ? error.message : "network error"}`);
  }
  const text = await response.text();
  if (!response.ok) {
    // Keep the provider's words out of logs beyond a short excerpt; they never reach the browser.
    throw new BillingProviderError(`Dodo Payments answered ${response.status} to ${method} ${path.replace(/\/[A-Za-z0-9_]+$/, "/…")}: ${text.slice(0, 200)}`, response.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface DodoCheckoutInput {
  productId: string;
  /** Pay-what-you-want amount in US cents (wallet top-ups). */
  amountCents?: number;
  customer: { email: string; name?: string | null };
  returnUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  /** A Railor discount code that also exists at Dodo; Dodo charges the discounted price. */
  discountCode?: string | null;
}

export async function createDodoCheckout(config: DodoConfig, input: DodoCheckoutInput, fetcher?: typeof fetch): Promise<{ sessionId: string; checkoutUrl: string }> {
  const response = await call<{ session_id?: string; checkout_url?: string | null }>(config, "POST", "/checkouts", {
    product_cart: [{ product_id: input.productId, quantity: 1, ...(input.amountCents ? { amount: input.amountCents } : {}) }],
    customer: { email: input.customer.email, ...(input.customer.name ? { name: input.customer.name } : {}) },
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    metadata: input.metadata,
    // The code is applied by Railor and locked; customers can't type their own at Dodo.
    ...(input.discountCode ? { discount_codes: [input.discountCode] } : {}),
    feature_flags: { allow_discount_code: false },
  }, fetcher);
  if (!response.session_id || !response.checkout_url || !/^https:\/\//.test(response.checkout_url)) throw new BillingProviderError("Dodo Payments returned no checkout page");
  return { sessionId: response.session_id, checkoutUrl: response.checkout_url };
}

export interface DodoCheckoutStatus { id: string; payment_id?: string | null; payment_status?: string | null }
export interface DodoPayment {
  payment_id: string;
  status?: string | null;
  total_amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
  checkout_session_id?: string | null;
  subscription_id?: string | null;
  subscription_ids?: string[];
  error_message?: string | null;
  customer?: { customer_id?: string; email?: string };
}
export interface DodoSubscription {
  subscription_id: string;
  status: string;
  product_id: string;
  next_billing_date: string;
  cancel_at_next_billing_date: boolean;
  metadata?: Record<string, unknown>;
  customer?: { customer_id?: string; email?: string };
}

const safeId = (id: string) => { if (!/^[A-Za-z0-9_-]{3,100}$/.test(id)) throw new BillingProviderError("Malformed provider id"); return id; };

export const getDodoCheckout = (config: DodoConfig, sessionId: string, fetcher?: typeof fetch) => call<DodoCheckoutStatus>(config, "GET", `/checkouts/${safeId(sessionId)}`, undefined, fetcher);
export const getDodoPayment = (config: DodoConfig, paymentId: string, fetcher?: typeof fetch) => call<DodoPayment>(config, "GET", `/payments/${safeId(paymentId)}`, undefined, fetcher);
export const getDodoSubscription = (config: DodoConfig, subscriptionId: string, fetcher?: typeof fetch) => call<DodoSubscription>(config, "GET", `/subscriptions/${safeId(subscriptionId)}`, undefined, fetcher);

/** Moves a live subscription to another plan, charging or crediting the difference now. */
export async function changeDodoPlan(config: DodoConfig, subscriptionId: string, productId: string, fetcher?: typeof fetch): Promise<void> {
  await call(config, "POST", `/subscriptions/${safeId(subscriptionId)}/change-plan`, { product_id: productId, quantity: 1, proration_billing_mode: "prorated_immediately" }, fetcher);
}

/** Stops (or restarts) renewal at the end of the paid period. */
export async function setDodoCancelAtPeriodEnd(config: DodoConfig, subscriptionId: string, cancel: boolean, fetcher?: typeof fetch): Promise<void> {
  await call(config, "PATCH", `/subscriptions/${safeId(subscriptionId)}`, { cancel_at_next_billing_date: cancel, ...(cancel ? { cancel_reason: "cancelled_by_customer" } : {}) }, fetcher);
}

/** Standard Webhooks signature check, with a five-minute replay window. */
export function verifyDodoWebhook(rawBody: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, secret: string, now = Date.now()): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  let key: Buffer;
  try {
    key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  } catch { return false; }
  if (!key.length) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export interface DodoDiscountInput {
  code: string;
  name: string;
  kind: "percent" | "amount";
  percentBps?: number | null;
  amountOffCents?: number | null;
  /** Products the code may be used on; empty means any. */
  productIds: string[];
  /** Billing cycles a subscription keeps the discount for. */
  cycles: number;
  usageLimit?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

/** Creates the same code at Dodo so card checkouts charge the discounted price. */
export async function createDodoDiscount(config: DodoConfig, input: DodoDiscountInput, fetcher?: typeof fetch): Promise<string> {
  const flat = input.kind === "amount";
  const response = await call<{ discount_id?: string }>(config, "POST", "/discounts", {
    code: input.code,
    name: input.name.slice(0, 80),
    type: flat ? "flat" : "percentage",
    amount: flat ? input.amountOffCents : input.percentBps,
    ...(flat ? { currency_options: [{ currency: "USD", is_default: true, max_amount_possible: input.amountOffCents, minimum_subtotal: 0 }] } : {}),
    ...(input.productIds.length ? { restricted_to: input.productIds } : {}),
    subscription_cycles: input.cycles,
    ...(input.usageLimit ? { usage_limit: input.usageLimit } : {}),
    ...(input.startsAt ? { starts_at: input.startsAt.toISOString() } : {}),
    ...(input.endsAt ? { expires_at: input.endsAt.toISOString() } : {}),
    metadata: { railor: "discount_code" },
  }, fetcher);
  if (!response.discount_id) throw new BillingProviderError("Dodo Payments returned no discount id");
  return response.discount_id;
}

/** Removes a code at Dodo, so it can't be used for card payments any more. */
export async function deleteDodoDiscount(config: DodoConfig, discountId: string, fetcher?: typeof fetch): Promise<void> {
  await call(config, "DELETE", `/discounts/${encodeURIComponent(discountId)}`, undefined, fetcher);
}
