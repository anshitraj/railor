import { z } from "zod";
import { PaymentIntent, PolicyRules, type RankingPreset } from "@railor/types";
import { interpretRules } from "./interpret.js";
import { loadDecision } from "./decision-repository.js";

/** Draft and read-only search tools. No natural-language tool may activate policy,
 * grant approval, execute a payment or silently fill missing payment facts. */
export function agentPreference(text: string): RankingPreset | null {
  const value = text.toLowerCase();
  const priority = value.match(/\b(reliability|speed|price|cost)\s+(?:matters? more than|over)\s+(reliability|speed|price|cost)\b/);
  if (priority) return priority[1] === "reliability" ? "most_reliable" : priority[1] === "speed" ? "fastest" : "cheapest";
  if (/\b(?:reliability|reliable|uptime)\b/.test(value) && !/\b(?:not|ignore|don't prioritize)\s+(?:reliability|reliable|uptime)\b/.test(value)) return "most_reliable";
  if (/\b(?:fastest|fast|speed|quickest|as soon as possible)\b/.test(value)) return "fastest";
  if (/\b(?:maximum|max|highest|most)\s+(?:recipient|received|payout)|\bmaximize\s+(?:recipient|payout)\b/.test(value)) return "max_recipient_amount";
  if (/\b(?:cheapest|lowest (?:cost|fees?)|minimi[sz]e (?:cost|fees?)|prioriti[sz]e (?:price|cost)|compare by price|price matters)\b/.test(value)) return "cheapest";
  if (/\b(?:balanced|balance (?:cost|price|speed)|best overall)\b/.test(value)) return "balanced";
  return null;
}

export function draftPaymentIntent(text: string, entityCountry?: string) {
  z.string().trim().min(1).max(2000).parse(text);
  const interpretation = interpretRules(text);
  const q = interpretation.query;
  const explicit = (field: string) => interpretation.tokens.some((token) => token.field === field && Boolean(token.matchedText));
  const inferred = interpretation.tokens.filter((token) => !token.matchedText && ["destinationCountry", "destinationCurrency"].includes(token.field));
  const preference = agentPreference(text) ?? "balanced";
  const draft = Object.fromEntries(Object.entries({
    sourceEntityCountry: q.entityCountry ?? entityCountry,
    sourceEntityType: q.customerType, sourceCurrency: q.sourceAsset ? undefined : q.sourceCurrency,
    sourceAsset: q.sourceAsset, sourceNetwork: q.sourceNetwork,
    destinationCountry: q.destinationCountry, destinationCurrency: q.destinationCurrency,
    product: explicit("product") ? q.product : undefined, amount: q.amount,
    amountCurrency: q.sourceAsset ? undefined : q.sourceCurrency,
    namedRail: q.namedRail, paymentMethod: explicit("paymentMethod") ? q.paymentMethod : undefined,
    endpointType: q.endpointType, preference,
  }).filter(([, v]) => v !== undefined));
  const parsed = PaymentIntent.safeParse(draft);
  const missing = [...new Set([...(parsed.success ? [] : parsed.error.issues.map((i) => i.path.join("."))),
    ...(!draft.sourceAsset && !draft.sourceCurrency ? ["sourceAsset or sourceCurrency"] : []),
    ...(draft.sourceAsset && !draft.sourceNetwork ? ["sourceNetwork"] : []),
    ...(!draft.destinationCurrency ? ["destinationCurrency"] : []),
  ])];
  return { kind: "payment_intent_draft" as const, draft, valid: parsed.success && missing.length === 0,
    missing, needsReview: inferred.length > 0,
    inferredFields: inferred.map((token) => ({ field: token.field, value: token.value })),
    notes: [
      ...(inferred.length ? ["Destination values suggested from the country or currency need your confirmation."] : []),
      ...(entityCountry && !q.entityCountry ? ["Entity country came from your workspace profile."] : [])],
    interpretation,
  };
}

export function draftPolicy(text: string, providerSlugs: string[]) {
  z.string().trim().min(1).max(2000).parse(text);
  const clauses = text.toLowerCase().split(/[;\n.]+/).map((s) => s.trim()).filter(Boolean);
  const draft: Record<string, unknown> = {};
  const unrecognized: string[] = [];
  for (const clause of clauses) {
    if (clause === "require exact route evidence") draft.requireExactRouteEvidence = true;
    else if (clause === "require confirmed entity eligibility") draft.requireConfirmedEntityEligibility = true;
    else if (clause === "require connected provider") draft.requireCustomerConnectedProvider = true;
    else if (clause === "require live quote") draft.requireLiveQuote = true;
    else if (clause === "block during incidents") draft.denyDuringActiveIncident = true;
    else if (/^approval above \d+$/.test(clause)) draft.humanApprovalAboveAmount = Number(clause.split(" ").at(-1));
    else if (/^maximum evidence age \d+ hours$/.test(clause)) draft.maximumEvidenceAgeHours = Number(clause.split(" ").at(-2));
    else if (/^(allow|block) provider [a-z0-9-]+$/.test(clause)) {
      const provider = clause.split(" ").at(-1)!;
      if (!providerSlugs.includes(provider)) { unrecognized.push(clause); continue; }
      const key = clause.startsWith("allow") ? "providerAllowlist" : "providerDenylist";
      draft[key] = [...new Set([...(draft[key] as string[] | undefined ?? []), provider])];
    } else unrecognized.push(clause);
  }
  return { kind: "policy_draft", draft: PolicyRules.parse(draft), unrecognized,
    notes: ["Unrecognized clauses are NOT enforced. Review the complete rules before saving a draft.", "Approval thresholds use the intent amount currency; no FX normalization is implied."] };
}

export async function explainDecision(organizationId: string, id: string) {
  const loaded = await loadDecision(organizationId, z.string().uuid().parse(id));
  if (!loaded) throw new Error("decision_not_found");
  return { kind: "decision_explanation", id, status: loaded.decision.status,
    mode: loaded.decision.mode, provider: loaded.decision.recommendedProviderSlug ?? loaded.decision.proposedExecutor,
    explanation: loaded.decision.explain, warnings: loaded.decision.warnings,
    candidates: loaded.candidates.map((c) => ({ providerId: c.providerId, selected: c.selected, rules: c.policyEvaluation })),
    decisionHash: loaded.decision.decisionHash, evaluatedAt: loaded.decision.evaluatedAt,
    notes: ["This explains the stored decision. Revalidate to assess current conditions."] };
}
