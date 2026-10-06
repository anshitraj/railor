import type { PayoutAdapter, PayoutOutcome, PayoutRequest, PayoutStatusResult } from "../types.js";

/**
 * Railor's test-mode rail. It never touches a network or a bank: it stands in
 * for a provider in test mode when the organization has not connected that
 * provider's own sandbox, so the whole flow (policy → route → submit →
 * webhooks → reconcile) can be exercised end to end.
 *
 * Deterministic by amount, like card test numbers — the cents pick the story:
 *   .13  rejected: insufficient funds (retryable elsewhere → exercises fallback)
 *   .66  rejected: compliance (never retried elsewhere)
 *   .55  accepted, awaiting funds (deposit instructions), then processing, then completed
 *   .77  completed, then returned by the beneficiary bank
 *   .99  outcome unknown (simulated timeout); reconciliation later finds it completed
 *   anything else: processing, completed ~20 seconds after acceptance
 *
 * Status is derived from the reference itself (scenario + acceptance time),
 * so reconciliation needs no hidden state and restarts change nothing.
 */
const PROCESSING_MS = 20_000;

type Scenario = "ok" | "funds" | "returned" | "unknown";

function cents(amount: string): string {
  const [, fraction = ""] = amount.split(".");
  return fraction.padEnd(2, "0").slice(0, 2);
}

function reference(request: PayoutRequest, scenario: Scenario, acceptedAt: number) {
  return `sim_${scenario}_${acceptedAt.toString(36)}_${request.idempotencyKey.replaceAll("-", "").slice(0, 16)}`;
}

function parseReference(ref: string): { scenario: Scenario; acceptedAt: number } | null {
  const match = /^sim_(ok|funds|returned|unknown)_([0-9a-z]+)_[0-9a-f]{16}$/.exec(ref);
  if (!match) return null;
  return { scenario: match[1] as Scenario, acceptedAt: parseInt(match[2]!, 36) };
}

function statusAt(scenario: Scenario, acceptedAt: number, now: number): Pick<PayoutStatusResult, "status" | "providerStatus" | "failureMessage"> {
  const elapsed = now - acceptedAt;
  if (scenario === "funds") {
    if (elapsed < PROCESSING_MS) return { status: "awaiting_funds", providerStatus: "awaiting_funds" };
    if (elapsed < PROCESSING_MS * 2) return { status: "processing", providerStatus: "funds_received" };
    return { status: "completed", providerStatus: "payment_processed" };
  }
  if (elapsed < PROCESSING_MS) return { status: "processing", providerStatus: "payment_submitted" };
  if (scenario === "returned") {
    return elapsed < PROCESSING_MS * 2
      ? { status: "completed", providerStatus: "payment_processed" }
      : { status: "returned", providerStatus: "returned", failureMessage: "Beneficiary bank returned the funds (sandbox scenario .77)." };
  }
  return { status: "completed", providerStatus: "payment_processed" };
}

/** Indexed by idempotency key so a simulated timeout (.99) can still be found by reconciliation. */
const unknownAcceptances = new Map<string, number>();

export const sandboxPayoutAdapter: PayoutAdapter = {
  slug: "railor-sandbox",
  verification: "simulated",
  supportedMethods: ["bank_us", "iban", "gb", "clabe", "pix", "in_bank", "crypto_address"],
  payoutCredentialFields: [],

  async ensureBeneficiary(_credentials, beneficiary) {
    return { providerRef: `simben_${beneficiary.id.replaceAll("-", "").slice(0, 16)}` };
  },

  async createPayout(_credentials, request): Promise<PayoutOutcome> {
    const c = cents(request.amount);
    if (c === "13") return { kind: "rejected", code: "insufficient_funds", message: "Sandbox: provider balance too low (scenario .13).", retryableElsewhere: true };
    if (c === "66") return { kind: "rejected", code: "compliance_rejected", message: "Sandbox: provider compliance review declined the payout (scenario .66).", retryableElsewhere: false };
    const now = Date.now();
    if (c === "99") {
      unknownAcceptances.set(request.idempotencyKey, now);
      return { kind: "unknown", message: "Sandbox: simulated timeout — the provider may have accepted this (scenario .99)." };
    }
    const scenario: Scenario = c === "55" ? "funds" : c === "77" ? "returned" : "ok";
    const ref = reference(request, scenario, now);
    const amount = Number(request.amount);
    const fee = Math.round(amount * 0.005 * 100) / 100;
    return {
      kind: "accepted",
      providerReference: ref,
      providerStatus: scenario === "funds" ? "awaiting_funds" : "payment_submitted",
      status: scenario === "funds" ? "awaiting_funds" : "processing",
      feeAmount: fee.toFixed(2),
      feeCurrency: request.sourceCurrency,
      depositInstructions:
        scenario === "funds"
          ? {
              note: "Sandbox deposit instructions — send nothing; this advances automatically.",
              network: request.sourceNetwork ?? "base",
              currency: request.sourceCurrency,
              amount: request.amount,
              toAddress: "0x5A4D0000000000000000000000000000000Ba5E",
            }
          : undefined,
    };
  },

  async getPayout(_credentials, lookup): Promise<PayoutStatusResult> {
    const now = Date.now();
    if (lookup.providerReference) {
      const parsed = parseReference(lookup.providerReference);
      if (!parsed) return { found: false };
      return { found: true, providerReference: lookup.providerReference, ...statusAt(parsed.scenario, parsed.acceptedAt, now) };
    }
    // A simulated timeout: the "provider" did accept it. Surface it with the
    // same reference format a normal acceptance would have produced. After a
    // process restart the in-memory hint is gone; fall back to the attempt's
    // creation time, which is when the call was made.
    const acceptedAt = unknownAcceptances.get(lookup.idempotencyKey) ?? lookup.createdAt.getTime();
    const ref = `sim_ok_${acceptedAt.toString(36)}_${lookup.idempotencyKey.replaceAll("-", "").slice(0, 16)}`;
    return { found: true, providerReference: ref, ...statusAt("ok", acceptedAt, now) };
  },

  async quote(_credentials, request) {
    const amount = Number(request.amount);
    const fee = Math.round(amount * 0.005 * 100) / 100;
    const now = new Date().toISOString();
    return {
      providerSlug: "railor-sandbox",
      sourceAsset: request.sourceCurrency,
      sourceNetwork: request.sourceNetwork,
      destinationCurrency: request.destinationCurrency,
      destinationCountry: request.destinationCountry,
      amount,
      feeAmount: fee,
      feeCurrency: request.sourceCurrency,
      costPartial: false,
      estimatedArrivalMinutes: 1,
      quoteType: "live",
      accountContext: "railor_network",
      verificationType: "railor_observed",
      observedAt: now,
      quotedAt: now,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
  },
};
