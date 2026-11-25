import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { BillingError, startCheckout } from "../../../../lib/billing/service";
import { consumeLimit } from "../../../../lib/rate-limit";

/**
 * Opens a checkout for a plan or a wallet top-up and sends the person to pay.
 * A plain form post, so it works before the page's script has loaded.
 * Fields: purpose (plan | top_up), plan, amount (US cents), method (card | usdc), code (optional discount code).
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.organization) return NextResponse.redirect(new URL("/login", request.url), 303);
  const form = await request.formData().catch(() => null);
  const purpose = form?.get("purpose") === "top_up" ? "top_up" : "plan";
  const back = purpose === "plan" ? "/app/upgrade" : "/app/wallet";
  const discountCode = String(form?.get("code") ?? "").trim().toUpperCase().slice(0, 40);
  // A refused code comes back filled in, so the person can fix a typo instead of retyping it.
  const keep = /^[A-Z0-9_-]{3,16}$/.test(discountCode) ? `&code=${discountCode}` : "";
  const fail = (code: string) => NextResponse.redirect(new URL(`${back}?billing_error=${code}${code.startsWith("discount_") ? keep : ""}`, request.url), 303);
  const method = form?.get("method");
  // No default: a form that lost its button's value must not open the wrong checkout.
  if (method !== "card" && method !== "usdc") return fail("method_unavailable");
  if (!await consumeLimit("billing-checkout", session.organization.id, 20, 3_600_000)) return fail("provider_unavailable");
  try {
    const { redirect } = await startCheckout(session, {
      purpose,
      method,
      plan: purpose === "plan" ? String(form?.get("plan") ?? "") : null,
      amountCents: purpose === "top_up" ? Number(form?.get("amount")) : null,
      discountCode: discountCode || null,
    });
    return NextResponse.redirect(new URL(redirect, request.url), 303);
  } catch (error) {
    if (error instanceof BillingError) return fail(error.code);
    console.error("[billing] checkout", error);
    return fail("provider_unavailable");
  }
}
