/**
 * Request shapes. Inputs are camelCase (idiomatic TypeScript); the client
 * converts top-level keys to the API's snake_case. Responses are returned
 * exactly as the API sent them — snake_case, with `object` discriminators.
 */

export type CustomerType = "business" | "individual";
export type RankingPreset =
  | "balanced"
  | "cheapest"
  | "fastest"
  | "easiest_onboarding"
  | "widest_coverage"
  | "max_recipient_amount"
  | "most_reliable";
export type Availability = "supported" | "partial" | "unsupported" | "unknown";

export interface CorridorSearchParams {
  entityCountry?: string;
  customerType?: CustomerType;
  sourceCountry?: string;
  sourceCurrency?: string;
  destinationCountry?: string;
  sourceAsset?: string;
  sourceNetwork?: string;
  destinationCurrency?: string;
  paymentMethod?: string;
  product?: string;
  amount?: number;
  amountCurrency?: string;
  preset?: RankingPreset;
}

export interface EligibilityParams extends Omit<CorridorSearchParams, "preset"> {
  /** Check one provider; omit to check every provider. */
  provider?: string;
  /** Override the organization's saved KYB profile with an explicit list. */
  satisfiedRequirements?: string[];
}

export interface ProviderListParams {
  product?: string;
  /** Headquarters country, ISO 3166-1 alpha-2. */
  country?: string;
}

export interface CompareParams {
  /** 2–4 provider slugs. */
  providers: string[];
  onlyDifferences?: boolean;
}

export interface CapabilityListParams {
  provider?: string;
  product?: string;
  entityCountry?: string;
  destinationCountry?: string;
  destinationCurrency?: string;
  asset?: string;
  network?: string;
  availability?: Availability;
  limit?: number;
  startingAfter?: string;
  includeDemo?: boolean;
}

export interface ChangeListParams {
  limit?: number;
  provider?: string;
  /** A duration ("7d", "24h", "30m") or an ISO date. */
  since?: string;
}

export type WatchTargetType = "provider" | "corridor" | "country" | "asset" | "product";
export type Digest = "instant" | "daily" | "weekly";

export interface WatchlistCreateParams {
  targetType: WatchTargetType;
  targetId: string;
  label?: string;
  kinds?: string[];
  channelEmail?: boolean;
  digest?: Digest;
}

export type WatchlistUpdateParams = Partial<Pick<WatchlistCreateParams, "label" | "kinds" | "channelEmail" | "digest">>;

/** A structured payment intent. Nested keys may be camelCase or snake_case. */
export interface PaymentIntent {
  sourceEntityCountry: string;
  sourceEntityType?: CustomerType;
  sourceAsset?: string;
  sourceNetwork?: string;
  sourceCurrency?: string;
  destinationCountry: string;
  destinationCurrency?: string;
  beneficiaryType?: CustomerType;
  paymentMethod?: string;
  product?: string;
  amount: number;
  amountCurrency?: string;
  preference?: RankingPreset;
}

export interface DecisionCreateParams {
  intent: PaymentIntent;
  /** Defaults to the organization's single active policy. */
  policyId?: string;
  mode?: "enforce" | "optimize";
  /** Required in enforce mode: the provider you intend to use. */
  proposedExecutor?: { provider: string };
}

export interface PolicyCreateParams {
  name: string;
  /** Policy rules, camelCase as documented (e.g. `requireExactRouteEvidence`). */
  rules?: Record<string, unknown>;
}

/** Any successful API response. Every claim carries its own evidence and confidence. */
export type ApiResponse = Record<string, unknown> & { object?: string; request_id?: string };

export interface ListResponse<T = Record<string, unknown>> extends ApiResponse {
  object: "list";
  data: T[];
  has_more: boolean;
}

export type BeneficiaryMethod = "bank_us" | "iban" | "gb" | "clabe" | "pix" | "in_bank" | "crypto_address";

export interface BeneficiaryCreateParams {
  holderType: CustomerType;
  holderName: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  currency: string;
  method: BeneficiaryMethod;
  /** Required for crypto_address (base, ethereum, polygon, solana, …). */
  network?: string;
  label?: string;
  /** Method-specific: accountNumber/routingNumber (bank_us), iban/bic, sortCode/accountNumber (gb), clabe, ifsc/accountNumber (in_bank), pixKey, address. */
  details: Record<string, string>;
}

export interface PaymentCreateParams {
  beneficiaryId: string;
  intent: PaymentIntent;
  /** Pin one provider instead of auto-routing. */
  provider?: string;
  reference?: string;
}

export interface PriceCheckParams {
  sourceCurrency: string;
  destinationCurrency: string;
  amount: number;
  destinationCountry?: string;
  /** Adds dated consumer prices from Wise's comparison feed, listed after actionable prices. */
  includeMarket?: boolean;
}

/** exact = your connected account's live quote; live_public = a live public quote; published = the provider's fee schedule; market_estimate = collected consumer pricing. */
export type PriceBasis = "exact" | "live_public" | "published" | "market_estimate";
