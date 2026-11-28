import { describe, expect, it } from "vitest";
import type { SearchPreviewResult } from "@railor/core";
import { answerAgentQuestion, followupPreference, sortRelevantCandidates, summarizeComparison } from "./agent-presentation";

const candidate = { provider: "Provider C", providerSlug: "provider-c", routeConfirmation: "confirmed", entityEligibility: "confirmed",
  policyPreview: "fail", policyReasons: ["The production policy denies this provider."], policyReasonCodes: ["provider_denied"], comparisonReason: "Blocked before ranking.",
  quoteState: "INDICATIVE", missingInformation: ["Account-specific price is unavailable."] };
const preview = { candidates: [candidate], permittedCandidates: [], rejectedCandidates: [candidate], bestCandidate: null,
  intent: { preference: "most_reliable" }, missingInformation: ["Observed health is missing."], whatWouldChange: ["Connect an account."] } as unknown as SearchPreviewResult;

describe("evidence-only conversational explanations", () => {
  it("identifies backend-managed reference pricing without requiring visitor keys", () => {
    const result = answerAgentQuestion("Why Provider C?", { ...preview, candidates: [{ ...preview.candidates[0]!, quoteAccountContext: "railor_network" }] });
    expect(result?.lines.join(" ")).toContain("No API key is needed");
    expect(result?.lines.join(" ")).toContain("not a guaranteed payout");
  });
  it("explains a denied provider using exact deterministic reason codes", () => {
    const answer = answerAgentQuestion("Why not Provider C?", preview);
    expect(answer?.providerSlug).toBe("provider-c");
    expect(answer?.reasonCodes).toEqual(["provider_denied"]);
    expect(answer?.lines).toContain("The production policy denies this provider.");
    expect(answer?.lines.join(" ")).toContain("not a guaranteed payout");
  });
  it("does not invent a provider when the question names an unknown one", () => {
    expect(answerAgentQuestion("Why not imaginary bank?", preview)).toBeNull();
  });
  it("never converts route evidence into observed reliability", () => {
    const answer = answerAgentQuestion("Which is most reliable?", { ...preview, permittedCandidates: preview.candidates });
    expect(answer?.title).toContain("no supported recommendation");
    expect(answer?.lines.join(" ")).toContain("Strong route evidence alone is not proof of reliability");
  });
  it("keeps missing confidence missing", () => {
    const answer = answerAgentQuestion("Explain the recommendation", { ...preview, bestCandidate: { ...candidate, rankingConfidence: null } as SearchPreviewResult["candidates"][number] });
    expect(answer?.lines).toContain("Ranking input confidence is not available.");
  });
  it("returns reported missing inputs without changing the snapshot", () => {
    expect(answerAgentQuestion("What information is missing?", preview)?.lines).toEqual(["Connect an account.", "Observed health is missing."]);
    expect(preview.bestCandidate).toBeNull();
  });
  it("recognizes ranking commands but not new movement requests", () => {
    expect(followupPreference("Compare by price")).toBe("cheapest");
    expect(followupPreference("Prioritize reliability")).toBe("most_reliable");
    expect(followupPreference("Send 100000 USDC to our supplier; cheapest please")).toBeNull();
  });

  it("summarizes a comparison cleanly and prioritizes priced providers first", () => {
    const priced = { ...candidate, provider: "Wise", providerSlug: "wise", providerId: "p-wise", policyPreview: "pass", recipientAmount: 8420, knownCost: { amount: 1.5, currency: "USD" }, etaMinutes: 30, advertisedSettlement: null, rank: 1 };
    const unpriced = { ...candidate, provider: "Airwallex", providerSlug: "airwallex", providerId: "p-air", policyPreview: "pass", recipientAmount: null, knownCost: null, etaMinutes: null, advertisedSettlement: null, rank: null, quoteState: "CONNECT_TO_QUOTE" };
    const snapshot = {
      ...preview,
      policyId: "explore",
      candidates: [unpriced, priced],
      permittedCandidates: [priced, unpriced],
      bestCandidate: priced,
      intent: { amount: 100, sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", preference: "balanced" },
      evidenceSummary: { providersChecked: 90, withCurrentQuote: 1 },
    } as unknown as SearchPreviewResult;

    const sorted = sortRelevantCandidates(snapshot);
    expect(sorted[0]?.provider).toBe("Wise");

    const summary = summarizeComparison(snapshot);
    expect(summary.title).toContain("Wise");
    expect(summary.title).toContain("100 USD → INR");
    expect(summary.lines[0]).toContain("8,420 INR");
    expect(summary.links?.[0]?.href).toContain("/app/prices?from=USD&to=INR&amount=100");
  });
});
