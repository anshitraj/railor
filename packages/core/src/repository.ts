/**
 * Read models over the capability graph.
 *
 * Everything the product answers with comes through here, so provenance is
 * attached at the point of loading rather than bolted on in the UI layer.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  changeEvents,
  evidence as evidenceTable,
  fees as feesTable,
  getDb,
  healthChecks,
  limits as limitsTable,
  providerCapabilities,
  providerProducts,
  providerRequirements,
  providers,
  requirements as requirementsTable,
  sourceDocuments,
} from "@railor/database";
import type { SourceType } from "@railor/types";
import type { CapabilityFacet, ProviderInput } from "./eligibility.js";

export interface ProviderSummary {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  isDemo: boolean;
  headquartersCountry: string | null;
  licensingSummary: string | null;
  hasApi: boolean;
  hasSandbox: boolean;
  hasWebhooks: boolean;
  sdkLanguages: string[];
  advertisedSettlement: string | null;
  onboardingDays: number | null;
  lastVerifiedAt: Date | null;
  products: string[];
  countryCount: number;
  currencyCount: number;
  assets: string[];
  networks: string[];
  customerTypes: string[];
}

const num = (v: string | number | null | undefined): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Loads every provider with the facets, costs and health the engine needs. */
export async function loadProviderInputs(): Promise<ProviderInput[]> {
  const db = await getDb();

  const [providerRows, productRows, facetRows, reqRows, feeRows, limitRows, healthRows] =
    await Promise.all([
      db.select().from(providers),
      db.select().from(providerProducts),
      db
        .select({
          id: providerCapabilities.id,
          providerId: providerCapabilities.providerId,
          product: providerCapabilities.product,
          entityCountry: providerCapabilities.entityCountry,
          customerCountry: providerCapabilities.customerCountry,
          customerType: providerCapabilities.customerType,
          sourceAsset: providerCapabilities.sourceAsset,
          sourceNetwork: providerCapabilities.sourceNetwork,
          destinationCountry: providerCapabilities.destinationCountry,
          destinationCurrency: providerCapabilities.destinationCurrency,
          paymentMethod: providerCapabilities.paymentMethod,
          availability: providerCapabilities.availability,
          note: providerCapabilities.note,
          lastVerifiedAt: providerCapabilities.lastVerifiedAt,
          evidenceId: evidenceTable.id,
          evidenceUrl: evidenceTable.sourceUrl,
          evidenceTitle: evidenceTable.sourceTitle,
          evidenceType: evidenceTable.sourceType,
          evidenceConfidence: evidenceTable.confidence,
          evidenceRetrievedAt: evidenceTable.retrievedAt,
          evidenceRawHash: evidenceTable.rawHash,
          evidenceExcerpt: evidenceTable.rawExcerpt,
        })
        .from(providerCapabilities)
        .leftJoin(evidenceTable, eq(providerCapabilities.evidenceId, evidenceTable.id)),
      db
        .select({
          providerId: providerRequirements.providerId,
          entityCountry: providerRequirements.entityCountry,
          mandatory: providerRequirements.mandatory,
          key: requirementsTable.key,
          label: requirementsTable.label,
        })
        .from(providerRequirements)
        .innerJoin(
          requirementsTable,
          eq(providerRequirements.requirementId, requirementsTable.id),
        ),
      db.select().from(feesTable),
      db.select().from(limitsTable),
      db
        .select({
          providerId: healthChecks.providerId,
          ok: healthChecks.ok,
        })
        .from(healthChecks),
    ]);

  const facetsByProvider = new Map<string, CapabilityFacet[]>();
  for (const f of facetRows) {
    const list = facetsByProvider.get(f.providerId) ?? [];
    list.push({
      id: f.id,
      product: f.product,
      entityCountry: f.entityCountry,
      customerCountry: f.customerCountry,
      customerType: f.customerType,
      sourceAsset: f.sourceAsset,
      sourceNetwork: f.sourceNetwork,
      destinationCountry: f.destinationCountry,
      destinationCurrency: f.destinationCurrency,
      paymentMethod: f.paymentMethod,
      availability: f.availability,
      note: f.note,
      lastVerifiedAt: f.lastVerifiedAt,
      evidenceConfidence: num(f.evidenceConfidence) ?? null,
      evidenceSourceType: (f.evidenceType as SourceType | null) ?? null,
      evidenceId: f.evidenceId,
      evidenceUrl: f.evidenceUrl,
      evidenceTitle: f.evidenceTitle,
      evidenceRetrievedAt: f.evidenceRetrievedAt,
      evidenceRawHash: f.evidenceRawHash,
      evidenceExcerpt: f.evidenceExcerpt,
    });
    facetsByProvider.set(f.providerId, list);
  }

  const health = new Map<string, { ok: number; total: number }>();
  for (const h of healthRows) {
    const agg = health.get(h.providerId) ?? { ok: 0, total: 0 };
    agg.total += 1;
    if (h.ok) agg.ok += 1;
    health.set(h.providerId, agg);
  }

  return providerRows.map((p) => {
    const facets = facetsByProvider.get(p.id) ?? [];
    const reqs = reqRows.filter((r) => r.providerId === p.id);
    const providerFees = feeRows.filter((f) => f.providerId === p.id);
    const providerLimits = limitRows.filter((l) => l.providerId === p.id);
    const agg = health.get(p.id);

    const costs = providerFees
      .map((f) => (f.percentBps ?? 0) + (f.fxSpreadBps ?? 0))
      .filter((n) => n > 0);

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      products: productRows.filter((x) => x.providerId === p.id).map((x) => x.product),
      facets,
      advertisedSettlement: p.advertisedSettlement,
      onboardingDays: p.onboardingDays,
      hasApi: p.hasApi,
      hasSandbox: p.hasSandbox,
      lastVerifiedAt: p.lastVerifiedAt,
      feeSummary: providerFees[0]?.summary,
      feeCostBps: costs.length ? Math.min(...costs) : undefined,
      limitSummary: providerLimits[0]?.summary,
      limitMin: num(providerLimits[0]?.minAmount),
      limitMax: num(providerLimits[0]?.maxAmount),
      requirementKeys: reqs.filter((r) => r.mandatory).map((r) => r.key),
      requirementLabels: Object.fromEntries(reqs.map((r) => [r.key, r.label])),
      healthOkRatio: agg && agg.total ? agg.ok / agg.total : 1,
      destinationCountryCount: new Set(
        facets.filter((f) => f.destinationCountry).map((f) => f.destinationCountry),
      ).size,
    } satisfies ProviderInput;
  });
}

