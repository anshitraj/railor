import { PolicyRules } from "@railor/types";

export type DraftRules = Record<string, unknown>;
export type GuardrailProfile = "verified" | "strict" | "custom";

export const POLICY_CHECKS = [
  { key: "requireExactRouteEvidence", question: "Must the exact route be verified?", label: "Verified route evidence", hint: "Require evidence for the full route, rather than general country or currency coverage.", yes: "Require a verified route", no: "Allow unconfirmed routes" },
  { key: "requireConfirmedEntityEligibility", question: "Must your company's eligibility be confirmed?", label: "Confirmed company eligibility", hint: "Check that the provider can onboard your company. Unknown eligibility fails this check when it is required.", yes: "Require confirmed eligibility", no: "Allow unknown eligibility" },
  { key: "requireCustomerConnectedProvider", question: "Should Railor use only providers you've connected?", label: "Connected providers only", hint: "A connection means your workspace has linked its own provider account.", yes: "Use connected providers only", no: "Also consider other providers" },
  { key: "requireLiveQuote", question: "Is a live quote required before a route can pass?", label: "Live quote required", hint: "Requiring a live quote excludes routes with no fresh quote from a connected provider account.", yes: "Require a live quote", no: "Allow evaluation without a live quote" },
  { key: "denyDuringActiveIncident", question: "Should a provider be blocked during an incident?", label: "Block providers during incidents", hint: "Exclude a provider while Railor records an active service incident.", yes: "Block until the incident clears", no: "Keep the provider eligible" },
] as const;

export function listRule(rules: DraftRules, key: string): string[] {
  return Array.isArray(rules[key]) ? (rules[key] as unknown[]).filter((v): v is string => typeof v === "string") : [];
}
export function numberRule(rules: DraftRules, key: string): number | undefined {
  return typeof rules[key] === "number" ? rules[key] as number : undefined;
}
export function guardrailProfile(rules: DraftRules): GuardrailProfile {
  const normalized = PolicyRules.parse(rules);
  if (POLICY_CHECKS.every(({ key }) => normalized[key])) return "strict";
  if (normalized.requireExactRouteEvidence && normalized.requireConfirmedEntityEligibility && normalized.denyDuringActiveIncident && !normalized.requireCustomerConnectedProvider && !normalized.requireLiveQuote) return "verified";
  return "custom";
}
/** A preset changes only its five checks; amounts, lists and advanced rules survive. */
export function applyGuardrailProfile(rules: DraftRules, profile: GuardrailProfile): DraftRules {
  if (profile === "custom") return rules;
  return { ...rules, requireExactRouteEvidence: true, requireConfirmedEntityEligibility: true, denyDuringActiveIncident: true, requireCustomerConnectedProvider: profile === "strict", requireLiveQuote: profile === "strict" };
}
export function hasPolicyLimits(rules: DraftRules) {
  return numberRule(rules, "maximumKnownCostBps") !== undefined || numberRule(rules, "maximumEtaMinutes") !== undefined;
}
export const SCOPE_RULES = ["providerAllowlist", "providerDenylist", "allowedAssets", "allowedNetworks"] as const;
export function hasPolicyScope(rules: DraftRules) { return SCOPE_RULES.some((key) => listRule(rules, key).length > 0); }
export function clearRules(rules: DraftRules, keys: readonly string[]): DraftRules {
  const next = { ...rules };
  keys.forEach((key) => delete next[key]);
  return next;
}

export type PolicyStep = "name" | "checks" | typeof POLICY_CHECKS[number]["key"] | "evidence" | "approval" | "limits" | "cost" | "settlement" | "scope" | typeof SCOPE_RULES[number] | "review";
export type PolicyStage = "Basics" | "Checks" | "Limits" | "Scope" | "Review";
export const POLICY_STAGES: PolicyStage[] = ["Basics", "Checks", "Limits", "Scope", "Review"];
export function policySteps(profile: GuardrailProfile, limits: boolean, scope: boolean, version = false): PolicyStep[] {
  return [
    ...(version ? [] : ["name" as const]), "checks",
    ...(profile === "custom" ? POLICY_CHECKS.map(({ key }) => key) : []),
    "evidence", "approval", "limits", ...(limits ? ["cost" as const, "settlement" as const] : []),
    "scope", ...(scope ? [...SCOPE_RULES] : []), "review",
  ];
}
export function policyStage(step: PolicyStep): PolicyStage {
  if (step === "name") return "Basics";
  if (step === "review") return "Review";
  if (step === "scope" || SCOPE_RULES.some((key) => key === step)) return "Scope";
  if (["approval", "limits", "cost", "settlement"].includes(step)) return "Limits";
  return "Checks";
}

export function parsePolicyRules(text: string): { rules: DraftRules; error?: never } | { error: string; rules?: never } {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { error: "Enter valid JSON before applying these rules." }; }
  const parsed = PolicyRules.strict().safeParse(value);
  if (!parsed.success) return { error: `Check ${parsed.error.issues[0]?.path.join(" ") || "the rules"}: ${parsed.error.issues[0]?.message ?? "invalid value"}.` };
  return { rules: parsed.data };
}
