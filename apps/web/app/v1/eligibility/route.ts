import { NextResponse } from "next/server";
import { evaluateProvider, loadProviderInputs } from "@railor/core";
import { CorridorQuery } from "@railor/types";
import {
  ApiError,
  authenticate,
  camelQuery,
  recordUsage,
  snake,
  type ApiContext,
} from "../../../lib/api-auth";
import { getSatisfiedRequirements } from "../../../lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERDICT_ORDER = {
  supported: 0,
  additional_requirements: 1,
  unknown: 2,
  unavailable: 3,
} as const;

/**
 * POST /v1/eligibility
 *
 * The readiness answer: not "who serves this corridor" (that is
 * /v1/corridors/search) but "could *my organization* clear onboarding".
 * The org's KYB profile — the requirement keys it has marked as held — is
 * diffed against each provider's published requirements, so every result
 * states exactly what is already satisfied and what is still outstanding.
 *
 * `satisfied_requirements` in the body overrides the stored profile, which
 * makes "what if we already had X" answerable without editing the profile.
 * An empty profile is reported honestly (`profile_complete: false`) rather
 * than silently graded as zero readiness.
 */
export async function POST(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const { provider: providerSlug, satisfied_requirements: override, ...rest } = body;
    const query = CorridorQuery.parse(camelQuery(rest));

    if (override !== undefined && !Array.isArray(override)) {
      throw new ApiError(
        400,
        "invalid_request",
        "`satisfied_requirements` must be an array of requirement keys.",
      );
    }

    const satisfied = (override as string[] | undefined)?.map(String) ?? (await getSatisfiedRequirements(context.organizationId));
    const satisfiedSet = new Set(satisfied);

    let inputs = await loadProviderInputs();
    if (providerSlug !== undefined) {
      inputs = inputs.filter((p) => p.slug === String(providerSlug));
      if (!inputs.length) {
        throw new ApiError(404, "provider_not_found", `No provider with slug "${providerSlug}".`);
      }
    }

    const results = inputs.map((provider) => {
      const evaluation = evaluateProvider(provider, query, {
        satisfiedRequirements: satisfied,
      });
      const held = provider.requirementKeys.filter((k) => satisfiedSet.has(k));
      const outstanding = provider.requirementKeys.filter((k) => !satisfiedSet.has(k));

      return {
        object: "eligibility_result",
        provider: {
          id: provider.id,
          slug: provider.slug,
          name: provider.name,
          category: provider.category,
        },
        eligibility: evaluation.verdict,
        confidence: evaluation.confidence,
        confidence_band: evaluation.band,
        last_verified_at: evaluation.lastVerifiedAt?.toISOString() ?? null,
        matched_product: evaluation.matchedProduct,
        readiness: {
          requirements_total: provider.requirementKeys.length,
          satisfied: held.map((k) => ({ key: k, label: provider.requirementLabels[k] ?? k })),
          outstanding: outstanding.map((k) => ({
            key: k,
            label: provider.requirementLabels[k] ?? k,
          })),
        },
        reasons: evaluation.reasons.map((r) => snake(r as unknown as Record<string, unknown>)),
        evidence: evaluation.evidence.map((e) => snake(e as unknown as Record<string, unknown>)),
      };
    });

    results.sort(
      (a, b) =>
        VERDICT_ORDER[a.eligibility] - VERDICT_ORDER[b.eligibility] ||
        a.provider.name.localeCompare(b.provider.name),
    );

    const payload = {
      object: "eligibility_report",
      request_id: context.requestId,
      query: snake(query),
      kyb_profile: {
        source: override !== undefined ? "request_override" : "organization_profile",
        profile_complete: satisfied.length > 0,
        satisfied_requirements: satisfied,
      },
      providers_checked: results.length,
      counts: {
        supported: results.filter((r) => r.eligibility === "supported").length,
        additional_requirements: results.filter(
          (r) => r.eligibility === "additional_requirements",
        ).length,
        unknown: results.filter((r) => r.eligibility === "unknown").length,
        unavailable: results.filter((r) => r.eligibility === "unavailable").length,
      },
      data: results,
      has_more: false,
      generated_at: new Date().toISOString(),
    };

    await recordUsage(context, "/v1/eligibility", "POST", 200, Date.now() - started);
    return NextResponse.json(payload);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/eligibility", "POST", status, Date.now() - started);
    return NextResponse.json(
      { object: "error", error: { code, message: (error as Error).message } },
      { status },
    );
  }
}
