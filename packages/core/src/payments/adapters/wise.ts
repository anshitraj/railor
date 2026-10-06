import { createHash } from "node:crypto";
import type { ConnectionTestResult, ProviderAdapter } from "../../adapters.js";
import type { QuoteRequest, UnifiedQuote } from "../../unified.js";
import { providerRequest } from "../http.js";
import type { ConnectionEnvironment, NormalizedTransferStatus, PayoutAdapter, PayoutBeneficiary } from "../types.js";

/**
 * Wise Platform — from docs.wise.com, with every endpoint below probed live
 * (a fake token gets a clean `401 invalid_token`, not a 404):
 *   Public quote   POST /v3/quotes                      (no auth; display only, cannot create transfers)
 *   Account quote  POST /v3/profiles/{profileId}/quotes (Bearer; the customer's own price)
 *   Profiles       GET  /v2/profiles
 *   Recipient      POST /v1/accounts                    { currency, type, profile, accountHolderName, details }
 *   Transfer       POST /v1/transfers                   { targetAccount, quoteUuid, customerTransactionId, details }
 *   Fund           POST /v3/profiles/{p}/transfers/{id}/payments { type: "BALANCE" }
 *   Status         GET  /v1/transfers/{id}
 * Sandbox moved to api.wise-sandbox.com (the old api.sandbox.transferwise.tech
 * now answers 410 Gone).
 *
 * The public quote response shape is verified against a live call. The
 * authenticated flow is docs_verified: not yet exercised with a real token.
 *
 * Idempotency: `customerTransactionId` is the attempt's idempotency key, so a
 * replayed create returns the same transfer; a replayed funding call answers
 * `payment.exists`, which is treated as already funded. Funding is SCA
 * protected for many UK/EEA profiles (HTTP 403) — the transfer is then
 * cancelled and the rejection says why. Currencies whose transfer
 * requirements add fields (Wise's dynamic forms, e.g. a transfer purpose)
 * surface Wise's own validation message as a rejection.
 */
const BASE: Record<ConnectionEnvironment, string> = {
  sandbox: "https://api.wise-sandbox.com",
  production: "https://api.wise.com",
};
const PUBLIC_BASE = "https://api.wise.com";

const STABLECOINS = new Set(["USDC", "USDT", "EURC", "PYUSD", "DAI", "USDP", "FDUSD", "USDE", "RLUSD"]);

const STATUS: Record<string, NormalizedTransferStatus> = {
  incoming_payment_waiting: "awaiting_funds",
  incoming_payment_initiated: "processing",
  processing: "processing",
  funds_converted: "processing",
  outgoing_payment_sent: "completed",
  bounced_back: "processing",
  funds_refunded: "returned",
  charged_back: "failed",
  cancelled: "cancelled",
  unknown: "processing",
};

const envOf = (credentials: Record<string, string>): ConnectionEnvironment =>
  credentials.environment?.trim().toLowerCase() === "production" ? "production" : "sandbox";

const auth = (credentials: Record<string, string>) => ({
  Authorization: `Bearer ${credentials.apiToken?.trim() ?? ""}`,
  "Content-Type": "application/json",
});

function assertFiat(currency: string) {
  const c = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(c) || STABLECOINS.has(c)) throw new Error(`Wise moves fiat currencies; ${currency} is not one.`);
  return c;
}

interface WiseOption {
  payIn: string;
  payOut: string;
  disabled: boolean;
  sourceAmount: number;
  targetAmount: number;
  estimatedDelivery?: string;
  formattedEstimatedDelivery?: string;
  fee?: { total?: number; transferwise?: number; payIn?: number; discount?: number; partner?: number };
  price?: { total?: { value?: { amount?: number; currency?: string } } };
}

interface WiseQuoteBody {
  id?: string;
  rate?: number;
  sourceCurrency?: string;
  expirationTime?: string;
  paymentOptions?: WiseOption[];
}

/**
 * The option a business payout would use: from the Wise balance when that is
 * enabled for the profile, otherwise a bank transfer into Wise. Card pay-ins
 * are consumer options and never chosen.
 */
