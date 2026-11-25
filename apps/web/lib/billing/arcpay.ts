/**
 * ArcPay, the stablecoin gateway on Arc: one USDC payment per checkout, read
 * back from ArcPay before Railor credits anything.
 *
 * ArcPay signs a webhook as hex HMAC-SHA256 of the raw body (`x-arc-signature`)
 * with no timestamp, so a signed event only tells Railor which payment to look
 * up; the payment's status, amount, currency and mode come from the API.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ArcPayConfig } from "./config";
import { BillingProviderError } from "./dodo";

const TIMEOUT_MS = 12_000;

async function call<T>(config: ArcPayConfig, method: "GET" | "POST", path: string, body?: unknown, fetcher: typeof fetch = fetch): Promise<T> {
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
    throw new BillingProviderError(`ArcPay did not answer: ${error instanceof Error ? error.message : "network error"}`);
  }
  const text = await response.text();
  if (!response.ok) throw new BillingProviderError(`ArcPay answered ${response.status} to ${method} ${path.replace(/\/[A-Za-z0-9_-]+$/, "/…")}: ${text.slice(0, 200)}`, response.status);
  return (text ? JSON.parse(text) : {}) as T;
}

/** "25.00" from 2500: ArcPay takes amounts as decimal strings. */
export const centsToDecimal = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

/** 2500 from "25.00" or 25; null when it isn't a whole number of cents. */
export function decimalToCents(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+(\.\d{1,6})?$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(number) || number <= 0) return null;
  const cents = Math.round(number * 100);
  return Math.abs(cents - number * 100) < 1e-6 ? cents : null;
}

export async function createArcPayment(config: ArcPayConfig, input: { amountCents: number; description: string; customerEmail: string; metadata: Record<string, string>; idempotencyKey: string }, fetcher?: typeof fetch): Promise<{ id: string; checkoutUrl: string }> {
  const response = await call<{ id?: string; checkout_url?: string }>(config, "POST", "/api/payments/create", {
    amount: centsToDecimal(input.amountCents),
    currency: "USDC",
    description: input.description,
    customerEmail: input.customerEmail,
    expiresInMinutes: 60,
    idempotencyKey: input.idempotencyKey,
    metadata: JSON.stringify(input.metadata),
  }, fetcher);
  if (!response.id || !response.checkout_url || !/^https?:\/\//.test(response.checkout_url)) throw new BillingProviderError("ArcPay returned no checkout page");
  return { id: response.id, checkoutUrl: response.checkout_url };
}

export interface ArcPayment {
  id: string;
  status: "created" | "pending" | "confirmed" | "failed" | "refunded" | "expired" | string;
  amount: string | number;
  currency: string;
  isTest?: boolean;
  metadata?: string | null;
  txHash?: string | null;
}

export async function getArcPayment(config: ArcPayConfig, id: string, fetcher?: typeof fetch): Promise<ArcPayment> {
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(id)) throw new BillingProviderError("Malformed ArcPay payment id");
  return call<ArcPayment>(config, "GET", `/api/payments/${id}`, undefined, fetcher);
}

/** The `railor_checkout` id ArcPay kept in the payment's metadata, if any. */
export function arcCheckoutId(payment: ArcPayment): string | null {
  if (!payment.metadata) return null;
  try {
    const parsed = JSON.parse(payment.metadata) as Record<string, unknown>;
    return typeof parsed.railor_checkout === "string" ? parsed.railor_checkout : null;
  } catch { return null; }
}

export function verifyArcWebhook(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature.trim())) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signature.trim(), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
