/**
 * Provider research orchestrator: scrape → extract → validate → review candidate.
 *
 *   Firecrawl (real page content, gets through where plain fetch is 403'd)
 *     → Gemini structured extraction (only from that content, never memory)
 *     → citation check (a cited URL not actually supplied kills the row)
 *     → human review candidate (never a production write from this module)
 *
 * The Python worker owns the snapshot → normalized diff → review queue →
 * publish boundary. A model-selected extraction is deliberately only a
 * candidate, never a live routing fact.
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  evidence as evidenceTable,
  fees as feesTable,
  getDb,
  providerCapabilities,
  providerProducts,
  providerRequirements,
  providers,
  receivingEndpoints,
  requirements as requirementsTable,
  sourceDocuments,
  sourceTypeEnum,
} from "@railor/database";
import type { ProviderExtraction } from "@railor/types";
import { firecrawlExtract, isFirecrawlConfigured } from "../country-research/firecrawl.js";
import { fetchLatestFiling, VERIFIED_PUBLIC_COMPANIES } from "./edgar.js";
import { extractProviderCapabilities, type ProviderSource } from "./extract.js";
import { emptyCatalogReport, openCatalog, type CatalogReport } from "./catalog.js";

const sourceTypeValues = sourceTypeEnum.enumValues;

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

/** Mirrors the PRODUCT_LABELS used across the UI, so a researched row reads like a seeded one. */
const PRODUCT_LABELS: Record<string, string> = {
  on_ramp: "On-ramp",
  off_ramp: "Off-ramp",
  payout: "Payouts",
  collection: "Collections",
  virtual_account: "Virtual accounts",
  card_issuing: "Card issuing",
  card_funding: "Card funding",
  wallet: "Wallets",
  treasury: "Treasury",
  kyc_kyb: "KYC / KYB",
};

export class ProviderResearchError extends Error {}

export interface ProviderResearchReport {
  slug: string;
  urlsRequested: number;
  urlsScraped: number;
  scrapeFailures: Array<{ url: string; error: string }>;
  rowsCreated: { capabilities: number; receivingEndpoints: number; fees: number; requirements: number; products: number };
  droppedForBadCitation: number;
  /** Rows the model returned that failed field validation and were skipped individually. */
  droppedInvalidRows: number;
  catalog: CatalogReport;
  notes: string[];
  /** Candidate facts, always returned for review before any publication. */
  extraction?: ProviderExtraction;
}

/** Normalizes a requirement label into the `requirements.key` vocabulary. */
function requirementKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

/**
 * Rows whose `sourceUrls` include anything that wasn't actually scraped are
 * dropped wholesale. This is the hallucination gate: the model can only cite
 * what it was given, so a citation outside that set means the row's
 * provenance is not real, whatever the quote says.
 */
function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function hasVerbatimCitation(sourceUrls: string[], quote: string, supplied: ProviderSource[]): boolean {
  if (sourceUrls.length === 0 || !quote.trim()) return false;
  const citedSources = supplied.filter((source) => sourceUrls.includes(source.url));
  if (citedSources.length !== sourceUrls.length) return false;
  const normalizedQuote = normalizeEvidenceText(quote);
  return citedSources.some((source) => normalizeEvidenceText(source.content).includes(normalizedQuote));
}

/**
 * Shared extract+candidate core, fed by already-fetched sources regardless of
 * where they came from — a Firecrawl scrape (researchProvider) or a real SEC
 * filing (researchProviderFromEdgar). Whatever supplied the text, the
 * citation gate and normalized candidate shape are identical. Publication is
 * intentionally delegated to the worker's review-controlled path.
 */