function pickOption(options: WiseOption[] = [], publicQuote = false): WiseOption | undefined {
  const enabled = options.filter((o) => !o.disabled && o.payOut === "BANK_TRANSFER");
  const chosen = enabled.find((o) => o.payIn === "BALANCE") ?? enabled.find((o) => o.payIn === "BANK_TRANSFER");
  // An anonymous quote's "disabled" balance option reflects the caller's location, not the
  // customer's; for pairs Wise only funds from a balance (e.g. from AED), show that price.
  return chosen ?? (publicQuote ? options.find((o) => o.payIn === "BALANCE" && o.payOut === "BANK_TRANSFER") : undefined);
}

export function wiseQuoteToUnified(body: WiseQuoteBody, request: QuoteRequest, accountContext: UnifiedQuote["accountContext"], now = new Date()): UnifiedQuote {
  const option = pickOption(body.paymentOptions, accountContext === "public_published");
  if (!option) throw new Error("Wise returned no bank-transfer option for this route.");
  const eta = option.estimatedDelivery ? Math.max(0, Math.round((Date.parse(option.estimatedDelivery) - now.getTime()) / 60_000)) : undefined;
  const feeCurrency = option.price?.total?.value?.currency ?? body.sourceCurrency ?? request.sourceAsset;
  return {
    providerSlug: "wise",
    providerQuoteId: body.id,
    sourceAsset: request.sourceAsset,
    sourceNetwork: request.sourceNetwork,
    destinationCurrency: request.destinationCurrency,
    destinationCountry: request.destinationCountry,
    amount: request.amount,
    recipientAmount: option.targetAmount,
    // Wise itemizes its whole charge in `fee.total` and converts at the quoted rate.
    feeAmount: option.fee?.total,
    feeCurrency,
    payoutFeeAmount: option.fee?.transferwise,
    platformFeeAmount: option.fee?.payIn,
    costPartial: option.fee?.total === undefined,
    exchangeRate: body.rate !== undefined ? String(body.rate) : undefined,
    estimatedArrivalMinutes: Number.isFinite(eta) ? eta : undefined,
    quoteType: accountContext === "public_published" ? "indicative" : "live",
    accountContext,
    verificationType: "provider_reported",
    observedAt: now.toISOString(),
    expiresAt: body.expirationTime,
    quotedAt: now.toISOString(),
  };
}

/** Wise's public price for anyone — not the customer's own pricing, and it cannot be used to send. */
export async function wisePublicQuote(request: QuoteRequest, fetcher: typeof fetch = fetch): Promise<UnifiedQuote & { payInLabel: string; deliveryLabel?: string }> {
  const sourceCurrency = assertFiat(request.sourceAsset);
  const response = await fetcher(`${PUBLIC_BASE}/v3/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceCurrency, targetCurrency: assertFiat(request.destinationCurrency), sourceAmount: request.amount }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Wise public quote failed (HTTP ${response.status}).`);
  const body = (await response.json()) as WiseQuoteBody;
  const option = pickOption(body.paymentOptions, true);
  return {
    ...wiseQuoteToUnified(body, request, "public_published"),
    payInLabel:
      option?.payIn === "BALANCE"
        ? option.disabled
          ? `from a Wise ${sourceCurrency} balance (the only way Wise funds this pair; availability depends on your account's country)`
          : "from a Wise balance"
        : "by bank transfer into Wise",
    deliveryLabel: option?.formattedEstimatedDelivery,
  };
}

// Profiles rarely change; one lookup per token per 10 minutes.
const profileCache = new Map<string, { id: string; name: string; at: number }>();

async function resolveProfile(credentials: Record<string, string>, environment: ConnectionEnvironment) {
  const explicit = credentials.profileId?.trim();
  if (explicit) return { id: explicit, name: `profile ${explicit}` };
  const key = createHash("sha256").update(`${environment}:${credentials.apiToken ?? ""}`).digest("hex");
  const cached = profileCache.get(key);
  if (cached && Date.now() - cached.at < 600_000) return cached;
  const result = await providerRequest(`${BASE[environment]}/v2/profiles`, { method: "GET", headers: auth(credentials), timeoutMs: 10_000 });
  if (!result.ok) throw new Error(`Wise profiles: ${result.outcome.message}`);
  const list = (Array.isArray(result.body) ? result.body : []) as Array<{ id: number; type?: string; businessName?: string; fullName?: string }>;
  const chosen = list.find((p) => p.type?.toUpperCase() === "BUSINESS") ?? list[0];
  if (!chosen) throw new Error("This Wise token has no profile.");
  const profile = { id: String(chosen.id), name: chosen.businessName ?? chosen.fullName ?? `profile ${chosen.id}`, at: Date.now() };
  profileCache.set(key, profile);
  return profile;
}

