import "server-only";
import { getAdapter, loadDecision, loadConnectorQuote, wisePublicQuote, type QuoteFetcher } from "@railor/core";
import { PaymentIntent } from "@railor/types";
import { getConnectionCredentials } from "./connections";
import { fetchPlatformReferenceQuote } from "./platform-pricing";

/** snake_case wire body -> PaymentIntent. Field renaming only, same discipline as api-auth.ts's camelQuery — never fills in a value the caller didn't send. */
export function parsePaymentIntentBody(body: Record<string, unknown>) {
  const normalized = Object.fromEntries(Object.entries(body).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), value]));
  body = normalized;
  return PaymentIntent.safeParse({
    sourceEntityCountry: body.source_entity_country,
    sourceEntityType: body.source_entity_type,
    sourceAsset: body.source_asset,
    sourceNetwork: body.source_network,
    sourceCurrency: body.source_currency,
    destinationCountry: body.destination_country,
    destinationCurrency: body.destination_currency,
    beneficiaryType: body.beneficiary_type,
    endpointType: body.endpoint_type,
    namedRail: body.named_rail,
    paymentMethod: body.payment_method,
    product: body.product,
    amount: body.amount,
    amountCurrency: body.amount_currency,
    preference: body.preference,
  });
}

/**
 * The one place credential decryption meets the Decision Engine. Mirrors
 * exactly how apps/web/app/v1/quote/route.ts already hands routing.ts a
 * decrypted-credentials closure — @railor/core never sees ciphertext or a
 * decryption key, only a resolved UnifiedQuote or null.
 */
export function buildFetchQuote(organizationId: string, connectorOnly = false, allowPlatformReference = false): QuoteFetcher {
  return async (providerSlug, providerId, request) => {
    const local = await loadConnectorQuote(organizationId, providerSlug, request);
    if (local || connectorOnly) return local;
    const adapter = getAdapter(providerSlug);
    if (!adapter?.getQuote) return null;
    const credentials = await getConnectionCredentials(organizationId, providerId);
    if (!credentials) {
      if (allowPlatformReference) {
        const reference = await fetchPlatformReferenceQuote(providerSlug, request);
        if (reference) return reference;
      }
      return providerSlug === "wise" ? wisePublicQuote(request) : null;
    }
    return adapter.getQuote(credentials, request);
  };
}

/** snake_case wire shape for a Decision + its candidates — the canonical read, used by every /v1/decisions* route so a client never sees two different shapes for the same object. */
export async function serializeDecisionById(organizationId: string, decisionId: string) {
  const loaded = await loadDecision(organizationId, decisionId);
  if (!loaded) return null;
  const { decision, candidates } = loaded;
  return {
    object: "decision",
    id: decision.id,
    mode: decision.mode,
    proposed_executor: decision.proposedExecutor ? { provider: decision.proposedExecutor } : null,
    created_by: decision.createdBy,
    organization_id: decision.organizationId,
    intent: decision.intentSnapshot,
    policy_id: decision.policyId,
    policy_version_id: decision.policyVersionId,
    policy_version_number: decision.policyVersionNumber,
    engine_version: decision.engineVersion,
    status: decision.status,
    recommended_provider_id: decision.recommendedProviderId,
    recommended_provider_slug: decision.recommendedProviderSlug,
    recommended_route_id: decision.recommendedRouteId,
    certainty: decision.certainty,
    ranking_confidence: Number(decision.rankingConfidence),
    quote_state: decision.quoteState,
    connection_state: decision.connectionState,
    evaluated_at: decision.evaluatedAt.toISOString(),
    valid_until: decision.validUntil ? decision.validUntil.toISOString() : null,
    revalidation_required: decision.revalidationRequired,
    decision_hash: decision.decisionHash,
    warnings: decision.warnings,
    explain: decision.explain,
    previous_decision_id: decision.previousDecisionId,
    created_at: decision.createdAt.toISOString(),
    candidates: candidates.map((c) => ({
      id: c.id,
      provider_id: c.providerId,
      provider_slug: c.providerSlug,
      provider_name: c.providerName,
      route_id: c.routeId,
      eligibility_status: c.eligibilityStatus,
      route_certainty: c.routeCertainty,
      entity_eligibility: c.entityEligibility,
      policy_result: c.policyResult,
      policy_evaluation: c.policyEvaluation,
      dependency_snapshot: c.dependencySnapshot,
      policy_reason_codes: c.policyReasonCodes,
      quote_snapshot: c.quoteSnapshot,
      quote_type: c.quoteType,
      quote_observed_at: c.quoteObservedAt ? c.quoteObservedAt.toISOString() : null,
      quote_expires_at: c.quoteExpiresAt ? c.quoteExpiresAt.toISOString() : null,
      cost_completeness: c.costCompleteness,
      reliability_snapshot: c.reliabilitySnapshot === null ? null : Number(c.reliabilitySnapshot),
      rank: c.rank,
      selected: c.selected,
      rejection_reason_codes: c.rejectionReasonCodes,
      evidence_ids: c.evidenceIds,
    })),
  };
}

/** Recent decisions as picker choices — so no workflow ever asks a person to paste a UUID. */
export async function recentDecisionChoices(organizationId: string, limit = 12) {
  const { listDecisions } = await import("@railor/core");
  const rows = await listDecisions(organizationId, {});
  return rows.slice(0, limit).map((d) => {
    const intent = d.intentSnapshot as Record<string, unknown>;
    const provider = d.proposedExecutor ?? d.recommendedProviderSlug ?? "no provider";
    const from = String(intent.sourceCurrency ?? intent.sourceAsset ?? "");
    const to = String(intent.destinationCurrency ?? intent.destinationCountry ?? "");
    return {
      id: d.id,
      status: d.status,
      label: `${provider} · ${String(intent.amount ?? "")} ${from} → ${to}`,
      evaluatedAt: d.evaluatedAt.toISOString().slice(0, 16).replace("T", " "),
    };
  });
}