async function ingestFromSources(
  slug: string,
  sources: ProviderSource[],
  options: { dryRun?: boolean; sourceType?: (typeof sourceTypeValues)[number] } = {},
): Promise<ProviderResearchReport> {
  const sourceType = options.sourceType ?? "official_docs";
  const db = await getDb();
  const [found] = await db.select().from(providers).where(eq(providers.slug, slug)).limit(1);
  if (!found) throw new ProviderResearchError(`No provider with slug "${slug}".`);
  const provider = found;

  const report: ProviderResearchReport = {
    slug,
    urlsRequested: sources.length,
    urlsScraped: sources.length,
    scrapeFailures: [],
    rowsCreated: { capabilities: 0, receivingEndpoints: 0, fees: 0, requirements: 0, products: 0 },
    droppedForBadCitation: 0,
    droppedInvalidRows: 0,
    catalog: emptyCatalogReport(),
    notes: [],
  };
  if (sources.length === 0) {
    throw new ProviderResearchError(`No source content supplied for ${slug} — nothing to extract from.`);
  }
  /* ---- 2. extract ---- */
  const { extraction, invalidRows } = await extractProviderCapabilities(provider.name, sources);
  report.notes = extraction.notes;
  report.droppedInvalidRows = invalidRows;

  if (options.dryRun) return { ...report, extraction };

  /* ---- 3. persist ---- */
  const catalog = await openCatalog(report.catalog);

  /** One evidence row per (source URL, quote) pair, reused across rows citing the same span. */
  const evidenceCache = new Map<string, string>();
  async function evidenceFor(sourceUrls: string[], quote: string): Promise<string | null> {
    const url = sourceUrls[0];
    if (!url) return null;
    const cacheKey = `${url}::${quote}`;
    const cached = evidenceCache.get(cacheKey);
    if (cached) return cached;

    const source = sources.find((s) => s.url === url);
    const [doc] = await db
      .select()
      .from(sourceDocuments)
      .where(and(eq(sourceDocuments.providerId, provider.id), eq(sourceDocuments.url, url)))
      .limit(1);
    let docId = doc?.id;
    if (!docId) {
      const [inserted] = await db
        .insert(sourceDocuments)
        .values({
          providerId: provider.id,
          url,
          title: source?.title ?? url,
          sourceType,
          crawlFrequencyHours: 168,
          // Without this, a newly-ingested source never enters
          // checkDueSources()'s queue until something else happens to touch
          // it — see source-monitor.ts.
          nextCheckAt: new Date(),
        })
        .returning({ id: sourceDocuments.id });
      docId = inserted!.id;
    }

    const rawHash = hash(url + quote);
    const [existing] = await db
      .select()
      .from(evidenceTable)
      .where(and(eq(evidenceTable.providerId, provider.id), eq(evidenceTable.rawHash, rawHash)))
      .limit(1);
    if (existing) {
      evidenceCache.set(cacheKey, existing.id);
      return existing.id;
    }

    const now = new Date();
    const [row] = await db
      .insert(evidenceTable)
      .values({
        providerId: provider.id,
        sourceDocumentId: docId,
        sourceUrl: url,
        sourceTitle: source?.title ?? url,
        sourceType,
        retrievedAt: now,
        lastVerifiedAt: now,
        // Below the 0.95 the hand-verified batch files carry: this quote was
        // selected by a model, not read by a person.
        confidence: "0.85",
        rawExcerpt: quote,
        rawHash,
      })
      .returning({ id: evidenceTable.id });
    evidenceCache.set(cacheKey, row!.id);
    return row!.id;
  }

  const existingCaps = await db
    .select()
    .from(providerCapabilities)
    .where(eq(providerCapabilities.providerId, provider.id));
  const existingEndpoints = await db
    .select()
    .from(receivingEndpoints)
    .where(eq(receivingEndpoints.providerId, provider.id));
  const existingFees = await db.select().from(feesTable).where(eq(feesTable.providerId, provider.id));
  const existingProducts = new Set(
    (await db.select().from(providerProducts).where(eq(providerProducts.providerId, provider.id))).map((p) => p.product),
  );

  /* products */
  for (const product of new Set(extraction.products)) {
    if (existingProducts.has(product)) continue;
    await db.insert(providerProducts).values({
      providerId: provider.id,
      product,
      // `name` is the human label for the row; the provider's own marketing
      // name for the product isn't reliably extractable, so the canonical
      // product label is used rather than inventing a brand name.
      name: PRODUCT_LABELS[product] ?? product,
    });
    existingProducts.add(product);
    report.rowsCreated.products += 1;
  }

  /* corridors → receiving_endpoints (money landing in a country) */
  for (const corridor of extraction.corridors) {
    if (!hasVerbatimCitation(corridor.sourceUrls, corridor.quote, sources)) {
      report.droppedForBadCitation += 1;
      continue;
    }
    const country = await catalog.country(corridor.country);
    if (!country) continue;
    const currency = await catalog.currency(corridor.currency);

    const dupe = existingEndpoints.some(
      (e) => e.countryCode === country && e.destinationCurrency === (currency ?? null),
    );
    if (dupe) continue;

    const evidenceId = await evidenceFor(corridor.sourceUrls, corridor.quote);
    await db.insert(receivingEndpoints).values({
      providerId: provider.id,
      countryCode: country,
      endpointType: "bank_account",
      stablecoinMode: corridor.stablecoinMode,
      customerType: corridor.customerType,
      destinationCurrency: currency,
      settlementEstimate: corridor.settlementEstimate,
      availability: "supported",
      note: corridor.quote,
      evidenceId,
      lastVerifiedAt: new Date(),
    });
    existingEndpoints.push({ countryCode: country, destinationCurrency: currency } as never);
    report.rowsCreated.receivingEndpoints += 1;

    // A receiving_endpoints row is deliberately entity-agnostic — repository.ts
    // maps every one to `entityCountry: null`, because "money can land here"
    // says nothing about who is allowed to send it. So when a source *does*
    // tie the corridor to the sending entity's jurisdiction, that fact needs a
    // provider_capabilities row as well: entity + destination on one row is
    // the only shape the eligibility engine (and therefore the route map) can
    // read as a corridor. Without this the entity fact would be extracted,
    // validated, and then silently thrown away.
    const entityCountry = await catalog.country(corridor.entityCountry);
    if (!entityCountry) continue;

    const corridorDupe = existingCaps.some(
      (c) =>
        c.product === corridor.product &&
        c.entityCountry === entityCountry &&
        c.destinationCountry === country &&
        c.destinationCurrency === (currency ?? null),
    );
    if (corridorDupe) continue;

    await db.insert(providerCapabilities).values({
      providerId: provider.id,
      product: corridor.product,
      entityCountry,
      destinationCountry: country,
      destinationCurrency: currency,
      customerType: corridor.customerType,
      availability: "supported",
      derivation: "model",
      note: corridor.quote,
      evidenceId,
      lastVerifiedAt: new Date(),
    });
    existingCaps.push({
      product: corridor.product,
      entityCountry,
      destinationCountry: country,
      destinationCurrency: currency,
      sourceAsset: null,
      sourceNetwork: null,
    } as never);
    report.rowsCreated.capabilities += 1;
  }

  /**
   * entity eligibility → provider_capabilities (entityCountry set, no destination)
   *
   * This is the facet the eligibility engine gates on, and the one real
   * providers were missing entirely: without it every corridor query naming an
   * entity jurisdiction rejects them, so no real provider could ever appear on
   * the route map however much destination coverage it had.
   */
  for (const item of extraction.entityEligibility) {
    if (!hasVerbatimCitation(item.sourceUrls, item.quote, sources)) {
      report.droppedForBadCitation += 1;
      continue;
    }
    const entityCountry = await catalog.country(item.entityCountry);
    if (!entityCountry) continue;
    // Eligibility stated for the account generally is recorded against the
    // provider's broadest money-movement product rather than invented per-product.
    const product = item.product ?? "payout";

    const dupe = existingCaps.some(
      (c) => c.product === product && c.entityCountry === entityCountry && c.destinationCountry === null,
    );
    if (dupe) continue;

    const evidenceId = await evidenceFor(item.sourceUrls, item.quote);
    await db.insert(providerCapabilities).values({
      providerId: provider.id,
      product,
      entityCountry,
      customerType: item.customerType,
      availability: "supported",
      derivation: "model",
      note: item.quote,
      evidenceId,
      lastVerifiedAt: new Date(),
    });
    existingCaps.push({
      product,
      entityCountry,
      destinationCountry: null,
      destinationCurrency: null,
      sourceAsset: null,
      sourceNetwork: null,
    } as never);
    report.rowsCreated.capabilities += 1;
  }

  /* assets → provider_capabilities */
  for (const asset of extraction.assets) {
    if (!hasVerbatimCitation(asset.sourceUrls, asset.quote, sources)) {
      report.droppedForBadCitation += 1;
      continue;
    }
    const symbol = await catalog.asset(asset.symbol);
    if (!symbol) continue;
    const network = await catalog.network(asset.network);
    if (network) await catalog.confirmAssetOnNetwork(symbol, network, asset.symbol);

    const dupe = existingCaps.some(
      (c) => c.product === asset.product && c.sourceAsset === symbol && c.sourceNetwork === (network ?? null),
    );
    if (dupe) continue;

    const evidenceId = await evidenceFor(asset.sourceUrls, asset.quote);
    await db.insert(providerCapabilities).values({
      providerId: provider.id,
      product: asset.product,
      sourceAsset: symbol,
      sourceNetwork: network,
      availability: "supported",
      derivation: "model",
      note: asset.quote,
      evidenceId,
      lastVerifiedAt: new Date(),
    });
    existingCaps.push({ product: asset.product, sourceAsset: symbol, sourceNetwork: network } as never);
    report.rowsCreated.capabilities += 1;
  }

  /* fees */
  for (const fee of extraction.fees) {
    if (!hasVerbatimCitation(fee.sourceUrls, fee.quote, sources)) {
      report.droppedForBadCitation += 1;
      continue;
    }
    const destinationCurrency = await catalog.currency(fee.destinationCurrency);
    const fixedCurrency = await catalog.currency(fee.fixedCurrency);

    const dupe = existingFees.some(
      (f) => f.product === fee.product && f.summary === fee.summary && f.destinationCurrency === (destinationCurrency ?? null),
    );
    if (dupe) continue;

    const evidenceId = await evidenceFor(fee.sourceUrls, fee.quote);
    await db.insert(feesTable).values({
      providerId: provider.id,
      product: fee.product,
      destinationCurrency,
      percentBps: fee.percentBps,
      fixedAmount: fee.fixedAmount !== null ? String(fee.fixedAmount) : null,
      fixedCurrency,
      fxSpreadBps: fee.fxSpreadBps,
      summary: fee.summary,
      evidenceId,
      lastVerifiedAt: new Date(),
    });
    existingFees.push({ product: fee.product, summary: fee.summary, destinationCurrency } as never);
    report.rowsCreated.fees += 1;
  }

  /* requirements */
  const existingProviderReqs = await db
    .select()
    .from(providerRequirements)
    .where(eq(providerRequirements.providerId, provider.id));

  for (const requirement of extraction.requirements) {
    if (!hasVerbatimCitation(requirement.sourceUrls, requirement.quote, sources)) {
      report.droppedForBadCitation += 1;
      continue;
    }
    const key = requirementKey(requirement.label);
    if (!key) continue;

    let [reqRow] = await db.select().from(requirementsTable).where(eq(requirementsTable.key, key)).limit(1);
    if (!reqRow) {
      const [inserted] = await db
        .insert(requirementsTable)
        .values({ key, kind: requirement.kind, label: requirement.label })
        .returning();
      reqRow = inserted!;
    }

    const entityCountry = await catalog.country(requirement.appliesToCountry);
    if (existingProviderReqs.some((r) => r.requirementId === reqRow!.id && r.entityCountry === (entityCountry ?? null))) {
      continue;
    }

    const evidenceId = await evidenceFor(requirement.sourceUrls, requirement.quote);
    await db.insert(providerRequirements).values({
      providerId: provider.id,
      requirementId: reqRow.id,
      entityCountry,
      mandatory: requirement.mandatory,
      note: requirement.quote,
      evidenceId,
    });
    existingProviderReqs.push({ requirementId: reqRow.id, entityCountry } as never);
    report.rowsCreated.requirements += 1;
  }

  /* provider-level flags — only tightened when the sources actually state them */
  const patch: Record<string, unknown> = { lastVerifiedAt: new Date() };
  if (extraction.hasPublicApi === true) patch.hasApi = true;
  if (extraction.hasSandbox === true) patch.hasSandbox = true;
  await db.update(providers).set(patch).where(eq(providers.id, provider.id));

  return report;
}

