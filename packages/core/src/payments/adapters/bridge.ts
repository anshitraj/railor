import { createHash, createVerify } from "node:crypto";
import { whereAlpha2 } from "iso-3166-1";
import { providerRequest, toDecimalString } from "../http.js";
import type { ConnectionEnvironment, NormalizedTransferStatus, PayoutAdapter, PayoutBeneficiary, PayoutRequest } from "../types.js";

/**
 * Bridge (bridge.xyz) payouts — built from Bridge's published API reference
 * (apidocs.bridge.xyz): POST /v0/transfers with `Api-Key` and a required
 * `Idempotency-Key` header, external accounts at
 * POST /v0/customers/{id}/external_accounts, transfer lookup at
 * GET /v0/transfers/{id}, sandbox at api.sandbox.bridge.xyz, and webhook
 * signatures `X-Webhook-Signature: t=<ms>,v0=<base64>` verified as RSA-SHA256
 * over the SHA-256 digest of "<t>.<raw body>" with the endpoint's public key.
 *
 * Verification status: docs_verified. Not yet exercised against a live Bridge
 * account by Railor — live use stays gated until an operator approves Bridge
 * for live payouts after a sandbox run (see platform settings).
 */
const BASE: Record<ConnectionEnvironment, string> = {
  sandbox: "https://api.sandbox.bridge.xyz/v0",
  production: "https://api.bridge.xyz/v0",
};

const STABLECOINS = new Set(["usdc", "usdt", "eurc", "pyusd", "usdb"]);
const CHAIN_RAILS = new Set(["arbitrum", "avalanche_c_chain", "base", "celo", "ethereum", "linea", "optimism", "polygon", "solana", "stellar", "tron"]);

const METHOD_RAIL: Record<string, { rail: string; currency: string; accountType?: string }> = {
  bank_us: { rail: "ach", currency: "usd", accountType: "us" },
  iban: { rail: "sepa", currency: "eur", accountType: "iban" },
  gb: { rail: "faster_payments", currency: "gbp", accountType: "gb" },
  clabe: { rail: "spei", currency: "mxn", accountType: "clabe" },
  pix: { rail: "pix", currency: "brl", accountType: "pix" },
};

const STATE: Record<string, NormalizedTransferStatus> = {
  awaiting_funds: "awaiting_funds",
  in_review: "processing",
  funds_received: "processing",
  payment_submitted: "processing",
  payment_processed: "completed",
  canceled: "cancelled",
  undeliverable: "failed",
  returned: "returned",
  refund_in_flight: "returned",
  refunded: "returned",
  refund_failed: "returned",
};

const headers = (credentials: Record<string, string>, idempotencyKey?: string): Record<string, string> => ({
  "Api-Key": credentials.apiKey?.trim() ?? "",
  "Content-Type": "application/json",
  ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
});

function networkRail(network: string | null | undefined): string | null {
  const n = (network ?? "").toLowerCase();
  const normalized = n === "avalanche" ? "avalanche_c_chain" : n;
  return CHAIN_RAILS.has(normalized) ? normalized : null;
}

function externalAccountBody(b: PayoutBeneficiary) {
  const spec = METHOD_RAIL[b.method];
  if (!spec) throw new Error(`Bridge external accounts do not support ${b.method}.`);
  const d = b.details;
  const names =
    b.holderType === "individual"
      ? { first_name: b.holderName.split(" ")[0], last_name: b.holderName.split(" ").slice(1).join(" ") || b.holderName }
      : { business_name: b.holderName };
  // us/iban/clabe nesting is as published; the published reference lists the
  // gb and pix field names but not their wrapper object, so those two wrappers
  // are a best reading and must be confirmed in Bridge's sandbox before live use.
  const account =
    b.method === "bank_us"
      ? { account: { account_number: d.accountNumber, routing_number: d.routingNumber, checking_or_savings: d.accountType ?? "checking" } }
      : b.method === "iban"
        ? { iban: { account_number: d.iban, bic: d.bic, country: whereAlpha2(b.country)?.alpha3 ?? b.country } }
        : b.method === "gb"
          ? { account: { account_number: d.accountNumber, sort_code: d.sortCode } }
          : b.method === "clabe"
            ? { clabe: { account_number: d.clabe } }
            : { pix_key: { pix_key: d.pixKey, document_number: d.documentNumber } };
  return {
    currency: spec.currency,
    bank_name: d.bankName ?? "Unknown bank",
    account_owner_name: b.holderName,
    account_type: spec.accountType,
    account_owner_type: b.holderType,
    ...names,
    ...account,
    address: d.addressLine1
      ? {
          street_line_1: d.addressLine1,
          city: d.city,
          state: d.state,
          postal_code: d.postalCode,
          country: whereAlpha2(b.country)?.alpha3 ?? b.country,
        }
      : undefined,
  };
}

