import type { PayoutOutcome } from "./types.js";

/**
 * One place that turns a provider HTTP call into a PayoutOutcome, so every
 * adapter classifies failures the same way:
 *   network error / timeout / 5xx / 409 → unknown (may have been accepted; reconcile, never re-route)
 *   403                                → rejected, NOT retryable elsewhere (compliance / permission: never route around it)
 *   other 4xx                          → rejected, retryable elsewhere (validation, funds, unsupported corridor)
 */
export async function providerRequest(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<{ ok: true; status: number; body: Record<string, unknown> } | { ok: false; outcome: Extract<PayoutOutcome, { kind: "rejected" | "unknown" }> }> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 20_000), redirect: "error" });
  } catch (error) {
    return { ok: false, outcome: { kind: "unknown", message: `No response from provider (${error instanceof Error ? error.name : "network error"}).` } };
  }
  let body: Record<string, unknown> = {};
  try {
    const text = await response.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (response.ok) return { ok: true, status: response.status, body };
  const message = providerMessage(body) ?? `HTTP ${response.status}`;
  if (response.status === 429) {
    return { ok: false, outcome: { kind: "rejected", code: "provider_rate_limited", message, retryableElsewhere: true } };
  }
  if (response.status >= 500 || response.status === 409 || response.status === 408) {
    return { ok: false, outcome: { kind: "unknown", message: `Provider did not confirm the outcome (${message}).` } };
  }
  if (response.status === 403) {
    return { ok: false, outcome: { kind: "rejected", code: "provider_forbidden", message, retryableElsewhere: false } };
  }
  if (response.status === 401) {
    return { ok: false, outcome: { kind: "rejected", code: "provider_auth_failed", message: `Credentials rejected: ${message}`, retryableElsewhere: true } };
  }
  return { ok: false, outcome: { kind: "rejected", code: `provider_${response.status}`, message, retryableElsewhere: true } };
}

function providerMessage(body: Record<string, unknown>): string | undefined {
  const candidates = [body.message, body.error, (body.error as { message?: unknown } | undefined)?.message, body.code];
  const found = candidates.find((v) => typeof v === "string" && v.trim());
  // Provider bodies can echo request data; keep only a short, single-line message.
  return typeof found === "string" ? found.replace(/\s+/g, " ").slice(0, 240) : undefined;
}

/**
 * The amount as it goes to a provider. Payments store 8 fraction digits ("1000.00000000"); providers
 * expect the amount as a person would write it: trailing zeros dropped, never fewer than two digits.
 */
export function wireAmount(stored: string): string {
  const [whole = "0", fraction = ""] = stored.trim().split(".");
  return `${whole}.${fraction.replace(/0+$/, "").padEnd(2, "0")}`;
}

/** Fraction digits a currency uses (2 for USD, 0 for JPY, 3 for KWD). */
export function currencyScale(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Decimal string with at most `scale` fraction digits — providers reject floats and over-precise amounts. */
export function toDecimalString(amount: string | number, scale = 2): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Amount must be a positive number.");
  return n.toFixed(scale);
}
