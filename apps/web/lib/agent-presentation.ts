import type { SearchPreviewResult } from "@railor/core";
import type { RankingPreset } from "@railor/types";

export interface AgentAnswer { title: string; lines: string[]; reasonCodes: string[]; providerSlug?: string }

/** Presentation of a returned engine result. Every financial statement below
 * comes from this snapshot; questions never alter its policy or authorization. */
export function answerAgentQuestion(question: string, preview: SearchPreviewResult): AgentAnswer | null {
  const text = question.toLowerCase().trim();
  if (!/\b(?:why|explain|what|which|how|is|does|can)\b/.test(text)) return null;
  const matching = preview.candidates.filter((candidate) => {
    const aliases = [candidate.provider.toLowerCase(), candidate.providerSlug];
    return aliases.some((alias) => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    });
  });
  if (matching.length) {
    const candidate = matching[0]!;
    return { title: `${candidate.provider}: the evidence behind the result`, providerSlug: candidate.providerSlug,
      lines: [
        `Route: ${candidate.routeConfirmation?.replaceAll("_", " ") ?? "unknown"}. Entity eligibility: ${candidate.entityEligibility?.replaceAll("_", " ") ?? "unknown"}.`,
        candidate.policyPreview === "pass" ? "It passed the active company policy." : candidate.policyPreview === "fail" ? "It was blocked by the active company policy." : "Policy could not be fully evaluated from current evidence.",
        ...candidate.policyReasons,
        ...(candidate.comparisonReason ? [candidate.comparisonReason] : []),
        candidate.quoteState === "LIVE_CONNECTED" ? "Pricing came from a current quote on your connected provider account."
          : candidate.quoteState === "INDICATIVE" ? candidate.quoteAccountContext === "railor_network"
            ? "Railor obtained this reference FX price using its backend integration. No API key is needed to view it; it is not a guaranteed payout or your account's pricing."
            : "Its pricing is indicative. An optional account connection can supply customer pricing; this observation is not a guaranteed payout."
          : candidate.quoteState === "CONNECT_TO_QUOTE" ? "The route has evidence, but account pricing needs a provider connection."
          : candidate.quoteState === "ROUTE_UNAVAILABLE" ? "Indexed evidence marks this route as unsupported."
          : candidate.quoteState === "QUOTE_UNAVAILABLE" ? "Railor does not currently have live pricing for this option."
          : "Route evidence is incomplete, so availability is unknown.",
        ...candidate.missingInformation,
      ].filter((line, index, all) => all.indexOf(line) === index),
      reasonCodes: candidate.policyReasonCodes.filter((code): code is NonNullable<typeof code> => Boolean(code)),
    };
  }
  if (/\b(?:best|recommend(?:ation|ed)?|winner|rank(?:ing|ed)?|reliable|cheapest)\b/.test(text)) {
    const best = preview.bestCandidate;
    return { title: best ? `Why ${best.provider} ranks first` : "Why there is no supported recommendation yet", reasonCodes: [],
      lines: best ? [best.comparisonReason ?? "It passed policy and ranked first using the available comparison inputs.",
        `Route: ${best.routeConfirmation ?? "unknown"}. Quote type: ${best.quoteType}.`,
        best.rankingConfidence === null ? "Ranking input confidence is not available." : `Ranking input confidence: ${Math.round(best.rankingConfidence * 100)}%.`,
        "Recording a decision evaluates current evidence and policy again."]
        : [preview.permittedCandidates.length ? `${preview.permittedCandidates.length} options passed policy, but current data does not support the requested comparison.` : "No option has both a plausible route and a fully passing policy evaluation.",
          preview.intent.preference === "most_reliable" ? "Reliability ranking needs observed provider health data. Strong route evidence alone is not proof of reliability."
            : preview.intent.preference === "cheapest" ? "Cheapest ranking needs complete, comparable costs from connected live quotes. Indicative and partial fees cannot win that ranking."
            : preview.intent.preference === "max_recipient_amount" ? "Maximum recipient amount needs comparable connected live payout quotes."
            : "Review the route evidence and missing information shown with each provider."],
    };
  }
  if (/\b(?:missing|unknown|need|connect|quote|pricing|price)\b/.test(text)) return {
    title: "What would improve this comparison", reasonCodes: [],
    lines: [...new Set([...preview.whatWouldChange, ...preview.missingInformation])].slice(0, 8).length
      ? [...new Set([...preview.whatWouldChange, ...preview.missingInformation])].slice(0, 8)
      : ["The current result has no reported information gaps. Quotes still expire, and a recorded decision rechecks the evidence."],
  };
  if (/\bpolicy\b/.test(text)) return { title: "How your policy affected this search", reasonCodes: [],
    lines: [`${preview.permittedCandidates.length} options passed policy; ${preview.rejectedCandidates.length} were blocked or had unsupported routes.`,
      "Candidates are evaluated against the active policy before they are ranked. A blocked provider cannot win on price."] };
  return null;
}

/** Small conversational shortcuts; the server still performs all ranking. */
export function followupPreference(question: string): RankingPreset | null {
  if (question.length > 120 || /\b(?:send|sending|move|pay|transfer|company|supplier)\b/i.test(question)) return null;
  if (/\b(?:prioriti[sz]e reliability|most reliable|compare (?:by|on) reliability|reliability matters)\b/i.test(question)) return "most_reliable";
  if (/\b(?:prioriti[sz]e speed|fastest|compare (?:by|on) speed)\b/i.test(question)) return "fastest";
  if (/\b(?:cheapest|compare by price|lowest cost|prioriti[sz]e price)\b/i.test(question)) return "cheapest";
  if (/\b(?:max(?:imum)? recipient amount|maximi[sz]e payout)\b/i.test(question)) return "max_recipient_amount";
  if (/\b(?:balanced|best overall)\b/i.test(question)) return "balanced";
  return null;
}
