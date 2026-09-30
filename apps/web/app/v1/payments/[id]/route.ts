import { getPaymentDetail, serializePayment, syncAuthorization } from "@railor/core";
import { ApiError } from "../../../../lib/api-auth";
import { v1Route } from "../../../../lib/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /v1/payments/{id} — the payment, its attempts (one per provider tried) and its append-only event history. */
export const GET = v1Route<{ id: string }>("/v1/payments/{id}", "GET", async (context, _request, { id }) => {
  let detail = await getPaymentDetail(context.organizationId, id);
  if (detail.payment.mode !== context.mode) throw new ApiError(404, "not_found", "Payment not found for this key's mode.");
  if (detail.payment.status === "requires_approval") {
    await syncAuthorization(detail.payment, { userId: null, source: "api" });
    detail = await getPaymentDetail(context.organizationId, id);
  }
  return {
    body: {
      ...serializePayment(detail.payment),
      attempts: detail.attempts.map((a) => ({
        object: "payment_attempt",
        number: a.attemptNumber,
        provider: a.providerSlug,
        executor: a.executor,
        environment: a.environment,
        status: a.status,
        provider_reference: a.providerReference,
        provider_status: a.providerStatus,
        error_code: a.errorCode,
        error_message: a.errorMessage,
        created_at: a.createdAt.toISOString(),
      })),
      events: detail.events.map((e) => ({ type: e.type, from: e.fromStatus, to: e.toStatus, source: e.source, created_at: e.createdAt.toISOString() })),
    },
  };
});
