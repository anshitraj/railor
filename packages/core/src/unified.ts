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