/** Directory rows: enough to filter and compare without loading the graph. */
export async function loadProviderSummaries(): Promise<ProviderSummary[]> {
  const inputs = await loadProviderInputs();
  const db = await getDb();
  const rows = await db.select().from(providers);

  return rows.map((p) => {
    const input = inputs.find((i) => i.id === p.id);
    const facets = input?.facets ?? [];
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      description: p.description,
      isDemo: p.isDemo,
      headquartersCountry: p.headquartersCountry,
      licensingSummary: p.licensingSummary,
      hasApi: p.hasApi,
      hasSandbox: p.hasSandbox,
      hasWebhooks: p.hasWebhooks,
      sdkLanguages: p.sdkLanguages ?? [],
      advertisedSettlement: p.advertisedSettlement,
      onboardingDays: p.onboardingDays,
      lastVerifiedAt: p.lastVerifiedAt,
      products: input?.products ?? [],
      countryCount: new Set(
        facets
          .flatMap((f) => [f.destinationCountry, f.entityCountry])
          .filter((c): c is string => Boolean(c)),
      ).size,
      currencyCount: new Set(
        facets.map((f) => f.destinationCurrency).filter((c): c is string => Boolean(c)),
      ).size,
      assets: [...new Set(facets.map((f) => f.sourceAsset).filter((a): a is string => Boolean(a)))],
      networks: [
        ...new Set(facets.map((f) => f.sourceNetwork).filter((n): n is string => Boolean(n))),
      ],
      customerTypes: [
        ...new Set(facets.map((f) => f.customerType).filter((c): c is string => Boolean(c))),
      ],
    };
  });
}

