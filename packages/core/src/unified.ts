/**
 * Unified data objects — Railor's own normalized shape for what a connected
 * provider reports, independent of that provider's own API quirks.
 *
 * Only UnifiedConnectionStatus is actually populated by anything today (by
 * calling a ProviderAdapter's testConnection). UnifiedQuote is the shape a
 * future getQuote() would fill — defined now so the adapter interface has
 * somewhere real to grow into, not populated by any adapter yet since no
 * provider's actual quote/rate endpoint has been verified the way
 * testConnection's endpoints have.
 */

export interface UnifiedConnectionStatus {
  providerSlug: string;
  providerName: string;
  connected: boolean;
  detail: string;
  checkedAt: string;
}

export interface QuoteRequest {
  sourceAsset: string;
  sourceNetwork?: string;
  destinationCurrency: string;
  destinationCountry?: string;
  amount: number;
  /** Where the sending entity is incorporated — some providers (Circle CPN) require this to quote. */
  entityCountry?: string;
  /** A named rail/payment-method the provider itself uses (e.g. Circle CPN's "SPEI"/"SEPA"/"PIX") — required by adapters that can't safely infer it from the currency alone. Optional because most adapters (Bridge, MoonPay) don't need it. */
  paymentMethodType?: string;
}

/**
 * Never store one of these as a standing "Provider X = 3.67 AED" fact — a
 * quote is a point-in-time observation, not a price list. See ROUTE VS
 * ROUTE SNAPSHOT in the control-plane spec: pricing depends on amount,
 * account, negotiated tier, geography, beneficiary type and quote time, so
 * every field below is scoped to exactly the request that produced it.
 */
export interface UnifiedQuote {
  providerSlug: string;
  /** The provider's own quote/reference id, when it returns one — lets a later dispute or re-check point at the exact quote. */
  providerQuoteId?: string;
  sourceAsset: string;
  sourceNetwork?: string;
  destinationCurrency: string;
  destinationCountry?: string;
  amount: number;
  recipientAmount?: number;
  /** Total of every fee component Railor could actually see in the response — never a guess at what's missing. */
  feeAmount?: number;
  feeCurrency?: string;
  /** Individually-attributed components, only ever populated from fields the provider's own response actually exposed. */
  fxSpreadAmount?: number;
  networkFeeAmount?: number;
  payoutFeeAmount?: number;
  platformFeeAmount?: number;
  /** Set when the provider's response didn't break out every fee component Railor would need for a true total — so a caller never treats a partial sum as the full cost. */
  costPartial: boolean;
  exchangeRate?: string;
  estimatedArrivalMinutes?: number;
  /** LIVE = this exact call just hit the provider's quote endpoint. INDICATIVE = derived from a published rate/fee schedule, not a live call. HISTORICAL = a past observation being replayed (e.g. "last observed 22 minutes ago"). */
  quoteType: "live" | "indicative" | "historical";
  /** Whose relationship with the provider produced this number — never conflate a customer's own negotiated rate with Railor's public reference data. */
  accountContext: "customer_connected" | "railor_network" | "public_published";
  verificationType: "provider_reported" | "railor_observed" | "provider_verified";
  observedAt: string;
  /** Past this time the quote is no longer valid — enforced by isQuoteExpired(), never left to the caller to remember. */
  expiresAt?: string;
  quotedAt: string;
}

/** A LIVE quote past its own expiresAt is stale and must never be presented as still LIVE — re-quote or relabel as HISTORICAL instead. */
export function isQuoteExpired(quote: Pick<UnifiedQuote, "expiresAt">, now: Date = new Date()): boolean {
  if (!quote.expiresAt) return false;
  return now.getTime() > new Date(quote.expiresAt).getTime();
}

/**
 * One provider's outcome for a routing attempt — quoted, skipped (no
 * adapter support or not connected), or failed (adapter exists, call
 * errored). Kept even for skips/failures so a routing result is a full
 * audit trail, not just a winner with no explanation for who lost and why.
 */
export interface RoutingAttempt {
  providerSlug: string;
  providerName: string;
  outcome: "quoted" | "skipped" | "failed";
  detail: string;
  quote?: UnifiedQuote;
}

export interface RoutingResult {
  preset: string;
  selected: UnifiedQuote | null;
  attempts: RoutingAttempt[];
  /** Fraction of the preset's real ranking inputs that were actually available for the selected quote (0 when nothing was selected). Never a fabricated neutral value — see rankQuotes in routing.ts. */
  rankingConfidence: number;
  rankingInputsUsed: string[];
  rankingInputsMissing: string[];
}

/**
 * The shape a real execute-transfer call would take. No adapter implements
 * this — see adapters.ts's executeTransfer, which always throws. Defined so
 * the type exists for whenever a human deliberately wires a real, tested,
 * compliance-reviewed execution path; Railor does not move money today.
 */
export interface ExecutionRequest extends QuoteRequest {
  destinationAccount: string;
  idempotencyKey: string;
}

export interface ExecutionResult {
  providerSlug: string;
  status: "not_implemented";
  detail: string;
}
