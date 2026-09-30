import { deleteWebhookEndpoint } from "@railor/core";
import { v1Route } from "../../../../lib/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /v1/webhook_endpoints/{id} — stops deliveries; pending ones are dropped with it. */
export const DELETE = v1Route<{ id: string }>("/v1/webhook_endpoints/{id}", "DELETE", async (context, _request, { id }) => {
  await deleteWebhookEndpoint(context.organizationId, id);
  return { body: { object: "webhook_endpoint", id, deleted: true } };
});
