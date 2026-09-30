/**
 * Live, keyless per-country coverage for on/off-ramp providers whose own
 * public APIs publish it — the same evidence class as
 * ramp-network-route-import.ts (a provider's live API, not a scraped page or
 * a model extraction), so these rows are recorded as source facts directly.
 *
 *   MoonPay    GET https://api.moonpay.com/v3/countries
 *              isBuyAllowed -> on_ramp, isSellAllowed -> off_ramp, per country
 *              (and per US state / Canadian province, kept in the row note).
 *   Guardarian GET https://api-payments.guardarian.com/v1/countries
 *              one service-wide `supported` flag per country. Guardarian's
 *              /v1/currencies lists sell (withdrawal) methods for its fiat
 *              currencies, so the flag is applied to both directions — with
 *              lower confidence for off_ramp and that caveat in every note.
 *
 * What a row means: entity/customer eligibility (see EntityEligibility in
 * @railor/types) — "may a customer in this country use this provider for
 * this product" — never a transport route. Both APIs describe the
 * provider's consumer onboarding, so rows carry customer_type = individual:
 * they never confirm eligibility for a business, which stays unknown.
 *
 * Explicit "no" flags are stored as `unsupported`: a provider's own API
 * saying a country is excluded is evidence, not absence of evidence.
 * Countries go through the shared catalog (catalog.ts), which adds only real
 * ISO codes with a curated region and reports the rest as unknown.
 *
 * Idempotent. Rows this importer created are refreshed when the live flag
 * changes; rows from any other source are never touched.
 *
 *   npx tsx packages/core/src/provider-research/live-country-coverage.ts [--dry-run]
 */
import "../../../database/src/dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import {
  evidence as evidenceTable,
  getDb,
  getDbHandle,
  providerCapabilities,
  providerProducts,
  providers,
  sourceDocuments,
} from "@railor/database";
import { emptyCatalogReport, openCatalog } from "./catalog.js";

type Product = "on_ramp" | "off_ramp";

interface CountryFlags {
  alpha2: string;
  name: string;
  flags: Partial<Record<Product, boolean>>;
  /** Sub-national exceptions, verbatim from the source, per product. */
  exceptions: Partial<Record<Product, string[]>>;
}

interface CoverageSource {
  slug: string;
  url: string;
  title: string;
  flagName: Record<Product, string>;
  confidence: Record<Product, string>;
  caveat: string | null;
  load(): Promise<CountryFlags[]>;
}

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return (await response.json()) as T;
}

interface MoonPayState { code: string; isAllowed: boolean; isBuyAllowed?: boolean; isSellAllowed?: boolean }
interface MoonPayCountry { alpha2: string; name: string; isAllowed: boolean; isBuyAllowed: boolean; isSellAllowed: boolean; states?: MoonPayState[] }
interface GuardarianCountry { code_iso_alpha_2: string; country_name: string; supported: boolean }

export const COVERAGE_SOURCES: CoverageSource[] = [
  {
    slug: "moonpay",
    url: "https://api.moonpay.com/v3/countries",
    title: "MoonPay API v3 — countries (live, keyless)",
    flagName: { on_ramp: "isBuyAllowed", off_ramp: "isSellAllowed" },
    confidence: { on_ramp: "0.95", off_ramp: "0.95" },
    caveat: null,
    async load() {
      const rows = await getJson<MoonPayCountry[]>(this.url);
      return rows.map((c) => {
        const blocked = (key: "isBuyAllowed" | "isSellAllowed") =>
          (c.states ?? []).filter((s) => s.isAllowed === false || s[key] === false).map((s) => s.code);
        return {
          alpha2: c.alpha2,
          name: c.name,
          flags: { on_ramp: c.isAllowed && c.isBuyAllowed, off_ramp: c.isAllowed && c.isSellAllowed },
          exceptions: { on_ramp: blocked("isBuyAllowed"), off_ramp: blocked("isSellAllowed") },
        };
      });
    },
  },
  {
    slug: "guardarian",
    url: "https://api-payments.guardarian.com/v1/countries",
    title: "Guardarian API v1 — countries (live, keyless)",
    flagName: { on_ramp: "supported", off_ramp: "supported" },
    confidence: { on_ramp: "0.90", off_ramp: "0.80" },
    caveat:
      "Guardarian publishes one service-wide `supported` flag per country, not a buy/sell split; its /v1/currencies endpoint lists sell (withdrawal) methods for its fiat currencies, so the flag is applied to off-ramp too, at lower confidence.",
    async load() {
      const rows = await getJson<GuardarianCountry[]>(this.url);
      return rows.map((c) => ({
        alpha2: c.code_iso_alpha_2,
        name: c.country_name,
        flags: { on_ramp: c.supported, off_ramp: c.supported },
        exceptions: {},
      }));
    },
  },
];

