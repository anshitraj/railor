import { NextResponse } from "next/server";
import { dodoConfig } from "../../../../lib/billing/config";
import { verifyDodoWebhook } from "../../../../lib/billing/dodo";
import { handleDodoEvent } from "../../../../lib/billing/service";

export const dynamic = "force-dynamic";

/**
 * Dodo Payments events. The signature proves Dodo sent it; what it says is
 * then read back from Dodo's API before anything is credited. A failure
 * answers 500 so Dodo retries.
 */
export async function POST(request: Request) {
  const config = dodoConfig();
  if (!config?.webhookKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 512_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const signed = verifyDodoWebhook(raw, {
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
  }, config.webhookKey);
  if (!signed) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  let event: unknown;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  try {
    await handleDodoEvent(event);
  } catch (error) {
    console.error("[billing] Dodo webhook", error);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
