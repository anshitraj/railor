/**
 * Decision revalidation. A historical Decision is never edited in place —
 * this always produces a brand-new Decision row linked back via
 * previousDecisionId, and only ever flags the old row's
 * `revalidationRequired` boolean (a signal, not a rewrite of its recorded
 * explanation). Re-runs the exact same deterministic Decision Engine used
 * for a first-time decision — no separate "revalidation logic" exists to
 * drift out of sync with it.
 */
import { PaymentIntent, type RevalidationTrigger } from "@railor/types";
import { runDecisionEngine, type DecisionEngineOptions, type DecisionEnginePolicyContext } from "./decision-engine.js";
import {
  appendDecisionEvent,
  getPolicyVersion,
  loadDecision,
  markRevalidationRequired,
  persistDecision,
} from "./decision-repository.js";
import type { PolicyRules } from "@railor/types";

export interface RevalidateDecisionOptions {
  organizationId: string;
  trigger: RevalidationTrigger;
  detail?: string;
  now?: Date;
  fetchQuote?: DecisionEngineOptions["fetchQuote"];
  /** Only supplied for a policy_changed trigger — the newly-activated version to revalidate against. Any other trigger reuses the original Decision's own policy version, since its rules are immutable once activated. */
  policyOverride?: DecisionEnginePolicyContext;
}

export type RevalidateDecisionResult =
  | { ok: true; decisionId: string; previousDecisionId: string; recommendationChanged: boolean }
  | { ok: false; error: "decision_not_found" | "policy_version_not_found" | "invalid_intent_snapshot" };

export async function revalidateDecision(
  decisionId: string,
  options: RevalidateDecisionOptions,
): Promise<RevalidateDecisionResult> {
  const existing = await loadDecision(options.organizationId, decisionId);
  if (!existing) return { ok: false, error: "decision_not_found" };

  await appendDecisionEvent(
    options.organizationId,
    decisionId,
    "revalidation_requested",
    options.detail ?? `Revalidation requested (trigger: ${options.trigger}).`,
    { trigger: options.trigger },
  );
  await markRevalidationRequired(options.organizationId, decisionId);

  const parsedIntent = PaymentIntent.safeParse(existing.decision.intentSnapshot);
  if (!parsedIntent.success) return { ok: false, error: "invalid_intent_snapshot" };

  let policyContext: DecisionEnginePolicyContext;
  if (options.policyOverride) {
    policyContext = options.policyOverride;
  } else {
    const version = await getPolicyVersion(options.organizationId, existing.decision.policyVersionId);
    if (!version) return { ok: false, error: "policy_version_not_found" };
    policyContext = {
      policyId: existing.decision.policyId,
      policyVersionId: version.id,
      policyVersionNumber: version.versionNumber,
      rules: version.rules as unknown as PolicyRules,
    };
  }

  const newDecisionInput = await runDecisionEngine(parsedIntent.data, policyContext, {
    organizationId: options.organizationId,
    now: options.now,
    fetchQuote: options.fetchQuote,
    previousDecisionId: decisionId,
  });

  const created = await persistDecision(newDecisionInput);

  const recommendationChanged = existing.decision.recommendedProviderSlug !== newDecisionInput.recommendedProviderSlug;
  if (recommendationChanged) {
    await appendDecisionEvent(
      options.organizationId,
      created.id,
      "recommendation_changed",
      `Recommendation changed from ${existing.decision.recommendedProviderSlug ?? "none"} to ${newDecisionInput.recommendedProviderSlug ?? "none"}.`,
      { previous: existing.decision.recommendedProviderSlug, current: newDecisionInput.recommendedProviderSlug },
    );
  }

  return { ok: true, decisionId: created.id, previousDecisionId: decisionId, recommendationChanged };
}
