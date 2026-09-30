import { NextResponse } from "next/server";
import { PaymentError, ingestProviderWebhook } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { consumeLimit, requestIdentity } from "../../../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Status webhooks from a provider, one URL per connection so the right
 * public key verifies the signature. Unsigned or mis-signed events are
 * refused (401) and never change a payment; duplicates are acknowledged
 * without being applied twice.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; connectionId: string }> }) {
  const { slug, connectionId } = await params;
  if (!(await consumeLimit("provider-webhook", `${slug}:${connectionId}`, 600, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const raw = await request.text();
  if (raw.length > 256_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  await ensureMigrated();
  try {
    const result = await ingestProviderWebhook(slug, connectionId, request.headers, raw);
    return NextResponse.json({ received: true, outcome: result.outcome });
  } catch (error) {
    if (error instanceof PaymentError) return NextResponse.json({ error: error.code }, { status: error.status });
    console.error(JSON.stringify({ event: "provider_webhook_failed", slug, identity: requestIdentity(request).slice(0, 3), error: error instanceof Error ? error.message : "unknown" }));
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
