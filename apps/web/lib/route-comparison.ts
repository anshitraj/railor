import "server-only";

import { evaluateProvider, loadProviderBySlug, loadProviderInputs, loadReferenceData, PRODUCT_TERMS, type Evaluation } from "@railor/core";
import { evidence, getDb } from "@railor/database";
import type { CorridorQuery } from "@railor/types";
import { inArray } from "drizzle-orm";
import type { ComparisonCandidate, ComparisonSource, RouteComparison, RouteComparisonRequest } from "./route-comparison-model";

const UNKNOWN = "Needs confirmation";
type Profile = NonNullable<Awaited<ReturnType<typeof loadProviderBySlug>>>;

export function comparisonLink(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export async function buildRouteComparison(request: RouteComparisonRequest): Promise<RouteComparison | null> {
  const [inputs, reference, profiles] = await Promise.all([
    loadProviderInputs(),
    loadReferenceData(),
    Promise.all(request.providers.map(loadProviderBySlug)),
  ]);
  const from = reference.countries.find(country => country.code === request.from);
  const to = reference.countries.find(country => country.code === request.to);
  if (!from || !to || profiles.some(profile => !profile || profile.provider.isDemo)) return null;

  const now = new Date();
  const query: CorridorQuery = {
    sourceCountry: request.from,
    destinationCountry: request.to,
    entityCountry: request.customerType === "business" ? request.from : undefined,
    customerType: request.customerType,
    product: request.product,
  };
  const reviewed = profiles.flatMap(profile => {
    if (!profile) return [];
    const input = inputs.find(provider => provider.slug === profile.provider.slug && !provider.isDemo);
    if (!input) return [];
    const evaluation = evaluateProvider(input, query, { now });
    const product = request.product ?? evaluation.matchedProduct;
    const destinationCurrency = input.facets.find(facet => facet.id === evaluation.dependedOnRouteId)?.destinationCurrency;
    const requirements = profile.requirements.filter(row => row.mandatory
      && (!row.customerType || row.customerType === request.customerType)
      && (!row.entityCountry || row.entityCountry === request.from));
    const fees = product && evaluation.verdict !== "unavailable" ? profile.fees.filter(row =>
      row.product === product && (!row.destinationCurrency || row.destinationCurrency === destinationCurrency)) : [];
    const limits = product && evaluation.verdict !== "unavailable" ? profile.limits.filter(row =>
      row.product === product && (!row.customerType || row.customerType === request.customerType)
      && (!row.currency || row.currency === destinationCurrency)) : [];
    return [{ profile, evaluation, product, requirements, fees, limits }];
  });
  if (reviewed.length !== 2) return null;

  const evidenceIds = [...new Set(reviewed.flatMap(item =>
    [...item.requirements, ...item.fees, ...item.limits].flatMap(row => row.evidenceId ? [row.evidenceId] : [])))];
  const citations = evidenceIds.length
    ? await (await getDb()).select({
      id: evidence.id, url: evidence.sourceUrl, title: evidence.sourceTitle, verifiedAt: evidence.lastVerifiedAt,
    }).from(evidence).where(inArray(evidence.id, evidenceIds))
    : [];
  const byId = new Map(citations.map(row => [row.id, row]));

  const candidates = reviewed.map(({ profile, evaluation, product, requirements, fees, limits }): ComparisonCandidate => {
    const { provider } = profile;
    const sources = new Map<string, ComparisonSource>();
    function addSource(value: string | null, title: string | null, date: Date | null) {
      const url = comparisonLink(value);
      if (url && !sources.has(url)) sources.set(url, { url, title: title || new URL(url).hostname, verifiedAt: date?.toISOString() ?? null });
    }
    for (const row of evaluation.evidence) addSource(row.sourceUrl, row.sourceTitle, row.lastVerifiedAt);
    for (const row of [...requirements, ...fees, ...limits]) {
      const source = row.evidenceId ? byId.get(row.evidenceId) : undefined;
      if (source) addSource(source.url, source.title, source.verifiedAt);
    }
    for (const row of profile.sources.filter(source =>
      source.sourceType === "official_docs" || source.sourceType === "pricing" || source.sourceType === "terms").slice(0, 3)) {
      addSource(row.url, row.title, row.lastCheckedAt);
    }
    addSource(provider.docsUrl, "Provider documentation", null);

    const verificationRequirements = [...new Set(requirements.filter(row => row.kind === "kyc" || row.kind === "kyb").map(row => row.label))];
    const otherRequirements = [...new Set(requirements.filter(row => row.kind !== "kyc" && row.kind !== "kyb").map(row => row.label))];
    const onboarding = provider.onboardingDays === null ? null : `About ${provider.onboardingDays} ${provider.onboardingDays === 1 ? "day" : "days"}`;
    const routeTiming = evaluation.receivingMode?.settlementEstimate;
    const timing = routeTiming ?? provider.advertisedSettlement;
    const productLabel = PRODUCT_TERMS.find(term => term.product === product)?.label;
    const feeSummary = [...new Set(fees.map(row => row.summary))].join(" • ");
    const limitSummary = [...new Set(limits.map(row => row.summary))].join(" • ");
    const reason = primaryReason(evaluation);
    const advantages = [
      evaluation.verdict === "supported" && "The eligibility rules support this country pair.",
      routeTiming && `Published settlement for the receiving method: ${routeTiming}.`,
      feeSummary && "Publishes pricing information for this product.",
      provider.hasApi && "The provider documents an API.",
    ].filter((value): value is string => Boolean(value));
    const considerations = [
      evaluation.reasons.flatMap(row => row.wouldChange)[0],
      !feeSummary && "Confirm fees and FX with the provider for this setup.",
      !onboarding && "Confirm how long onboarding takes.",
      !timing && "Confirm how long the transfer takes.",
    ].filter((value): value is string => Boolean(value));
    return {
      slug: provider.slug, name: provider.name, category: provider.category, website: comparisonLink(provider.websiteUrl),
      verdict: evaluation.verdict, reason, advantages, considerations, sources: [...sources.values()],
      facts: [
        { label: "Product reviewed", value: productLabel ?? UNKNOWN },
        { label: "KYC / KYB requirements", value: verificationRequirements.join(" · ") || UNKNOWN, detail: verificationRequirements.length ? "Published documents and eligibility conditions" : undefined },
        { label: "Onboarding time", value: onboarding ?? UNKNOWN, detail: onboarding ? "Provider-wide estimate" : undefined },
        { label: "Payout timing", value: timing ?? UNKNOWN, detail: routeTiming ? "Published for the receiving method" : timing ? "Provider-wide estimate" : undefined },
        { label: "Receiving method", value: evaluation.receivingMode?.namedRail ?? evaluation.receivingMode?.endpointType?.replaceAll("_", " ") ?? UNKNOWN },
        { label: "Published fees", value: feeSummary || UNKNOWN, detail: feeSummary ? productLabel : undefined },
        { label: "Published limits", value: limitSummary || UNKNOWN, detail: limitSummary ? productLabel : undefined },
        { label: "Other requirements", value: otherRequirements.join(", ") || UNKNOWN },
      ],
    };
  });
  return {
    request, origin: from.name, destination: to.name, candidates, checkedAt: now.toISOString(),
    productLabel: PRODUCT_TERMS.find(term => term.product === request.product)?.label ?? null,
  };
}

function primaryReason(evaluation: Evaluation) {
  return evaluation.reasons[0]?.message ?? "Confirm availability for this country pair.";
}