export interface CoverageReport {
  slug: string;
  countriesReported: number;
  supported: Record<Product, number>;
  unsupported: Record<Product, number>;
  created: number;
  refreshed: number;
  unchanged: number;
  skippedOtherSource: number;
  countriesAdded: string[];
  unknownCountries: string[];
}

export async function importLiveCoverage(source: CoverageSource, options: { dryRun?: boolean } = {}): Promise<CoverageReport> {
  const db = await getDb();
  const [provider] = await db.select().from(providers).where(eq(providers.slug, source.slug)).limit(1);
  if (!provider) throw new Error(`provider "${source.slug}" must already exist`);

  const countries = await source.load();
  const retrievedAt = new Date();
  const products: Product[] = ["on_ramp", "off_ramp"];
  const report: CoverageReport = {
    slug: source.slug,
    countriesReported: countries.length,
    supported: { on_ramp: 0, off_ramp: 0 },
    unsupported: { on_ramp: 0, off_ramp: 0 },
    created: 0,
    refreshed: 0,
    unchanged: 0,
    skippedOtherSource: 0,
    countriesAdded: [],
    unknownCountries: [],
  };
  for (const c of countries) for (const p of products) {
    if (c.flags[p] === true) report.supported[p]++;
    if (c.flags[p] === false) report.unsupported[p]++;
  }
  if (options.dryRun) return report;

  const catalogReport = emptyCatalogReport();
  const catalog = await openCatalog(catalogReport);

  const [doc] = await db
    .insert(sourceDocuments)
    .values({ providerId: provider.id, url: source.url, title: source.title, sourceType: "api", crawlFrequencyHours: 24, parser: "api_reference", lastCheckedAt: retrievedAt })
    .onConflictDoNothing({ target: [sourceDocuments.providerId, sourceDocuments.url] })
    .returning({ id: sourceDocuments.id });
  const docId =
    doc?.id ??
    (await db.select({ id: sourceDocuments.id }).from(sourceDocuments).where(and(eq(sourceDocuments.providerId, provider.id), eq(sourceDocuments.url, source.url))).limit(1))[0]!.id;

  // One evidence row per product per distinct live response: a changed
  // response gets a new row, an identical one is reused.
  const evidenceByProduct = new Map<Product, string>();
  for (const p of products) {
    const flagsFingerprint = countries.map((c) => `${c.alpha2}:${c.flags[p]}:${(c.exceptions[p] ?? []).join("+")}`).sort().join(",");
    const excerpt =
      `Live ${source.title}, retrieved ${retrievedAt.toISOString()}: ${countries.length} countries, ` +
      `${source.flagName[p]}=true for ${report.supported[p]} and false for ${report.unsupported[p]}. ` +
      `Each capability row's note carries its own country's flag verbatim.` +
      (source.caveat ? ` ${source.caveat}` : "");
    const rawHash = hash(`${source.url}|${p}|${flagsFingerprint}`);
    const [existing] = await db.select({ id: evidenceTable.id }).from(evidenceTable).where(eq(evidenceTable.rawHash, rawHash)).limit(1);
    const id =
      existing?.id ??
      (
        await db
          .insert(evidenceTable)
          .values({
            providerId: provider.id,
            sourceDocumentId: docId,
            sourceUrl: source.url,
            sourceTitle: source.title,
            sourceType: "api",
            verificationType: "provider_reported",
            retrievedAt,
            lastVerifiedAt: retrievedAt,
            confidence: source.confidence[p],
            rawExcerpt: excerpt,
            rawHash,
          })
          .returning({ id: evidenceTable.id })
      )[0]!.id;
    evidenceByProduct.set(p, id);
  }

  for (const p of products) {
    const [existingProduct] = await db
      .select({ id: providerProducts.id })
      .from(providerProducts)
      .where(and(eq(providerProducts.providerId, provider.id), eq(providerProducts.product, p)))
      .limit(1);
    if (!existingProduct) {
      await db.insert(providerProducts).values({ providerId: provider.id, product: p, name: p === "on_ramp" ? "On-ramp" : "Off-ramp" });
    }
  }

  // Existing individual-customer entity rows for this provider, with the URL
  // of the evidence behind each — only rows backed by this source's URL are
  // ever refreshed here.
  const existingRows = await db
    .select({ capability: providerCapabilities, evidenceUrl: evidenceTable.sourceUrl })
    .from(providerCapabilities)
    .leftJoin(evidenceTable, eq(providerCapabilities.evidenceId, evidenceTable.id))
    .where(and(eq(providerCapabilities.providerId, provider.id), eq(providerCapabilities.customerType, "individual")));
  const byKey = new Map(
    existingRows.filter((r) => r.capability.entityCountry).map((r) => [`${r.capability.product}|${r.capability.entityCountry}`, r]),
  );

  for (const c of countries) {
    const code = await catalog.country(c.alpha2);
    if (!code) continue;
    for (const p of products) {
      const flag = c.flags[p];
      if (flag === undefined) continue;
      const exceptions = c.exceptions[p] ?? [];
      const note =
        `${source.title}: ${source.flagName[p]}=${flag} for ${c.name}.` +
        (flag && exceptions.length ? ` Not available in these sub-national regions per the same response: ${exceptions.join(", ")}.` : "") +
        (source.caveat ? ` ${source.caveat}` : "");
      const availability = flag ? "supported" : "unsupported";
      const evidenceId = evidenceByProduct.get(p)!;
      const existing = byKey.get(`${p}|${code}`);

      if (existing) {
        if (existing.evidenceUrl !== source.url) {
          report.skippedOtherSource++;
          continue;
        }
        if (existing.capability.availability === availability && existing.capability.note === note) {
          report.unchanged++;
          continue;
        }
        await db
          .update(providerCapabilities)
          .set({ availability, note, evidenceId, lastVerifiedAt: retrievedAt })
          .where(eq(providerCapabilities.id, existing.capability.id));
        report.refreshed++;
        continue;
      }

      await db.insert(providerCapabilities).values({
        providerId: provider.id,
        product: p,
        entityCountry: code,
        customerType: "individual",
        availability,
        note,
        derivation: "source",
        evidenceId,
        lastVerifiedAt: retrievedAt,
      });
      report.created++;
    }
  }

  // The directory's freshness badge reads providers.last_verified_at; a live
  // API read is a real verification, so move it forward (never backward).
  if (!provider.lastVerifiedAt || provider.lastVerifiedAt < retrievedAt) {
    await db.update(providers).set({ lastVerifiedAt: retrievedAt }).where(eq(providers.id, provider.id));
  }

  report.countriesAdded = catalogReport.countriesAdded;
  report.unknownCountries = catalogReport.unknownCountries;
  return report;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const { close } = await getDbHandle();
  try {
    for (const source of COVERAGE_SOURCES.filter((s) => !only.length || only.includes(s.slug))) {
      const r = await importLiveCoverage(source, { dryRun });
      console.log(
        `${r.slug}: ${r.countriesReported} countries | on_ramp +${r.supported.on_ramp}/-${r.unsupported.on_ramp} | off_ramp +${r.supported.off_ramp}/-${r.unsupported.off_ramp}` +
          (dryRun ? " (dry run, nothing written)" : ` | created ${r.created}, refreshed ${r.refreshed}, unchanged ${r.unchanged}, skipped (other source) ${r.skippedOtherSource}`),
      );
      if (r.countriesAdded.length) console.log(`  countries added to catalog: ${r.countriesAdded.join(",")}`);
      if (r.unknownCountries.length) console.log(`  not recorded (no curated region): ${r.unknownCountries.join(",")}`);
    }
  } finally {
    await close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
