import { NextResponse } from "next/server";
import { activeProviderPromotions } from "../../../../lib/provider-promotions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to) {
    return NextResponse.json({ promotions: [] }, { status: 400 });
  }
  const headers = { "Cache-Control": "no-store" };
  try {
    return NextResponse.json({ promotions: await activeProviderPromotions(from, to) }, { headers });
  } catch {
    // Fail closed if the migration is still rolling out or the database is unavailable.
    return NextResponse.json({ promotions: [] }, { status: 503, headers });
  }
}
