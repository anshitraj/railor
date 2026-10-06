import type { CountryCode } from "./country-flag";
import type { CurrencySymbol } from "./currency-logo";
import type { ConfidenceBand } from "@railor/types";

export interface LandingChange {
  id: string;
  provider: string;
  summary: string;
  kind: string;
  when: string;
}

export interface LandingSignal {
  sourceCode: CountryCode;
  source: string;
  asset: CurrencySymbol;
  sourceNetwork?: string;
  destinationCode: CountryCode;
  destination: string;
  fiat: string;
  checked: number;
  supported: number;
  partial: number;
  topConfidence: number | null;
  /** Distinct evidence records behind the supported / KYB-gated results. */
  evidenceCount: number;
}

/** The corridors the landing page evaluates live on every request. Shared by the server page and the client view. */
export const LANDING_SIGNALS: Array<Pick<LandingSignal, "sourceCode" | "source" | "asset" | "sourceNetwork" | "destinationCode" | "destination" | "fiat">> = [
  { sourceCode: "IN", source: "India", asset: "USDC", sourceNetwork: "base", destinationCode: "AE", destination: "UAE", fiat: "AED" },
  { sourceCode: "GB", source: "United Kingdom", asset: "USDT", destinationCode: "NG", destination: "Nigeria", fiat: "NGN" },
  { sourceCode: "SG", source: "Singapore", asset: "USDC", destinationCode: "IN", destination: "India", fiat: "INR" },
];

/** One real capability record, rendered on the landing page as proof of the evidence model. */
export interface LandingEvidence {
  provider: string;
  providerSlug: string;
  claim: string;
  sourceType: string;
  sourceTitle: string;
  sourceHost: string;
  sourceUrl: string;
  confidence: number;
  bandKey: ConfidenceBand;
  band: string;
  retrievedAt: string;
  verifiedAt: string;
}