async function wiseTestConnection(credentials: Record<string, string>): Promise<ConnectionTestResult> {
  if (!credentials.apiToken?.trim()) return { ok: false, detail: "API token is required." };
  const environment = envOf(credentials);
  const result = await providerRequest(`${BASE[environment]}/v2/profiles`, { method: "GET", headers: auth(credentials), timeoutMs: 10_000 });
  if (!result.ok) return { ok: false, detail: `Wise rejected the token: ${result.outcome.message}` };
  const list = (Array.isArray(result.body) ? result.body : []) as Array<{ id: number; type?: string; businessName?: string; fullName?: string }>;
  const explicit = credentials.profileId?.trim();
  const chosen = explicit ? list.find((p) => String(p.id) === explicit) : (list.find((p) => p.type?.toUpperCase() === "BUSINESS") ?? list[0]);
  if (!chosen) return { ok: false, detail: explicit ? `Profile ${explicit} is not on this token.` : "This token has no Wise profile." };
  return { ok: true, detail: `Connected to ${chosen.type?.toUpperCase() === "BUSINESS" ? "business" : "personal"} profile “${chosen.businessName ?? chosen.fullName ?? chosen.id}” (${chosen.id}).` };
}

async function wiseAccountQuote(credentials: Record<string, string>, request: QuoteRequest): Promise<UnifiedQuote> {
  const environment = envOf(credentials);
  const profile = await resolveProfile(credentials, environment);
  const result = await providerRequest(`${BASE[environment]}/v3/profiles/${encodeURIComponent(profile.id)}/quotes`, {
    method: "POST",
    headers: auth(credentials),
    body: JSON.stringify({
      sourceCurrency: assertFiat(request.sourceAsset),
      targetCurrency: assertFiat(request.destinationCurrency),
      sourceAmount: request.amount,
      payOut: "BANK_TRANSFER",
      preferredPayIn: "BALANCE",
    }),
    timeoutMs: 10_000,
  });
  if (!result.ok) throw new Error(`Wise quote: ${result.outcome.message}`);
  return wiseQuoteToUnified(result.body as WiseQuoteBody, request, "customer_connected");
}

/** Settings → Connections entry: connection test plus the customer's own quotes. */
export const wiseProviderAdapter: ProviderAdapter = {
  slug: "wise",
  credentialFields: [
    { key: "apiToken", label: "API token", secret: true, placeholder: "Wise → Settings → API tokens" },
    { key: "profileId", label: "Profile ID (optional — Railor picks your business profile)" },
  ],
  testConnection: wiseTestConnection,
  getQuote: (credentials, request) => (credentials.apiToken?.trim() ? wiseAccountQuote(credentials, request) : wisePublicQuote(request)),
};

const legalType = (b: PayoutBeneficiary) => (b.holderType === "business" ? "BUSINESS" : "PRIVATE");

