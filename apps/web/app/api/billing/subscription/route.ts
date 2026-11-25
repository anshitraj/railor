import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { BillingError, setRenewal } from "../../../../lib/billing/service";

/** Cancels or restarts renewal of the workspace's card plan. Form field: action = cancel | resume. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.organization) return NextResponse.redirect(new URL("/login", request.url), 303);
  const form = await request.formData().catch(() => null);
  const action = form?.get("action");
  if (action !== "cancel" && action !== "resume") return NextResponse.redirect(new URL("/app/upgrade", request.url), 303);
  try {
    await setRenewal(session, action === "cancel");
    return NextResponse.redirect(new URL(`/app/upgrade?billing=${action === "cancel" ? "cancelled" : "resumed"}`, request.url), 303);
  } catch (error) {
    const code = error instanceof BillingError ? error.code : "provider_unavailable";
    if (!(error instanceof BillingError)) console.error("[billing] renewal", error);
    return NextResponse.redirect(new URL(`/app/upgrade?billing_error=${code}`, request.url), 303);
  }
}
