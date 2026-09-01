/**
 * Reproducible V5.1 acceptance matrix. It intentionally reads normalized
 * database rows only: no crawl, no provider API calls, and no cross-row joins.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  evidence,
  getDb,
  getDbHandle,
  providerCapabilities,
  providerRoutes,
  providers,
  receivingEndpoints,
} from "@railor/database";
import { evaluateProvider } from "../eligibility.js";
import { loadProviderInputs } from "../repository.js";
import { PersistentParallelBudget } from "./parallel-ledger.js";

const COUNTRIES = ["DE", "FR", "NL", "CA", "AU", "HK", "ID", "ZA", "SA", "JP", "CH", "SE", "NO", "DK", "PL", "TR", "IL", "KR", "TH", "VN", "MY", "CO", "CL", "AR", "PE"] as const;
const usable = ["supported", "partial"] as const;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
config({ path: path.join(root, ".env") });

async function countCapabilities(predicate: Parameters<typeof and>[0]) {
  const db = await getDb();
  const rows = await db.select({ id: providerCapabilities.id, availability: providerCapabilities.availability })
    .from(providerCapabilities).innerJoin(providers, eq(providerCapabilities.providerId, providers.id))
    .leftJoin(evidence, eq(providerCapabilities.evidenceId, evidence.id))
    .where(and(eq(providers.isDemo, false), isNotNull(evidence.id), predicate));
  return rows.filter((r) => usable.includes(r.availability as (typeof usable)[number]));
}

async function run() {
  const db = await getDb();
  const beforeFlagship = { supported: 0, conditional: 0, unavailable: 1, unknown: 43 };
  const afterFlagship = { supported: 0, conditional: 0, unavailable: 0, unknown: 0 };
  const realProviderRows = await db.select({ slug: providers.slug }).from(providers).where(eq(providers.isDemo, false));
  const realProviderSlugs = new Set(realProviderRows.map((p) => p.slug));
  const inputs = await loadProviderInputs();
  const flagship = {
    entityCountry: "IN" as const, customerType: "business" as const, sourceCountry: "IN" as const,
    sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE" as const,
    destinationCurrency: "AED" as const, endpointType: "bank_account" as const, product: "payout" as const,
  };
  for (const provider of inputs.filter((p) => realProviderSlugs.has(p.slug))) {
    const verdict = evaluateProvider(provider, flagship).verdict;
    if (verdict === "supported") afterFlagship.supported++;
    else if (verdict === "additional_requirements") afterFlagship.conditional++;
    else if (verdict === "unavailable") afterFlagship.unavailable++;
    else afterFlagship.unknown++;
  }

  const perCountry = [];
  for (const country of COUNTRIES) {
    const [referenceFacts, partialRows, countryRows, stableRows, exactRows, namedRailRows] = await Promise.all([
      db.select({ id: providerCapabilities.id }).from(providerCapabilities).innerJoin(providers, eq(providerCapabilities.providerId, providers.id))
        .leftJoin(evidence, eq(providerCapabilities.evidenceId, evidence.id))
        .where(and(eq(providers.isDemo, false), isNotNull(evidence.id), eq(providerCapabilities.destinationCountry, country))),
      countCapabilities(and(eq(providerCapabilities.destinationCountry, country), isNotNull(providerCapabilities.destinationCurrency))),
      db.select({ id: providerRoutes.id, availability: providerRoutes.availability }).from(providerRoutes).innerJoin(providers, eq(providerRoutes.providerId, providers.id))
        .leftJoin(evidence, eq(providerRoutes.evidenceId, evidence.id))
        .where(and(eq(providers.isDemo, false), isNotNull(evidence.id), eq(providerRoutes.destinationCountry, country), isNotNull(providerRoutes.destinationCurrency), isNotNull(providerRoutes.entityCountry))),
      db.select({ id: providerRoutes.id, availability: providerRoutes.availability }).from(providerRoutes).innerJoin(providers, eq(providerRoutes.providerId, providers.id))
        .leftJoin(evidence, eq(providerRoutes.evidenceId, evidence.id))
        .where(and(eq(providers.isDemo, false), isNotNull(evidence.id), eq(providerRoutes.destinationCountry, country), isNotNull(providerRoutes.sourceAsset), isNotNull(providerRoutes.destinationCurrency), isNotNull(providerRoutes.destinationEndpointType))),
      db.select({ id: providerRoutes.id, availability: providerRoutes.availability }).from(providerRoutes).innerJoin(providers, eq(providerRoutes.providerId, providers.id))
        .leftJoin(evidence, eq(providerRoutes.evidenceId, evidence.id))
        .where(and(eq(providers.isDemo, false), isNotNull(evidence.id), eq(providerRoutes.destinationCountry, country), isNotNull(providerRoutes.entityCountry), isNotNull(providerRoutes.customerType), isNotNull(providerRoutes.sourceAsset), isNotNull(providerRoutes.sourceNetwork), isNotNull(providerRoutes.destinationCurrency), isNotNull(providerRoutes.destinationEndpointType), isNotNull(providerRoutes.destinationNamedRail))),
      db.select({ id: receivingEndpoints.id, availability: receivingEndpoints.availability }).from(receivingEndpoints).innerJoin(providers, eq(receivingEndpoints.providerId, providers.id))
        .leftJoin(evidence, eq(receivingEndpoints.evidenceId, evidence.id))
        .where(and(eq(providers.isDemo, false), isNotNull(evidence.id), eq(receivingEndpoints.countryCode, country), isNotNull(receivingEndpoints.destinationCurrency), isNotNull(receivingEndpoints.namedRail))),
    ]);
    const countUsable = (rows: Array<{ availability: string }>) => rows.filter((r) => usable.includes(r.availability as (typeof usable)[number])).length;
    const countryFiatRouteCount = countUsable(countryRows);
    const stablecoinFiatRouteCount = countUsable(stableRows);
    const exactRouteCount = countUsable(exactRows);
    const namedRailRouteCount = countUsable(namedRailRows);
    // YELLOW requires a genuinely country-scoped fiat route. A destination
    // fact plus a separate rail fact is still only partial evidence and stays
    // RED; otherwise this status would recreate V5's permissive metric.
    const status = stablecoinFiatRouteCount > 0 && namedRailRouteCount > 0
      ? "GREEN" : countryFiatRouteCount > 0 && namedRailRouteCount > 0 ? "YELLOW" : "RED";
    perCountry.push({ country, status, referenceFactCount: referenceFacts.length, partialFiatRouteCount: partialRows.length, countryFiatRouteCount, stablecoinFiatRouteCount, namedRailRouteCount, exactRouteCount, unknownCriticalRoutes: exactRouteCount === 0 ? 1 : 0 });
  }

  const totals = perCountry.reduce((acc, row) => ({
    referenceFacts: acc.referenceFacts + row.referenceFactCount,
    partialFiatRoutes: acc.partialFiatRoutes + row.partialFiatRouteCount,
    countryFiatRoutes: acc.countryFiatRoutes + row.countryFiatRouteCount,
    stablecoinFiatRoutes: acc.stablecoinFiatRoutes + row.stablecoinFiatRouteCount,
    namedRailRoutes: acc.namedRailRoutes + row.namedRailRouteCount,
    exactRoutes: acc.exactRoutes + row.exactRouteCount,
    green: acc.green + Number(row.status === "GREEN"), yellow: acc.yellow + Number(row.status === "YELLOW"), red: acc.red + Number(row.status === "RED"),
  }), { referenceFacts: 0, partialFiatRoutes: 0, countryFiatRoutes: 0, stablecoinFiatRoutes: 0, namedRailRoutes: 0, exactRoutes: 0, green: 0, yellow: 0, red: 0 });
  const budget = await new PersistentParallelBudget().report();
  const matrix = {
    generatedAt: new Date().toISOString(), methodology: "V5.1 strict: no cross-row joins. COUNTRY_ROUTE/STABLECOIN_FIAT_ROUTE/EXACT_ROUTE read only provider_routes rows with one evidence record; destination-only capability rows remain PARTIAL_ROUTE.",
    flagshipInToAe: { before: { ...beforeFlagship, scope: "Pre-V5.1 recorded V4 flagship run (44 real providers)" }, after: afterFlagship }, totals, countries: perCountry,
    verdictDefinitions: { SUPPORTED: "supported", CONDITIONAL: "additional_requirements", UNSUPPORTED: "unavailable", UNKNOWN: "unknown", DEGRADED: "operational state, not an evidence verdict", ACCESS_REQUIRED: "credential/runtime verification state, not an evidence verdict" },
  };
  const gaps = [
    {
      country: "DE", priority: "P0", provider: "bridge", status: "ACCESS_REQUIRED",
      missing: ["authenticated Customer endorsement and live route/quote response for the full DE business USDC/Base → EUR/SEPA bank route"],
      nextStep: "Bridge official docs establish only separate component facts. Use the Customer API endorsement and route/quote result before creating provider_routes.",
    },
    ...perCountry.filter((r) => r.status !== "GREEN" && r.country !== "DE").map((r) => ({ country: r.country, priority: r.status === "RED" ? "P0" : "P1", missing: r.stablecoinFiatRouteCount === 0 ? ["one atomic evidence-backed stablecoin-to-fiat route"] : ["one atomic exact route"], nextStep: "Use the existing V5 gap queue; search a provider API/docs for one complete provider_routes tuple, then re-run this matrix." })),
  ];
  const markdown = `# Railor V5.1 exact-route report\n\nGenerated: ${matrix.generatedAt}\n\nV5.1 replaces \`testsWithAnyUsable\`: only atomic evidence-backed provider routes count as country, stablecoin-fiat, or exact routes.\n\n| Metric | Before V5 headline | V5.1 strict |\n|---|---:|---:|\n| Countries called working | 25 | ${totals.green + totals.yellow} (GREEN ${totals.green}, YELLOW ${totals.yellow}, RED ${totals.red}) |\n| Country-scoped routes | not measured | ${totals.countryFiatRoutes} |\n| Stablecoin→fiat routes | not measured | ${totals.stablecoinFiatRoutes} |\n| Exact multidimensional routes | not measured | ${totals.exactRoutes} |\n| Named-rail relationships | not measured | ${totals.namedRailRoutes} |\n\n## Flagship: IN business USDC/Base → AE AED bank payout\n\nBefore: ${JSON.stringify(matrix.flagshipInToAe.before)}. After: ${JSON.stringify(matrix.flagshipInToAe.after)}. No exact source currently establishes the full tuple, so Railor answers \`UNKNOWN\`, not supported.\n\n## Country matrix\n\n| Country | Status | Reference | Partial fiat | Country fiat | Stablecoin→fiat | Named rail | Exact | Critical unknowns |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n${perCountry.map((r) => `| ${r.country} | ${r.status} | ${r.referenceFactCount} | ${r.partialFiatRouteCount} | ${r.countryFiatRouteCount} | ${r.stablecoinFiatRouteCount} | ${r.namedRailRouteCount} | ${r.exactRouteCount} | ${r.unknownCriticalRoutes} |`).join("\n")}\n\n## Truthful answerable exact routes\n\n${totals.exactRoutes ? "See the JSON matrix for the atomic route rows." : "None yet. Existing pieces remain useful reference or partial facts, but are not combined into routes."}\n\n## Parallel\n\nCommitted $${budget.committedUsd.toFixed(4)}, reserved $${budget.reservedUsd.toFixed(4)}, remaining $${budget.remainingUsd.toFixed(4)} in scope \`${budget.scopeKey}\`. No paid research was run by this matrix.\n\n## Remaining P0 gaps\n\n${gaps.filter((g) => g.priority === "P0").map((g) => `- ${g.country}: ${g.missing.join(", ")}`).join("\n") || "None."}\n`;
  await Promise.all([
    writeFile(path.join(root, "railor_v5_1_exact_route_matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`),
    writeFile(path.join(root, "railor_v5_1_parallel_usage.json"), `${JSON.stringify(budget, null, 2)}\n`),
    writeFile(path.join(root, "railor_v5_1_remaining_route_gaps.json"), `${JSON.stringify({ generatedAt: matrix.generatedAt, gaps }, null, 2)}\n`),
    writeFile(path.join(root, "RAILOR_V5_1_EXACT_ROUTE_REPORT.md"), markdown),
  ]);
  console.log(JSON.stringify({ totals, flagship: matrix.flagshipInToAe, parallel: budget }, null, 2));
}

run().then(async () => (await getDbHandle()).close()).catch(async (error) => { console.error(error); await (await getDbHandle()).close(); process.exit(1); });