function transferBody(credentials: Record<string, string>, request: PayoutRequest) {
  const sourceCurrency = request.sourceCurrency.toLowerCase();
  const b = request.beneficiary;
  const walletId = credentials.bridgeWalletId?.trim();
  let source: Record<string, unknown>;
  if (walletId) source = { payment_rail: "bridge_wallet", currency: sourceCurrency, bridge_wallet_id: walletId };
  else if (STABLECOINS.has(sourceCurrency)) {
    const rail = networkRail(request.sourceNetwork);
    if (!rail) return { error: `Bridge needs a supported source network for ${request.sourceCurrency} (got ${request.sourceNetwork ?? "none"}).` };
    source = { payment_rail: rail, currency: sourceCurrency };
  } else return { error: "Fiat-funded Bridge payouts need a prefunded Bridge wallet — add its id to the connection (bridgeWalletId)." };

  let destination: Record<string, unknown>;
  if (b.method === "crypto_address") {
    const rail = networkRail(b.network);
    if (!rail || !b.details.address) return { error: "Crypto beneficiary needs a supported network and address." };
    destination = { payment_rail: rail, currency: request.destinationCurrency.toLowerCase(), to_address: b.details.address };
  } else {
    const spec = METHOD_RAIL[b.method];
    if (!spec || spec.currency !== request.destinationCurrency.toLowerCase()) {
      return { error: `Bridge pays ${b.method} beneficiaries in ${spec?.currency.toUpperCase() ?? "no currency"}, not ${request.destinationCurrency}.` };
    }
    if (!request.beneficiaryProviderRef) return { error: "Beneficiary is not registered with Bridge yet." };
    destination = { payment_rail: spec.rail, currency: spec.currency, external_account_id: request.beneficiaryProviderRef };
    if (request.reference && spec.rail === "sepa") destination.sepa_reference = request.reference.slice(0, 140);
    if (request.reference && spec.rail === "ach") destination.ach_reference = request.reference.slice(0, 10);
  }
  return {
    body: {
      amount: toDecimalString(request.amount, 2),
      on_behalf_of: credentials.customerId?.trim(),
      client_reference_id: request.paymentId,
      source,
      destination,
    },
  };
}

function accepted(body: Record<string, unknown>) {
  const state = String(body.state ?? "");
  const receipt = (body.receipt ?? {}) as Record<string, unknown>;
  const fee = [receipt.developer_fee, receipt.exchange_fee, receipt.gas_fee].map((v) => Number(v ?? 0)).reduce((a, b) => a + b, 0);
  return {
    kind: "accepted" as const,
    providerReference: String(body.id),
    providerStatus: state,
    status: STATE[state] ?? "processing",
    depositInstructions: (body.source_deposit_instructions as Record<string, unknown> | undefined) ?? undefined,
    recipientAmount: receipt.final_amount !== undefined ? String(receipt.final_amount) : undefined,
    feeAmount: fee > 0 ? fee.toFixed(2) : undefined,
    feeCurrency: typeof body.currency === "string" ? body.currency.toUpperCase() : undefined,
    response: { id: body.id, state },
  };
}

