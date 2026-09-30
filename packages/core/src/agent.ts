import { z } from "zod";
import { PaymentIntent, PolicyRules } from "@railor/types";
import { interpretRules } from "./interpret.js";
import { loadDecision } from "./decision-repository.js";

/** Draft-only tools. No model or natural-language tool may activate policy,
 * grant approval, execute a payment or silently fill missing payment facts. */
export function draftPaymentIntent(text: string, entityCountry?: string) {
  z.string().trim().min(1).max(2000).parse(text);
  const interpretation = interpretRules(text);
  const q = interpretation.query;
  const draft = Object.fromEntries(Object.entries({
    sourceEntityCountry: q.entityCountry ?? entityCountry,
    sourceEntityType: q.customerType, sourceCurrency: q.sourceCurrency,
    sourceAsset: q.sourceAsset, sourceNetwork: q.sourceNetwork,
    destinationCountry: q.destinationCountry, destinationCurrency: q.destinationCurrency,
    product: q.product, amount: q.amount, amountCurrency: q.amountCurrency,
    namedRail: q.namedRail, paymentMethod: q.paymentMethod, endpointType: q.endpointType,
  }).filter(([, v]) => v !== undefined));
  const parsed = PaymentIntent.safeParse(draft);
  return { kind: "payment_intent_draft", draft, valid: parsed.success,
    missing: parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => i.path.join(".")))],
    notes: ["Review every field before evaluating. A draft is not a decision or authorization.",
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
