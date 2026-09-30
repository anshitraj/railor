import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { paymentLink } from "../../../../lib/security";
export async function POST() {
  const session = await getSession();
  if (!session?.organization) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (session.role !== "owner" && session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const destination = paymentLink();
  if (!destination) return NextResponse.json({ error: "checkout_unavailable" }, { status: 503 });
  return NextResponse.redirect(destination, 303);
}
