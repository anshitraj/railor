import { cancelPayment, getPaymentDetail, serializePayment } from "@railor/core";
import { ApiError } from "../../../../../lib/api-auth";
import { v1Route } from "../../../../../lib/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /v1/payments/{id}/cancel — only before a provider has it (requires_approval, ready or blocked). */
export const POST = v1Route<{ id: string }>("/v1/payments/{id}/cancel", "POST", async (context, _request, { id }) => {
  const current = await getPaymentDetail(context.organizationId, id);
  if (current.payment.mode !== context.mode) throw new ApiError(403, "mode_mismatch", `A ${context.mode} key cannot cancel a ${current.payment.mode} payment.`);
  const detail = await cancelPayment(context.organizationId, { userId: null, source: "api" }, id);
  return { body: serializePayment(detail.payment) };
});
