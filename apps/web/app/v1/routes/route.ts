import { previewPaymentRoute } from "@railor/core";
import { ApiError } from "../../../lib/api-auth";
import { parsePaymentIntentBody } from "../../../lib/decisions";
import { paymentDeps } from "../../../lib/payments";
import { jsonBody, v1Route } from "../../../lib/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /v1/routes — plan a payment route without creating anything: the
 * policy verdict, ranked executable providers with per-dimension scores and
 * confidence, and every excluded provider with its reason.
 */
export const POST = v1Route("/v1/routes", "POST", async (context, request) => {
  const body = await jsonBody(request);
  const intentRaw = (body.intent && typeof body.intent === "object" ? body.intent : body) as Record<string, unknown>;
  const intent = parsePaymentIntentBody(intentRaw);
  if (!intent.success) throw new ApiError(400, "invalid_intent", intent.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const result = await previewPaymentRoute(
    context.organizationId,
    { mode: context.mode, intent: intent.data, pinnedProvider: (body.provider as string | undefined) ?? undefined },
    paymentDeps(context.organizationId),
  );
  return {
    body: {
      object: "route_plan",
      mode: context.mode,
      policy_verdict: result.decisionStatus,
      outcome: result.outcome.status,
      outcome_reason: result.outcome.failureMessage ?? null,
      preset: result.plan.preset,
      weights: result.plan.weights,
      candidates: result.plan.candidates.map((c) => ({
        provider: c.providerSlug,
        name: c.providerName,
        score: c.score,
        confidence: c.confidence,
        executor: c.executor.kind,
        executor_note: c.executorNote ?? null,
        dimensions: Object.fromEntries(Object.entries(c.dimensions).map(([k, d]) => [k, { score: d.score, weight: d.weight, detail: d.detail }])),
      })),
      excluded: result.plan.excluded.map((e) => ({ provider: e.providerSlug, name: e.providerName, reason: e.reason })),
      generated_at: result.plan.generatedAt,
    },
  };
});
