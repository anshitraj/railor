import { providerRequest, toDecimalString } from "../http.js";
import type { ConnectionEnvironment, NormalizedTransferStatus, PayoutAdapter, PayoutBeneficiary } from "../types.js";

/**
 * Circle Mint payouts — from Circle's published API reference
 * (developers.circle.com): Bearer auth, `idempotencyKey` (UUID v4) in the
 * body, sandbox at api-sandbox.circle.com.
 *   Stablecoin payouts: POST /v1/addressBook/recipients, then
 *     POST /v1/payouts { source{wallet}, destination{address_book}, amount, toAmount }
 *   Wire payouts:       POST /v1/businessAccount/banks/wires, then
 *     POST /v1/businessAccount/payouts { destination{wire}, amount }
 *   Status:             GET  /v1/payouts/{id} | /v1/businessAccount/payouts/{id}
 *                       pending → complete | failed
 * Circle Mint notifications are delivered through its subscription service,
 * not a signed per-endpoint webhook Railor can verify here, so Circle payouts
 * are reconciled by polling.
 *
 * Verification status: docs_verified — not yet exercised against a live Circle
 * account by Railor. Note from Circle's docs: new US address-book recipients can
 * sit in `pending` for up to 24h before payouts to them succeed.
 */
const BASE: Record<ConnectionEnvironment, string> = {
  sandbox: "https://api-sandbox.circle.com",
  production: "https://api.circle.com",
};

const CHAIN: Record<string, string> = {
  ethereum: "ETH",
  base: "BASE",
  polygon: "MATIC",
  solana: "SOL",
  arbitrum: "ARB",
  avalanche: "AVAX",
  optimism: "OP",
  stellar: "XLM",
  tron: "TRX",
};

/** Circle denominates USDC balances as USD and EURC as EUR. */
const AMOUNT_CURRENCY: Record<string, string> = { USDC: "USD", USD: "USD", EURC: "EUR", EUR: "EUR" };

const STATUS: Record<string, NormalizedTransferStatus> = { pending: "processing", complete: "completed", failed: "failed" };

const auth = (credentials: Record<string, string>) => ({
  Authorization: `Bearer ${credentials.apiKey?.trim() ?? ""}`,
  "Content-Type": "application/json",
});

const data = (body: Record<string, unknown>) => (body.data ?? body) as Record<string, unknown>;

/** US wire only: Circle pays wires in USD, and Railor does not send any other currency through this rail. */
function wireBankBody(b: PayoutBeneficiary, idempotencyKey: string) {
  const d = b.details;
  const billingDetails = { name: b.holderName, city: d.city, country: b.country, line1: d.addressLine1, district: d.state, postalCode: d.postalCode };
  const bankAddress = { bankName: d.bankName, city: d.city, country: b.country };
  return { idempotencyKey, accountNumber: d.accountNumber, routingNumber: d.routingNumber, billingDetails, bankAddress };
}