export async function loadProviderBySlug(slug: string) {
  const db = await getDb();
  const [provider] = await db.select().from(providers).where(eq(providers.slug, slug)).limit(1);
  if (!provider) return null;

  const [products, facets, reqs, fees, limits, changes, sources, health] = await Promise.all([
    db.select().from(providerProducts).where(eq(providerProducts.providerId, provider.id)),
    db
      .select({
        capability: providerCapabilities,
        evidence: evidenceTable,
      })
      .from(providerCapabilities)
      .leftJoin(evidenceTable, eq(providerCapabilities.evidenceId, evidenceTable.id))
      .where(eq(providerCapabilities.providerId, provider.id)),
    db
      .select({
        key: requirementsTable.key,
        label: requirementsTable.label,
        kind: requirementsTable.kind,
        description: requirementsTable.description,
        mandatory: providerRequirements.mandatory,
        note: providerRequirements.note,
        entityCountry: providerRequirements.entityCountry,
        lastVerifiedAt: providerRequirements.lastVerifiedAt,
      })
      .from(providerRequirements)
      .innerJoin(requirementsTable, eq(providerRequirements.requirementId, requirementsTable.id))
      .where(eq(providerRequirements.providerId, provider.id)),
    db.select().from(feesTable).where(eq(feesTable.providerId, provider.id)),
    db.select().from(limitsTable).where(eq(limitsTable.providerId, provider.id)),
    db
      .select()
      .from(changeEvents)
      .where(eq(changeEvents.providerId, provider.id))
      .orderBy(desc(changeEvents.detectedAt)),
    db.select().from(sourceDocuments).where(eq(sourceDocuments.providerId, provider.id)),
    db
      .select()
      .from(healthChecks)
      .where(eq(healthChecks.providerId, provider.id))
      .orderBy(desc(healthChecks.checkedAt))
      .limit(12),
  ]);

  return { provider, products, facets, requirements: reqs, fees, limits, changes, sources, health };
}

export interface ChangeFeedFilter {
  providerSlugs?: string[];
  countries?: string[];
  limit?: number;
  /** Only changes detected at or after this instant. */
  since?: Date;
}

/** "7d" / "24h" / "30m" → a cutoff Date. Falls back to parsing as an ISO date. */
export function parseSince(raw: string, now: Date = new Date()): Date | null {
  const relative = raw.trim().match(/^(\d+)\s*(m|h|d|w)$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unitMs = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[
      relative[2]!.toLowerCase() as "m" | "h" | "d" | "w"
    ];
    return new Date(now.getTime() - amount * unitMs);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function loadChangeFeed(filter: ChangeFeedFilter = {}) {
  const db = await getDb();
  const rows = await db
    .select({
      change: changeEvents,
      providerName: providers.name,
      providerSlug: providers.slug,
    })
    .from(changeEvents)
    .innerJoin(providers, eq(changeEvents.providerId, providers.id))
    .where(
      filter.providerSlugs?.length
        ? inArray(providers.slug, filter.providerSlugs)
        : sql`true`,
    )
    .orderBy(desc(changeEvents.detectedAt))
    .limit(filter.limit ?? 25);

  const sinceFiltered = filter.since
    ? rows.filter((r) => r.change.detectedAt >= filter.since!)
    : rows;

  if (!filter.countries?.length) return sinceFiltered;
  const wanted = new Set(filter.countries);
  return sinceFiltered.filter((r) => {
    const affects = r.change.affects ?? {};
    const values = Object.values(affects);
    return values.length === 0 || values.some((v) => wanted.has(v));
  });
}

export async function loadReferenceData() {
  const db = await getDb();
  const { countries, currencies, assets, blockchains } = await import("@railor/database");
  const [countryRows, currencyRows, assetRows, chainRows] = await Promise.all([
    db.select().from(countries).orderBy(desc(countries.popularity)),
    db.select().from(currencies).orderBy(desc(currencies.popularity)),
    db.select().from(assets).orderBy(desc(assets.popularity)),
    db.select().from(blockchains).orderBy(desc(blockchains.popularity)),
  ]);
  return { countries: countryRows, currencies: currencyRows, assets: assetRows, chains: chainRows };
}

export async function loadPlatformCounts() {
  const db = await getDb();
  const [[p], [c], [s], [ch]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(providers),
    db.select({ n: sql<number>`count(*)::int` }).from(providerCapabilities),
    db.select({ n: sql<number>`count(*)::int` }).from(sourceDocuments),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(changeEvents)
      .where(sql`${changeEvents.detectedAt} > now() - interval '30 days'`),
  ]);
  const { countries } = await import("@railor/database");
  const [[countryCount]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(countries),
  ]);
  return {
    providers: p?.n ?? 0,
    capabilities: c?.n ?? 0,
    sources: s?.n ?? 0,
    changes30d: ch?.n ?? 0,
    countries: countryCount?.n ?? 0,
  };
}

export { and, eq };
