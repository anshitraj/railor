import { createWebhookEndpoint, listWebhookEndpoints } from "@railor/core";
import { z } from "zod";
import { jsonBody, v1Route } from "../../../lib/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const serialize = (e: Awaited<ReturnType<typeof listWebhookEndpoints>>[number]) => ({
  object: "webhook_endpoint",
  id: e.id,
  url: e.url,
  description: e.description,
  mode: e.mode,
  events: e.events,
  enabled: e.enabled,
  secret_hint: e.secretHint,
  created_at: e.createdAt.toISOString(),
});

/** GET /v1/webhook_endpoints — endpoints for this key's mode. */
export const GET = v1Route("/v1/webhook_endpoints", "GET", async (context) => {
  const rows = (await listWebhookEndpoints(context.organizationId)).filter((e) => e.mode === context.mode);
  return { body: { object: "list", data: rows.map(serialize), has_more: false } };
});

/**
 * POST /v1/webhook_endpoints — { url, events?: ["payment.*"], description? }.
 * The signing secret is returned once, in this response only.
 */
export const POST = v1Route("/v1/webhook_endpoints", "POST", async (context, request) => {
  const body = z
    .object({ url: z.string().max(500), events: z.array(z.string().max(60)).max(20).optional(), description: z.string().max(200).optional() })
    .parse(await jsonBody(request));
  const { endpoint, secret } = await createWebhookEndpoint(context.organizationId, null, { ...body, mode: context.mode });
  return { status: 201, body: { ...serialize(endpoint), secret } };
});
