export type BillingErrorCode = "forbidden" | "unknown_plan" | "bad_amount" | "method_unavailable" | "provider_unavailable" | "founding" | "already_on_plan" | "has_subscription" | "no_subscription";

export class BillingError extends Error {
  constructor(readonly code: BillingErrorCode, message: string) { super(message); }
}

/** What each error says on the page it sends the person back to. */
export const BILLING_ERROR_TEXT: Record<BillingErrorCode, string> = {
  forbidden: "Only workspace owners and admins can pay for Railor.",
  unknown_plan: "That plan isn’t available. Pick one of the plans below.",
  bad_amount: "Pick one of the top-up amounts.",
  method_unavailable: "That way to pay isn’t switched on yet. Try the other one.",
  provider_unavailable: "The payment page didn’t open. Nothing was charged. Try again in a minute.",
  founding: "Your Founding plan already includes everything in Business.",
  already_on_plan: "You’re already on this plan.",
  has_subscription: "Your plan renews by card. Switch plans with the card option, or cancel renewal first.",
  no_subscription: "There’s no card subscription to change.",
};

export function billingErrorText(code: string | null | undefined): string | null {
  return code && Object.hasOwn(BILLING_ERROR_TEXT, code) ? BILLING_ERROR_TEXT[code as BillingErrorCode] : null;
}
