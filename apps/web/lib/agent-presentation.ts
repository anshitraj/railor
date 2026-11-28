import type { SearchPreviewCandidate, SearchPreviewResult } from "@railor/core";
import { RANKING_PRESET_LABEL, type RankingPreset } from "@railor/types";

export interface AgentAnswer { title: string; lines: string[]; reasonCodes: string[]; providerSlug?: string; /** Tappable follow-ups: an example request or a slash command. */ chips?: string[]; links?: Array<{ label: string; href: string }> }

const fmtNum = (value: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 4 }).format(value);

/** Prioritize the best pick, then priced candidates, then confirmed routes. */
export function sortRelevantCandidates(preview: SearchPreviewResult): SearchPreviewCandidate[] {
  const bestId = preview.bestCandidate?.providerId;
  return preview.candidates
    .filter((c) => c.routeConfirmation === "confirmed" || c.routeConfirmation === "partially_confirmed")
    .sort((a, b) => {
      if (a.providerId === bestId) return -1;
      if (b.providerId === bestId) return 1;
      const aPriced = a.recipientAmount !== null ? 0 : 1;
      const bPriced = b.recipientAmount !== null ? 0 : 1;
      if (aPriced !== bPriced) return aPriced - bPriced;
      const aRank = a.rank ?? Infinity;
      const bRank = b.rank ?? Infinity;
      if (aRank !== bRank) return aRank - bRank;
      const aConf = a.routeConfirmation === "confirmed" ? 0 : 1;
      const bConf = b.routeConfirmation === "confirmed" ? 0 : 1;
      if (aConf !== bConf) return aConf - bConf;
      const aPass = a.policyPreview === "pass" ? 0 : a.policyPreview === "unknown" ? 1 : 2;
      const bPass = b.policyPreview === "pass" ? 0 : b.policyPreview === "unknown" ? 1 : 2;
      if (aPass !== bPass) return aPass - bPass;
      return a.provider.localeCompare(b.provider);
    });
}

/** Build a direct in-app link to the live Prices calculator when the route fits it. */
export function pricesLinkForIntent(intent: SearchPreviewResult["intent"]): { label: string; href: string } | null {
  const srcAsset = intent.sourceAsset?.toUpperCase();
  const dst = intent.destinationCurrency?.toUpperCase();
  if ((srcAsset === "USDT" || srcAsset === "USDC") && dst === "INR") {
    const query = new URLSearchParams({
      mode: "stablecoin",
      asset: srcAsset,
      ...(intent.sourceNetwork ? { network: intent.sourceNetwork } : {}),
      dest: "INR",
      ...(intent.amount ? { amount: String(intent.amount) } : {}),
    });
    return { label: "See live Indian exchange prices", href: `/app/prices?${query}` };
  }
  const srcFiat = intent.sourceCurrency?.toUpperCase();
  if (srcFiat && dst && /^[A-Z]{3}$/.test(srcFiat) && /^[A-Z]{3}$/.test(dst) && srcFiat !== dst) {
    const query = new URLSearchParams({
      from: srcFiat,
      to: dst,
      ...(intent.amount ? { amount: String(intent.amount) } : {}),
      ...(intent.destinationCountry ? { destinationCountry: intent.destinationCountry } : {}),
      market: "1",
    });
    return { label: `Compare all live ${srcFiat} → ${dst} prices`, href: `/app/prices?${query}` };
  }
  return null;
}

