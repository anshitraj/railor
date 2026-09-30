import { createPayment, listPayments, serializePayment } from "@railor/core";
import { ApiError } from "../../../lib/api-auth";
import { parsePaymentIntentBody } from "../../../lib/decisions";
import { paymentDeps } from "../../../lib/payments";
import { jsonBody, v1Route } from "../../../lib/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /v1/payments — this key's mode only (test keys see test payments).
 * POST /v1/payments — evaluate policy, plan the route, record the payment.
 *   Does NOT send it: call POST /v1/payments/{id}/submit. Send an
 *   `Idempotency-Key` header so a retried create returns the same payment.
 */
export const GET = v1Route("/v1/payments", "GET", async (context, request) => {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25) || 25, 100);
  const before = url.searchParams.get("created_before");
  const rows = await listPayments(context.organizationId, {
    mode: context.mode,
    status: url.searchParams.get("status") ?? undefined,
    limit: limit + 1,
    before: before ? new Date(before) : undefined,
  });
  return { body: { object: "list", data: rows.slice(0, limit).map((r) => serializePayment(r.payment)), has_more: rows.length > limit } };
});

export const POST = v1Route("/v1/payments", "POST", async (context, request) => {
  const body = await jsonBody(request);
  const intentRaw = (body.intent && typeof body.intent === "object" ? body.intent : body) as Record<string, unknown>;
  const intent = parsePaymentIntentBody(intentRaw);
  if (!intent.success) throw new ApiError(400, "invalid_intent", intent.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
  const { payment, replayed } = await createPayment(
    context.organizationId,
    { userId: null, source: "api" },
    {
      mode: context.mode,
      intent: intent.data,
      beneficiaryId: body.beneficiary_id ?? body.beneficiaryId,
      pinnedProvider: body.provider ?? body.pinned_provider ?? undefined,
      reference: body.reference ?? undefined,
      idempotencyKey,
    },
    paymentDeps(context.organizationId),
  );
  return { status: replayed ? 200 : 201, body: { ...serializePayment(payment), idempotent_replayed: replayed } };
});