/** Railor beneficiary → Wise recipient `type` + `details`, per Wise's account requirements. */
export function wiseRecipientBody(b: PayoutBeneficiary, profileId: string) {
  const d = b.details;
  const base = { currency: b.currency, profile: Number(profileId), accountHolderName: b.holderName, ownedByCustomer: false };
  switch (b.method) {
    case "iban":
      return { ...base, type: "iban", details: { legalType: legalType(b), IBAN: d.iban?.replace(/\s+/g, "").toUpperCase(), ...(d.bic ? { BIC: d.bic } : {}) } };
    case "gb":
      return { ...base, type: "sort_code", details: { legalType: legalType(b), sortCode: d.sortCode?.replace(/\D/g, ""), accountNumber: d.accountNumber } };
    case "bank_us":
      return {
        ...base,
        type: "aba",
        details: {
          legalType: legalType(b),
          abartn: d.routingNumber,
          accountNumber: d.accountNumber,
          accountType: d.accountType === "savings" ? "SAVINGS" : "CHECKING",
          // Wise requires the holder's address for USD recipients.
          address: { country: b.country, city: d.city, postCode: d.postalCode, firstLine: d.addressLine1, state: d.state },
        },
      };
    case "clabe":
      return { ...base, type: "mexican", details: { legalType: legalType(b), clabe: d.clabe } };
    case "in_bank":
      return { ...base, type: "indian", details: { legalType: legalType(b), ifscCode: d.ifsc, accountNumber: d.accountNumber } };
    default:
      throw new Error(`Wise does not pay out to ${b.method} beneficiaries.`);
  }
}

