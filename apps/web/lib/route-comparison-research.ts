import "server-only";

import { priceWebChecks, readWebChecks, registrableDomain, type WebCheckClaim } from "@railor/core";
import { comparisonLink } from "./route-comparison";
import { NEEDS_CONFIRMATION, type ComparisonSource, type RouteComparison } from "./route-comparison-model";

const fields = [
  ["Published fees", "the published transfer and FX charges for this same origin and destination"],
  ["KYC / KYB requirements", "the documents required for this sender’s account verification in the origin country"],
  ["Payout timing", "the published payout time and transfer method in the destination country"],
  ["Published limits", "the payout or transfer limits for this same origin and destination"],
  ["Onboarding time", "the published onboarding or identity verification processing time for the sender’s account in the origin country"],
  ["Receiving method", "the payout method or local bank rail in the destination country"],
  ["Other requirements", "the beneficiary details or documents required for payouts in the destination country"],
  ["Tax on transfer", "any tax the provider explicitly applies to the selected transfer and payout method"],
] as const;

function checksFor(comparison: RouteComparison) {
  const { request, origin, destination } = comparison;
  const customer = request.customerType === "individual" ? "personal sender" : "business sender";
  return comparison.candidates.flatMap(candidate => {
    if (!candidate.website || candidate.verdict === "unavailable") return [];
    const product = (request.product ?? candidate.product ?? "payout").replaceAll("_", " ");
    const key = ["route-compare-v2", candidate.slug, request.from, request.to, request.customerType, product].join(":");
    const domain = registrableDomain(candidate.website);
    const common = { providerSlug: candidate.slug, providerName: candidate.name, domain };
    const lookups = fields.filter(([label]) => candidate.facts.some(fact => fact.label === label && fact.value === NEEDS_CONFIRMATION))
      .map(([label, question]) => ({
        label,
        claim: { ...common, key: `${key}:field:${label}`, kind: "profile", lookup: true,
          statement: `Find ${question} for ${candidate.name} ${product}: ${customer} in ${origin} paying a recipient in ${destination}.` } satisfies WebCheckClaim,
      }));
    if (candidate.verdict === "supported") return lookups;
    const coverage = { ...common, key, kind: "corridor",
      statement: `${candidate.name} offers ${product} for a ${customer} funding from ${origin} and paying a recipient in ${destination}.` } satisfies WebCheckClaim;
    return [{ label: "Coverage", claim: coverage }, ...lookups];
  });
}

export async function addRouteComparisonResearch(comparison: RouteComparison, mode: "start" | "poll" | "read"): Promise<RouteComparison> {
  const checks = checksFor(comparison);
  if (!checks.length) return comparison;
  const keys = checks.map(({ claim }) => claim.key);
  const started = mode === "start" ? await priceWebChecks(checks.map(({ claim }) => claim)) : null;
  const results = started?.results ?? await readWebChecks(keys);
  const found = new Map(results.map(row => [row.key, row]));
  const candidates = comparison.candidates.map(candidate => {
    const sources = new Map(candidate.sources.map(source => [source.url, source]));
    const facts = new Map(candidate.facts.map(fact => [fact.label, fact]));
    let webCheck = candidate.webCheck;
    for (const { claim, label } of checks) {
      if (claim.providerSlug !== candidate.slug) continue;
      const result = found.get(claim.key);
      if (!result?.official || !result.quote || result.verdict === "unclear") continue;
      const url = comparisonLink(result.sourceUrl);
      if (!url) continue;
      const source: ComparisonSource = { url, title: result.sourceTitle || new URL(url).hostname, verifiedAt: result.checkedAt };
      sources.set(url, source);
      if (label === "Coverage") {
        webCheck = { verdict: result.verdict, quote: result.quote, source };
      } else if (result.verdict === "supported" && facts.get(label)?.value === NEEDS_CONFIRMATION) {
        facts.set(label, { label, value: result.quote, detail: "Published source excerpt · confirm applicability", source });
      }
    }
    return { ...candidate, sources: [...sources.values()], facts: [...facts.values()], webCheck };
  });
  const pendingWebChecks = started ? started.pending.size > 0 : mode === "poll" && keys.some(key => !found.has(key));
  return { ...comparison, candidates, pendingWebChecks };
}