export const circlePayoutAdapter: PayoutAdapter = {
  slug: "circle",
  verification: "docs_verified",
  supportedMethods: ["crypto_address", "bank_us"],
  payoutCredentialFields: [{ key: "walletId", label: "Source wallet id (optional — defaults to your master wallet)" }],

  async ensureBeneficiary(credentials, beneficiary, { environment, idempotencyKey }) {
    if (beneficiary.method === "crypto_address") {
      const chain = CHAIN[(beneficiary.network ?? "").toLowerCase()];
      if (!chain || !beneficiary.details.address) throw new Error("Circle recipients need a supported chain and address.");
      const result = await providerRequest(`${BASE[environment]}/v1/addressBook/recipients`, {
        method: "POST",
        headers: auth(credentials),
        body: JSON.stringify({
          idempotencyKey,
          chain,
          address: beneficiary.details.address,
          metadata: { nickname: beneficiary.holderName.slice(0, 50), ...(beneficiary.details.email ? { email: beneficiary.details.email } : {}) },
        }),
      });
      if (!result.ok) throw new Error(`Circle did not register the recipient: ${result.outcome.message}`);
      return { providerRef: `recipient:${String(data(result.body).id)}` };
    }
    // Anything but a US bank account would be registered with blank routing fields: refuse instead.
    if (beneficiary.method !== "bank_us") throw new Error(`Circle payouts from Railor don't support ${beneficiary.method} beneficiaries.`);
    const result = await providerRequest(`${BASE[environment]}/v1/businessAccount/banks/wires`, {
      method: "POST",
      headers: auth(credentials),
      body: JSON.stringify(wireBankBody(beneficiary, idempotencyKey)),
    });
    if (!result.ok) throw new Error(`Circle did not register the bank account: ${result.outcome.message}`);
    return { providerRef: `wire:${String(data(result.body).id)}` };
  },

  async createPayout(credentials, request) {
    if (!credentials.apiKey?.trim()) return { kind: "rejected", code: "connection_incomplete", message: "Circle connection needs an API key.", retryableElsewhere: true };
    const currency = AMOUNT_CURRENCY[request.sourceCurrency.toUpperCase()];
    if (!currency) return { kind: "rejected", code: "unsupported_route", message: `Circle Mint pays out from USDC/EURC balances, not ${request.sourceCurrency}.`, retryableElsewhere: true };
    const ref = request.beneficiaryProviderRef ?? "";
    const [kind, id] = ref.split(":");
    if (!id) return { kind: "rejected", code: "beneficiary_unregistered", message: "Beneficiary is not registered with Circle yet.", retryableElsewhere: true };
    const walletId = credentials.walletId?.trim();
    const amount = { amount: toDecimalString(request.amount, 2), currency };
    const isWire = kind === "wire";
    if (isWire && currency !== "USD") return { kind: "rejected", code: "unsupported_route", message: "Circle wire payouts are USD only.", retryableElsewhere: true };
    // Circle pays in the currency of the funding balance. Delivering a different currency than the payment
    // promised (USDC wired to a euro account, USDC sent as EURC) would be a silent wrong payment: refuse.
    const promised = AMOUNT_CURRENCY[request.destinationCurrency.toUpperCase()];
    if (promised !== currency) {
      return { kind: "rejected", code: "unsupported_route", message: `Circle pays out in the currency it is funded in (${currency}); it cannot deliver ${request.destinationCurrency}.`, retryableElsewhere: true };
    }
    const result = await providerRequest(`${BASE[request.environment]}${isWire ? "/v1/businessAccount/payouts" : "/v1/payouts"}`, {
      method: "POST",
      headers: auth(credentials),
      body: JSON.stringify(
        isWire
          ? { idempotencyKey: request.idempotencyKey, destination: { type: "wire", id }, amount }
          : {
              idempotencyKey: request.idempotencyKey,
              ...(walletId ? { source: { type: "wallet", id: walletId } } : {}),
              destination: { type: "address_book", id },
              amount,
              toAmount: { currency },
              metadata: { customerExternalRef: request.paymentId },
            },
      ),
    });
    if (!result.ok) return result.outcome;
    const payout = data(result.body);
    const status = String(payout.status ?? "pending");
    const fees = payout.fees as { amount?: string; currency?: string } | undefined;
    return {
      kind: "accepted",
      providerReference: `${isWire ? "wire" : "payout"}:${String(payout.id)}`,
      providerStatus: status,
      status: STATUS[status] ?? "processing",
      feeAmount: fees?.amount,
      feeCurrency: fees?.currency,
      response: { id: payout.id, status },
    };
  },

  async getPayout(credentials, lookup) {
    if (!lookup.providerReference) return { found: false };
    const [kind, id] = lookup.providerReference.split(":");
    if (!id) return { found: false };
    const path = kind === "wire" ? `/v1/businessAccount/payouts/${encodeURIComponent(id)}` : `/v1/payouts/${encodeURIComponent(id)}`;
    const result = await providerRequest(`${BASE[lookup.environment]}${path}`, { method: "GET", headers: auth(credentials) });
    if (!result.ok) return { found: false, failureMessage: result.outcome.message };
    const payout = data(result.body);
    const status = String(payout.status ?? "");
    return {
      found: true,
      providerReference: lookup.providerReference,
      providerStatus: status,
      status: STATUS[status],
      failureMessage: typeof payout.errorCode === "string" ? payout.errorCode : undefined,
    };
  },
};
