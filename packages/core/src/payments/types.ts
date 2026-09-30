import type { BeneficiaryMethod, PaymentStatus } from "@railor/database";
import type { CredentialField } from "../adapters.js";
import type { UnifiedQuote } from "../unified.js";

export type PaymentMode = "test" | "live";
export type ConnectionEnvironment = "sandbox" | "production";

/** Account details, decrypted only inside an adapter call. Which fields apply depends on `method`. */
export interface BeneficiaryDetails {
  accountNumber?: string;
  routingNumber?: string;
  accountType?: "checking" | "savings";
  iban?: string;
  bic?: string;
  sortCode?: string;
  clabe?: string;
  /** Indian Financial System Code (in_bank). */
  ifsc?: string;
  pixKey?: string;
  documentNumber?: string;
  address?: string;
  bankName?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  email?: string;
}

export interface PayoutBeneficiary {
  id: string;
  holderType: "business" | "individual";
  holderName: string;
  country: string;
  currency: string;
  method: BeneficiaryMethod;
  network: string | null;
  details: BeneficiaryDetails;
}

export interface PayoutRequest {
  paymentId: string;
  attemptNumber: number;
  /** UUID v4, persisted before the call so every retry of this attempt reuses it. */
  idempotencyKey: string;
  /** Decimal string in the source currency/asset — never a float on the wire. */
  amount: string;
  sourceCurrency: string;
  sourceNetwork?: string;
  destinationCurrency: string;
  destinationCountry: string;
  beneficiary: PayoutBeneficiary;
  /** The provider-side id for this beneficiary (Bridge external account, Circle recipient…), when one was registered. */
  beneficiaryProviderRef?: string;
  reference?: string;
  environment: ConnectionEnvironment;
}

export type NormalizedTransferStatus = "awaiting_funds" | "processing" | "completed" | "failed" | "returned" | "cancelled";

/**
 * Every createPayout call ends in exactly one of these. The distinction that
 * matters most is `rejected` vs `unknown`: a rejection is the provider's own
 * definitive "no" (safe to try another provider when `retryableElsewhere`),
 * while `unknown` means the request may have been accepted — the payment is
 * then never re-sent anywhere until reconciliation proves what happened.
 */
export type PayoutOutcome =
  | {
      kind: "accepted";
      providerReference: string;
      providerStatus: string;
      status: NormalizedTransferStatus;
      depositInstructions?: Record<string, unknown>;
      recipientAmount?: string;
      feeAmount?: string;
      feeCurrency?: string;
      response?: Record<string, unknown>;
    }
  | { kind: "rejected"; code: string; message: string; retryableElsewhere: boolean }
  | { kind: "unknown"; message: string };

export interface PayoutStatusResult {
  found: boolean;
  providerReference?: string;
  providerStatus?: string;
  status?: NormalizedTransferStatus;
  failureMessage?: string;
}

export interface ProviderEvent {
  eventId: string;
  providerReference: string;
  providerStatus: string;
  status: NormalizedTransferStatus | null;
}

/**
 * The execution contract. Implemented from each provider's public API
 * documentation; `verification` states honestly how far that has been proven.
 */
export interface PayoutAdapter {
  slug: string;
  /** docs_verified: request/response shapes taken from the provider's published API reference, not yet exercised against a real account by Railor. simulated: Railor's own test rail. */
  verification: "docs_verified" | "simulated";
  supportedMethods: BeneficiaryMethod[];
  /** Credentials needed for payouts beyond those used to test the connection. */
  payoutCredentialFields: CredentialField[];
  /** Registers a beneficiary with the provider when it needs one (returns the provider's id for it). */
  ensureBeneficiary?(
    credentials: Record<string, string>,
    beneficiary: PayoutBeneficiary,
    options: { environment: ConnectionEnvironment; idempotencyKey: string },
  ): Promise<{ providerRef: string }>;
  createPayout(credentials: Record<string, string>, request: PayoutRequest): Promise<PayoutOutcome>;
  getPayout(
    credentials: Record<string, string>,
    lookup: { providerReference?: string; idempotencyKey: string; environment: ConnectionEnvironment; createdAt: Date },
  ): Promise<PayoutStatusResult>;
  /** Signature check for inbound status webhooks; absent = this provider's status is reconciled by polling only. */
  verifyWebhook?(credentials: Record<string, string>, headers: Headers, rawBody: string, now?: Date): boolean;
  parseWebhook?(rawBody: string): ProviderEvent | null;
  quote?(credentials: Record<string, string>, request: PayoutRequest): Promise<UnifiedQuote | null>;
}

export class PaymentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const TERMINAL_STATUSES: ReadonlySet<PaymentStatus> = new Set(["completed", "failed", "returned", "cancelled", "blocked"]);
export const OPEN_STATUSES: ReadonlySet<PaymentStatus> = new Set(["submitting", "awaiting_funds", "processing", "unknown"]);
