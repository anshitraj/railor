import { NextResponse } from "next/server";
import { getBillingCheckout, getDb } from "@railor/database";
import { getSession } from "../../../../../lib/auth";
import { refreshCheckout } from "../../../../../lib/billing/service";
import { checkoutView } from "../../../../../lib/billing/view";

export const dynamic = "force-dynamic";

/** Where a checkout stands, asking the provider (at most every few seconds) while it is unpaid. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.organization) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const db = await getDb();
  const found = await getBillingCheckout(db, id);
  if (!found || found.organizationId !== session.organization.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const checkout = await refreshCheckout(found);
  return NextResponse.json(await checkoutView(checkout, db), { headers: { "cache-control": "no-store" } });
}