/** Firecrawl-backed candidate extraction. Published facts still require the worker review flow. */
export async function researchProvider(
  slug: string,
  urls: string[],
  options: { dryRun?: boolean } = {},
): Promise<ProviderResearchReport> {
  if (!isFirecrawlConfigured()) {
    throw new ProviderResearchError("FIRECRAWL_API_KEY is not set — provider research cannot fetch source content.");
  }
  const scraped = await firecrawlExtract(urls);
  if (scraped.results.length === 0) {
    throw new ProviderResearchError(`Firecrawl retrieved no content for ${slug} — nothing to extract from.`);
  }
  const sources: ProviderSource[] = scraped.results.map((r) => ({ url: r.url, title: r.title, content: r.rawContent }));
  const report = await ingestFromSources(slug, sources, { ...options, dryRun: true });
  return { ...report, urlsRequested: urls.length, urlsScraped: scraped.results.length, scrapeFailures: scraped.failedResults };
}

/**
 * SEC-filing-backed research. Returns null (not an error) when the provider
 * isn't a public company or has no matching filing on EDGAR — most of this
 * dataset is private companies, and "nothing to file" is the expected,
 * correct outcome for almost every provider this is run against.
 */
export async function researchProviderFromEdgar(
  slug: string,
  options: { dryRun?: boolean } = {},
): Promise<ProviderResearchReport | null> {
  // findCompany's name+SIC+ticker heuristic is good, not perfect — it
  // mismatched two short/generic provider names in testing (see
  // VERIFIED_PUBLIC_COMPANIES's comment). Gating on a manually-confirmed CIK
  // means a provider not yet verified is skipped rather than researched
  // against whichever same-named company the heuristic happens to find.
  if (!(slug in VERIFIED_PUBLIC_COMPANIES)) return null;

  const db = await getDb();
  const [provider] = await db.select().from(providers).where(eq(providers.slug, slug)).limit(1);
  if (!provider) throw new ProviderResearchError(`No provider with slug "${slug}".`);

  const filing = await fetchLatestFiling(provider.name, VERIFIED_PUBLIC_COMPANIES[slug]);
  if (!filing) return null;

  const sources: ProviderSource[] = [{ url: filing.url, title: filing.title, content: filing.content }];
  return ingestFromSources(slug, sources, { ...options, dryRun: true, sourceType: "official_announcement" });
}
