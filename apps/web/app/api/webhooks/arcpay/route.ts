import { NextResponse } from "next/server";
import { arcpayConfig } from "../../../../lib/billing/config";
import { verifyArcWebhook } from "../../../../lib/billing/arcpay";
import { handleArcEvent } from "../../../../lib/billing/service";

export const dynamic = "force-dynamic";

/**
 * ArcPay events. ArcPay's signature has no timestamp, so the event only names
 * the payment; its status and amount are read back from ArcPay's API.
 */
export async function POST(request: Request) {
  const config = arcpayConfig();
  if (!config?.webhookSecret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 512_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  if (!verifyArcWebhook(raw, request.headers.get("x-arc-signature"), config.webhookSecret)) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  let event: unknown;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  try {
    await handleArcEvent(event);
  } catch (error) {
    console.error("[billing] ArcPay webhook", error);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
