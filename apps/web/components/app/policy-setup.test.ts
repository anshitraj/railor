import { describe, expect, it } from "vitest";
import { applyGuardrailProfile, clearRules, guardrailProfile, hasPolicyLimits, hasPolicyScope, parsePolicyRules, policySteps, SCOPE_RULES } from "./policy-setup";

describe("guided policy setup", () => {
  it("keeps an existing custom policy custom without upgrading or weakening its checks", () => {
    const existing = { requireExactRouteEvidence: false, requireLiveQuote: true, denyDuringActiveIncident: false, humanApprovalAboveAmount: 4500 };
    expect(guardrailProfile(existing)).toBe("custom");
    expect(applyGuardrailProfile(existing, "custom")).toEqual(existing);
  });
  it("changes only the requested checks when a preset is chosen", () => {
    const existing = { maximumEvidenceAgeHours: 72, maximumKnownCostBps: 0, providerDenylist: ["circle"], deniedAssets: ["USDT"], minimumObservedReliability: 0.9 };
    const updated = applyGuardrailProfile(existing, "strict");
    expect(updated).toMatchObject(existing);
    expect(guardrailProfile(updated)).toBe("strict");
    expect(guardrailProfile(applyGuardrailProfile(updated, "verified"))).toBe("verified");
  });
  it("keeps the default path short and asks custom questions only when chosen", () => {
    const short = policySteps("verified", false, false);
    expect(short).toEqual(["name", "checks", "evidence", "approval", "limits", "scope", "review"]);
    const custom = policySteps("custom", true, true, true);
    expect(custom).not.toContain("name");
    expect(custom).toContain("requireLiveQuote");
    expect(custom).toContain("cost");
    expect(custom).toContain("providerDenylist");
    expect(custom.at(-1)).toBe("review");
  });
  it("reopens zero-cost limits and saved allowlists on their custom paths", () => {
    expect(hasPolicyLimits({ maximumKnownCostBps: 0 })).toBe(true);
    expect(hasPolicyLimits({})).toBe(false);
    expect(hasPolicyScope({ providerDenylist: ["wise"] })).toBe(true);
    expect(hasPolicyScope({ allowedAssets: [] })).toBe(false);
  });
  it("clears only the choices the user explicitly removes", () => {
    const existing = { providerAllowlist: ["wise"], providerDenylist: ["circle"], deniedAssets: ["USDT"], maximumEvidenceAgeHours: 168 };
    expect(clearRules(existing, SCOPE_RULES)).toEqual({ deniedAssets: ["USDT"], maximumEvidenceAgeHours: 168 });
    expect(existing.providerDenylist).toEqual(["circle"]);
  });
  it("validates advanced JSON against the same rule types as saving", () => {
    for (const input of ['[]', '{"requireLiveQuote":"yes"}', '{"maximumKnownCostBps":-5}', '{"maximumEvidenceAgeHours":1.5}', '{"maximumEtaMinutes":0}', '{"madeUpRule":true}', '{']) {
      expect(parsePolicyRules(input).error).toBeTruthy();
    }
    const valid = parsePolicyRules('{"maximumKnownCostBps":0,"requireLiveQuote":true}');
    expect(valid.error).toBeUndefined();
    expect(valid.rules).toMatchObject({ maximumKnownCostBps: 0, requireLiveQuote: true });
  });
});
