import "server-only";
import type { BillingCheckout, RailorDb } from "@railor/database";
import { getEntitlement } from "../entitlements";

/** What the payment status page shows. Never carries provider ids or anything the browser could replay. */
export interface CheckoutView {
  status: "pending" | "paid" | "failed";
  purpose: "plan" | "top_up";
  plan: "plus" | "pro" | "business" | null;
  method: "card" | "usdc";
  amountCents: number;
  testMode: boolean;
  failureReason: string | null;
  /** The USDC checkout page, while it can still be paid. */
  checkoutUrl: string | null;
  expired: boolean;
  /** For a paid plan: whether the workspace is on it yet. */
  planActive: boolean | null;
  planUntil: string | null;
}

const CHECKOUT_LIFETIME_MS = 24 * 3_600_000;

export async function checkoutView(checkout: BillingCheckout, db: RailorDb, now = Date.now()): Promise<CheckoutView> {
  const paid = checkout.status === "paid";
  const entitlement = checkout.purpose === "plan" && paid ? await getEntitlement(checkout.organizationId, db) : null;
  const onPlan = Boolean(entitlement && entitlement.plan === checkout.plan);
  return {
    status: checkout.status,
    purpose: checkout.purpose,
    plan: checkout.plan,
    method: checkout.provider === "dodo" ? "card" : "usdc",
    amountCents: checkout.amountCents,
    testMode: checkout.testMode,
    failureReason: checkout.status === "failed" ? checkout.failureReason : null,
    checkoutUrl: !paid && checkout.provider === "arcpay" ? checkout.checkoutUrl : null,
    expired: !paid && now - checkout.createdAt.getTime() > CHECKOUT_LIFETIME_MS,
    planActive: entitlement ? onPlan : null,
    planUntil: onPlan ? entitlement!.validUntil?.toISOString() ?? null : null,
  };
}