export const wisePayoutAdapter: PayoutAdapter = {
  slug: "wise",
  verification: "docs_verified",
  supportedMethods: ["iban", "gb", "bank_us", "clabe", "in_bank"],
  payoutCredentialFields: [],

  async ensureBeneficiary(credentials, beneficiary, { environment }) {
    const profile = await resolveProfile(credentials, environment);
    const result = await providerRequest(`${BASE[environment]}/v1/accounts`, {
      method: "POST",
      headers: auth(credentials),
      body: JSON.stringify(wiseRecipientBody(beneficiary, profile.id)),
    });
    if (!result.ok) throw new Error(`Wise did not accept the recipient: ${result.outcome.message}`);
    return { providerRef: `account:${String(result.body.id)}` };
  },

  async createPayout(credentials, request) {
    if (!credentials.apiToken?.trim()) return { kind: "rejected", code: "connection_incomplete", message: "Wise connection needs an API token.", retryableElsewhere: true };
    let sourceCurrency: string;
    let targetCurrency: string;
    try {
      sourceCurrency = assertFiat(request.sourceCurrency);
      targetCurrency = assertFiat(request.destinationCurrency);
    } catch (error) {
      return { kind: "rejected", code: "unsupported_route", message: (error as Error).message, retryableElsewhere: true };
    }
    const accountId = request.beneficiaryProviderRef?.startsWith("account:") ? request.beneficiaryProviderRef.slice(8) : "";
    if (!accountId) return { kind: "rejected", code: "beneficiary_unregistered", message: "Beneficiary is not registered with Wise yet.", retryableElsewhere: true };
    const base = BASE[request.environment];
    let profileId: string;
    try {
      profileId = (await resolveProfile(credentials, request.environment)).id;
    } catch (error) {
      return { kind: "rejected", code: "provider_profile", message: (error as Error).message, retryableElsewhere: true };
    }

    // 1. A quote bound to this recipient. Nothing has moved yet, so any failure is a clean rejection.
    const quote = await providerRequest(`${base}/v3/profiles/${encodeURIComponent(profileId)}/quotes`, {
      method: "POST",
      headers: auth(credentials),
      body: JSON.stringify({ sourceCurrency, targetCurrency, sourceAmount: Number(request.amount), targetAccount: Number(accountId), payOut: "BANK_TRANSFER", preferredPayIn: "BALANCE" }),
    });
    if (!quote.ok) {
      return quote.outcome.kind === "unknown"
        ? { kind: "rejected", code: "provider_unavailable", message: `Wise quote: ${quote.outcome.message}`, retryableElsewhere: true }
        : quote.outcome;
    }

    // 2. The transfer. customerTransactionId makes a replay return this same transfer.
    const transfer = await providerRequest(`${base}/v1/transfers`, {
      method: "POST",
      headers: auth(credentials),
      body: JSON.stringify({
        targetAccount: Number(accountId),
        quoteUuid: String(quote.body.id),
        customerTransactionId: request.idempotencyKey,
        // Reference length limits vary by currency (18 characters is the strictest, GBP).
        details: { reference: (request.reference ?? "Railor payout").slice(0, 18) },
      }),
    });
    if (!transfer.ok) {
      // Wise already holding a transfer under this customerTransactionId is never a failure.
      if (transfer.outcome.kind === "rejected" && /customerTransactionId|duplicate/i.test(transfer.outcome.message)) {
        return { kind: "unknown", message: "Wise already has a transfer for this attempt; reconciling by customerTransactionId." };
      }
      return transfer.outcome;
    }
    const transferId = String(transfer.body.id);

    // 3. Fund it from the Wise balance.
    const fund = await providerRequest(`${base}/v3/profiles/${encodeURIComponent(profileId)}/transfers/${encodeURIComponent(transferId)}/payments`, {
      method: "POST",
      headers: auth(credentials),
      body: JSON.stringify({ type: "BALANCE" }),
    });
    const cancel = () =>
      providerRequest(`${base}/v1/transfers/${encodeURIComponent(transferId)}/cancel`, { method: "PUT", headers: auth(credentials) }).catch(() => undefined);
    if (!fund.ok) {
      if (fund.outcome.kind === "unknown") return fund.outcome;
      await cancel();
      if (fund.outcome.code === "provider_forbidden") {
        return { kind: "rejected", code: "wise_sca_required", message: "Wise requires Strong Customer Authentication to fund this transfer over the API. It was cancelled; nothing was sent.", retryableElsewhere: true };
      }
      return { ...fund.outcome, retryableElsewhere: true };
    }
    const fundStatus = String(fund.body.status ?? "");
    const errorCode = typeof fund.body.errorCode === "string" ? fund.body.errorCode : "";
    if (fundStatus === "REJECTED" && errorCode !== "payment.exists") {
      await cancel();
      return {
        kind: "rejected",
        code: `wise_${errorCode.replace(/[^a-z0-9]+/gi, "_") || "funding_rejected"}`,
        message: errorCode === "balance.insufficient-funds" ? `Not enough ${sourceCurrency} in the Wise balance. The transfer was cancelled.` : `Wise refused to fund the transfer (${errorCode || "no code"}). It was cancelled.`,
        retryableElsewhere: true,
      };
    }
    const quoteOption = pickOption((quote.body as WiseQuoteBody).paymentOptions);
    return {
      kind: "accepted",
      providerReference: `transfer:${transferId}`,
      providerStatus: String(transfer.body.status ?? "incoming_payment_waiting"),
      status: "processing",
      recipientAmount: quoteOption ? String(quoteOption.targetAmount) : undefined,
      feeAmount: quoteOption?.fee?.total !== undefined ? String(quoteOption.fee.total) : undefined,
      feeCurrency: quoteOption ? sourceCurrency : undefined,
      response: { transferId, fundStatus: fundStatus || "COMPLETED" },
    };
  },

  async getPayout(credentials, lookup) {
    let id = lookup.providerReference?.startsWith("transfer:") ? lookup.providerReference.slice(9) : "";
    if (!id) {
      // An ambiguous create: find the transfer Wise holds under this attempt's customerTransactionId.
      try {
        const profileId = (await resolveProfile(credentials, lookup.environment)).id;
        const since = new Date(lookup.createdAt.getTime() - 10 * 60_000).toISOString();
        const list = await providerRequest(
          `${BASE[lookup.environment]}/v1/transfers?profile=${encodeURIComponent(profileId)}&createdDateStart=${encodeURIComponent(since)}&limit=100`,
          { method: "GET", headers: auth(credentials) },
        );
        const rows = list.ok && Array.isArray(list.body) ? (list.body as Array<Record<string, unknown>>) : [];
        const match = rows.find((t) => t.customerTransactionId === lookup.idempotencyKey);
        if (!match) return { found: false };
        id = String(match.id);
      } catch {
        return { found: false };
      }
    }
    const result = await providerRequest(`${BASE[lookup.environment]}/v1/transfers/${encodeURIComponent(id)}`, { method: "GET", headers: auth(credentials) });
    if (!result.ok) return { found: false, failureMessage: result.outcome.message };
    const status = String(result.body.status ?? "");
    return {
      found: true,
      providerReference: `transfer:${id}`,
      providerStatus: status,
      status: STATUS[status],
      failureMessage: status === "charged_back" ? "Wise reports the funding was charged back." : undefined,
    };
  },
};
