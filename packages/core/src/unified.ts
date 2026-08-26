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
}

export interface UnifiedQuote {
  providerSlug: string;
  sourceAsset: string;
  sourceNetwork?: string;
  destinationCurrency: string;
  destinationCountry?: string;
  amount: number;
  feeAmount?: number;
  feeCurrency?: string;
  estimatedArrivalMinutes?: number;
  quotedAt: string;
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