export const bridgePayoutAdapter: PayoutAdapter = {
  slug: "bridge",
  verification: "docs_verified",
  supportedMethods: ["bank_us", "iban", "gb", "clabe", "pix", "crypto_address"],
  payoutCredentialFields: [
    { key: "customerId", label: "Bridge customer id (on_behalf_of)" },
    { key: "bridgeWalletId", label: "Bridge wallet id (optional — prefunded source)", placeholder: "Leave blank to fund each payout by deposit" },
    { key: "webhookPublicKey", label: "Webhook public key (PEM, optional)", placeholder: "-----BEGIN PUBLIC KEY-----" },
  ],

  async ensureBeneficiary(credentials, beneficiary, { environment, idempotencyKey }) {
    if (beneficiary.method === "crypto_address") return { providerRef: "onchain" };
    const customerId = credentials.customerId?.trim();
    if (!customerId) throw new Error("Bridge connection is missing its customer id.");
    const result = await providerRequest(`${BASE[environment]}/customers/${encodeURIComponent(customerId)}/external_accounts`, {
      method: "POST",
      headers: headers(credentials, idempotencyKey),
      body: JSON.stringify(externalAccountBody(beneficiary)),
    });
    if (!result.ok) throw new Error(`Bridge did not register the beneficiary: ${result.outcome.message}`);
    return { providerRef: String(result.body.id) };
  },

  async createPayout(credentials, request) {
    if (!credentials.apiKey?.trim() || !credentials.customerId?.trim()) {
      return { kind: "rejected", code: "connection_incomplete", message: "Bridge connection needs an API key and customer id.", retryableElsewhere: true };
    }
    const built = transferBody(credentials, request);
    if ("error" in built) return { kind: "rejected", code: "unsupported_route", message: built.error!, retryableElsewhere: true };
    const result = await providerRequest(`${BASE[request.environment]}/transfers`, {
      method: "POST",
      headers: headers(credentials, request.idempotencyKey),
      body: JSON.stringify(built.body),
    });
    if (!result.ok) return result.outcome;
    return accepted(result.body);
  },

  async getPayout(credentials, lookup) {
    if (!lookup.providerReference) return { found: false };
    const result = await providerRequest(`${BASE[lookup.environment]}/transfers/${encodeURIComponent(lookup.providerReference)}`, {
      method: "GET",
      headers: headers(credentials),
    });
    if (!result.ok) return { found: false, failureMessage: result.outcome.message };
    const state = String(result.body.state ?? "");
    return { found: true, providerReference: lookup.providerReference, providerStatus: state, status: STATE[state] };
  },

  verifyWebhook(credentials, requestHeaders, rawBody, now = new Date()) {
    const publicKey = credentials.webhookPublicKey?.trim();
    const header = requestHeaders.get("x-webhook-signature");
    if (!publicKey || !header) return false;
    const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=", 2) as [string, string]));
    const timestamp = parts.t;
    const signature = parts.v0;
    if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
    // Bridge's own guidance: reject events older than ten minutes (timestamps are milliseconds).
    if (Math.abs(now.getTime() - Number(timestamp)) > 10 * 60_000) return false;
    try {
      const digest = createHash("sha256").update(`${timestamp}.${rawBody}`).digest();
      const verifier = createVerify("RSA-SHA256");
      verifier.update(digest);
      return verifier.verify(publicKey, signature, "base64");
    } catch {
      return false;
    }
  },

  parseWebhook(rawBody) {
    try {
      const event = JSON.parse(rawBody) as {
        event_id?: string;
        event_category?: string;
        event_object_id?: string;
        event_object_status?: string;
        event_object?: { id?: string; state?: string };
      };
      if (event.event_category !== "transfer" || !event.event_id) return null;
      const ref = event.event_object_id ?? event.event_object?.id;
      const state = event.event_object_status ?? event.event_object?.state ?? "";
      if (!ref) return null;
      return { eventId: event.event_id, providerReference: ref, providerStatus: state, status: STATE[state] ?? null };
    } catch {
      return null;
    }
  },
};