/** Concise, ChatGPT-style conversational summary grounded strictly in the returned snapshot. */
export function summarizeComparison(preview: SearchPreviewResult): AgentAnswer {
  const relevant = sortRelevantCandidates(preview);
  const priced = relevant.filter((c) => c.recipientAmount !== null);
  const best = preview.bestCandidate;
  const intent = preview.intent;
  const fromUnit = intent.sourceAsset ?? intent.sourceCurrency ?? "";
  const toUnit = intent.destinationCurrency ?? "";
  const routeText = `${intent.amount ? `${fmtNum(intent.amount)} ` : ""}${fromUnit}${toUnit ? ` → ${toUnit}` : ""}`.trim();
  const preset = RANKING_PRESET_LABEL[intent.preference].toLowerCase();
  const ruled = preview.policyId !== "explore";
  const priceLink = pricesLinkForIntent(intent);

  if (best) {
    const quoteKind = best.quoteState === "LIVE_CONNECTED" ? "a live account quote" : "an indicative reference rate";
    const facts: string[] = [];
    if (best.recipientAmount !== null && toUnit) facts.push(`${fmtNum(best.recipientAmount)} ${toUnit}`);
    if (best.knownCost) facts.push(`fee ${fmtNum(best.knownCost.amount)} ${best.knownCost.currency ?? ""}`.trim());
    if (best.etaMinutes !== null) facts.push(`est. ~${fmtNum(best.etaMinutes)} min`);
    else if (best.advertisedSettlement) facts.push(best.advertisedSettlement);

    const lead = facts.length
      ? `${best.provider} leads for ${preset} with ${quoteKind} of ${facts.join(" · ")}${ruled ? ", and passed your company rules" : ""}.`
      : `${best.provider} ranks first for ${preset}${ruled ? " and passed your company rules" : ""}.`;
    const restCount = relevant.length - 1;
    const otherPriced = priced.filter((c) => c.providerId !== best.providerId).length;
    const detail = restCount <= 0
      ? `Checked ${preview.evidenceSummary.providersChecked} providers.`
      : otherPriced > 0
        ? `${otherPriced} other ${otherPriced === 1 ? "provider also returned a price" : "providers also returned prices"}, and ${restCount - otherPriced} more show route coverage.`
        : `${restCount} other ${restCount === 1 ? "provider has" : "providers have"} route coverage here, awaiting a connected account for live pricing.`;

    return {
      title: `${best.provider} is the top pick for ${routeText || "this route"}`,
      lines: [lead, detail],
      reasonCodes: [],
      providerSlug: best.providerSlug,
      ...(priceLink ? { links: [priceLink] } : {}),
    };
  }

  if (relevant.length) {
    const names = relevant.slice(0, 3).map((c) => c.provider);
    const listText = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]}, and ${names[2]}`;
    const why = intent.preference === "most_reliable"
      ? `No single provider can be ranked #1 for reliability yet — observed uptime data isn’t available for these routes.`
      : intent.preference === "cheapest" || intent.preference === "max_recipient_amount"
        ? `No single provider can be ranked #1 for ${preset} yet — comparable live quotes require connecting a provider account.`
        : `No single provider can be ranked #1 yet because comparable live quotes aren’t available for this corridor.`;
    const coverage = `${relevant.length} of ${preview.evidenceSummary.providersChecked} providers show route evidence${ruled ? ` (${preview.permittedCandidates.length} permitted by policy)` : ""}, including ${listText}.`;

    return {
      title: `${relevant.length} providers cover ${routeText || "this route"}, but none can rank #1 yet`,
      lines: [why, coverage],
      reasonCodes: [],
      ...(priceLink ? { links: [priceLink] } : {}),
    };
  }

  return {
    title: `No verified route found yet for ${routeText || "this transfer"}`,
    lines: [
      `I checked ${preview.evidenceSummary.providersChecked} providers, and current evidence doesn’t confirm an end-to-end path for this corridor yet.`,
      `Try editing the network, payout rail, or currency — or check our live price calculator if this is a standard bank transfer.`,
    ],
    reasonCodes: [],
    ...(priceLink ? { links: [priceLink] } : {}),
  };
}

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
        : [preview.policyId === "explore"
            ? `${preview.permittedCandidates.length} ${preview.permittedCandidates.length === 1 ? "option has" : "options have"} a plausible route, but current data does not support the requested comparison.`
            : preview.permittedCandidates.length ? `${preview.permittedCandidates.length} ${preview.permittedCandidates.length === 1 ? "option" : "options"} passed your company rules, but current data does not support the requested comparison.` : "No option has both a plausible route and a fully passing check against your company rules.",
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
