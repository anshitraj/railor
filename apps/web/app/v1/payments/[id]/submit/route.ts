import { getPaymentDetail, serializePayment, submitPayment } from "@railor/core";
import { ApiError } from "../../../../../lib/api-auth";
import { paymentDeps } from "../../../../../lib/payments";
import { v1Route } from "../../../../../lib/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /v1/payments/{id}/submit — sends the payment. Test keys can only send
 * test payments; live keys only live ones. Exactly one submit wins: a second
 * call gets 409 with the payment's current status.
 */
export const POST = v1Route<{ id: string }>("/v1/payments/{id}/submit", "POST", async (context, _request, { id }) => {
  const current = await getPaymentDetail(context.organizationId, id);
  if (current.payment.mode !== context.mode) throw new ApiError(403, "mode_mismatch", `A ${context.mode} key cannot send a ${current.payment.mode} payment.`);
  const detail = await submitPayment(context.organizationId, { userId: null, source: "api", role: null }, id, paymentDeps(context.organizationId));
  return { body: serializePayment(detail.payment) };
});
