import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { paymentLink } from "../../../../lib/security";

const PLANS = new Set(["plus", "pro", "business"] as const);

/** Sends an owner or admin to the payment link for the plan they picked. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.organization) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (session.role !== "owner" && session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const requested = String(form?.get("plan") ?? "business");
  if (!PLANS.has(requested as "plus")) return NextResponse.json({ error: "unknown_plan" }, { status: 400 });
  const destination = paymentLink(requested as "plus" | "pro" | "business");
  if (!destination) return NextResponse.json({ error: "checkout_unavailable" }, { status: 503 });
  return NextResponse.redirect(destination, 303);
}
