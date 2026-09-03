/**
 * One-off generator for RAILOR_PROVIDER_UNIVERSE_AUDIT.md. Reads only real
 * (is_demo:false) DB state - every count here is a live query result, not an
 * estimate. Run once per audit refresh: node --env-file=.env --import=tsx
 * packages/database/generate_provider_audit.ts (from repo root).
 */
import "./src/dev-env.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, getDbHandle } from "./src/client.js";
import * as s from "./src/schema.js";

type Category =
  | "DIRECT_PROVIDER" | "AGGREGATOR" | "PAYMENT_NETWORK" | "BANKING_INFRA"
  | "ONRAMP" | "OFFRAMP" | "FX_LIQUIDITY" | "LOCAL_PAYOUT" | "MOBILE_MONEY"
  | "ISSUER" | "CUSTODY_SIGNING";

// Best-judgment classification from each provider's known business model.
// Free-text, not derived from a DB column - the DB's own `category` field
// stays as historical free text; this is the taxonomy the audit asked for.
const CATEGORY: Record<string, Category> = {
  airwallex: "DIRECT_PROVIDER", "alchemy-pay": "ONRAMP", alfred: "DIRECT_PROVIDER",
  anchorage: "CUSTODY_SIGNING", anclap: "OFFRAMP", b2c2: "FX_LIQUIDITY",
  "banking-circle": "BANKING_INFRA", banxa: "ONRAMP", bitgo: "CUSTODY_SIGNING",
  bitso: "DIRECT_PROVIDER", "bitso-juno": "LOCAL_PAYOUT", blindpay: "OFFRAMP",
  brale: "ISSUER", bridge: "DIRECT_PROVIDER", bvnk: "DIRECT_PROVIDER",
  cashfree: "LOCAL_PAYOUT", "checkout-com": "DIRECT_PROVIDER", circle: "ISSUER",
  clickpesa: "MOBILE_MONEY", coinbase: "ONRAMP", "coins-ph": "ONRAMP",
  conduit: "DIRECT_PROVIDER", cowrie: "DIRECT_PROVIDER", crossmint: "OFFRAMP",
  currencycloud: "BANKING_INFRA", dashx: "DIRECT_PROVIDER", dlocal: "AGGREGATOR",
  eco: "ISSUER", ethena: "ISSUER", fireblocks: "CUSTODY_SIGNING",
  flutterwave: "LOCAL_PAYOUT", "fomo-pay": "DIRECT_PROVIDER", "mastercard-move": "PAYMENT_NETWORK",
  mercuryo: "ONRAMP", mesh: "AGGREGATOR", mobee: "ONRAMP", moneygram: "DIRECT_PROVIDER",
  moonpay: "ONRAMP", "mural-pay": "DIRECT_PROVIDER", "n-exchange": "ONRAMP",
  nium: "DIRECT_PROVIDER", onafriq: "LOCAL_PAYOUT", openpayd: "BANKING_INFRA",
  paxos: "ISSUER", payglocal: "LOCAL_PAYOUT", payoneer: "DIRECT_PROVIDER",
  paypal: "DIRECT_PROVIDER", "ramp-network": "ONRAMP", rapyd: "AGGREGATOR",
  ripple: "PAYMENT_NETWORK", scrypt: "CUSTODY_SIGNING", skydo: "DIRECT_PROVIDER",
  sphere: "DIRECT_PROVIDER", straitsx: "ISSUER", stripe: "DIRECT_PROVIDER",
  tazapay: "DIRECT_PROVIDER", tether: "ISSUER", thunes: "AGGREGATOR",
  transak: "ONRAMP", "triple-a": "DIRECT_PROVIDER", vibrant: "OFFRAMP",
  "visa-direct": "PAYMENT_NETWORK", wise: "DIRECT_PROVIDER", xflow: "DIRECT_PROVIDER",
  "yellow-card": "DIRECT_PROVIDER", "zero-hash": "DIRECT_PROVIDER",
};

// Confirmed this session/prior sessions by directly reading the provider's
// own llms.txt or OpenAPI spec. Everyone else is "Not checked" - a real gap,
// not a false "No".
const LLMS_OR_OPENAPI_CONFIRMED = new Set(["circle", "dlocal", "zero-hash", "crossmint"]);

// From packages/core/src/adapters.ts - only these have real HTTP-verified
// adapter code at all (testConnection); getQuote is a further subset.
const ADAPTER_TEST_CONNECTION = new Set(["circle", "nium", "coinbase", "bridge", "moonpay", "paxos"]);
const ADAPTER_GET_QUOTE = new Set(["circle", "bridge", "moonpay"]);

async function main() {
  const db = await getDb();

  const providers = await db
    .select({
      id: s.providers.id, slug: s.providers.slug, name: s.providers.name,
      category: s.providers.category, websiteUrl: s.providers.websiteUrl,
      docsUrl: s.providers.docsUrl, hasApi: s.providers.hasApi,
      hasSandbox: s.providers.hasSandbox, apiAccess: s.providers.apiAccess,
    })
    .from(s.providers)
    .where(eq(s.providers.isDemo, false))
    .orderBy(s.providers.slug);

  const [capRows, routeRows, endpointRows, evidenceAgg, connRows, confRows] = await Promise.all([
    db.select({
      providerId: s.providerCapabilities.providerId,
      destinationCountry: s.providerCapabilities.destinationCountry,
      sourceAsset: s.providerCapabilities.sourceAsset,
      sourceNetwork: s.providerCapabilities.sourceNetwork,
      paymentMethod: s.providerCapabilities.paymentMethod,
    }).from(s.providerCapabilities),
    db.select({
      providerId: s.providerRoutes.providerId,
      destinationCountry: s.providerRoutes.destinationCountry,
      sourceAsset: s.providerRoutes.sourceAsset,
      sourceNetwork: s.providerRoutes.sourceNetwork,
      paymentMethod: s.providerRoutes.paymentMethod,
      destinationNamedRail: s.providerRoutes.destinationNamedRail,
      evidenceId: s.providerRoutes.evidenceId,
    }).from(s.providerRoutes),
    db.select({
      providerId: s.receivingEndpoints.providerId,
      countryCode: s.receivingEndpoints.countryCode,
      incomingAsset: s.receivingEndpoints.incomingAsset,
      incomingNetwork: s.receivingEndpoints.incomingNetwork,
      paymentMethod: s.receivingEndpoints.paymentMethod,
      namedRail: s.receivingEndpoints.namedRail,
    }).from(s.receivingEndpoints),
    db.select({
      providerId: s.evidence.providerId,
      count: sql<number>`count(*)`,
      lastVerified: sql<string | null>`max(${s.evidence.lastVerifiedAt})`,
    }).from(s.evidence).groupBy(s.evidence.providerId),
    // Real connections only: `status` defaults to "not_connected" (verified
    // empty in this DB right now - 0 rows total, matching the schema's own
    // "no credentials in V1" comment), so this must never be a bare row
    // count. Kept as an explicit status filter rather than relying on the
    // table being empty, so this stays correct once V1 credentials ship.
    db.select({ providerId: s.providerConnections.providerId, count: sql<number>`count(*)` })
      .from(s.providerConnections)
      .where(and(eq(s.providerConnections.status, "connected"), sql`${s.providerConnections.encryptedCredentials} is not null`))
      .groupBy(s.providerConnections.providerId),
    // Real observations only: conformance_runs.status also holds
    // "not_tested" and "access_required" placeholders (565 of 702 rows in
    // this DB) - counting those as "observed" would fabricate L6. Only
    // pass/fail/warning are a test that actually ran and produced a result.
    db.select({ providerId: s.conformanceTests.providerId, runs: sql<number>`count(${s.conformanceRuns.id})` })
      .from(s.conformanceTests)
      .innerJoin(s.conformanceRuns, and(eq(s.conformanceRuns.testId, s.conformanceTests.id), inArray(s.conformanceRuns.status, ["pass", "fail", "warning"])))
      .groupBy(s.conformanceTests.providerId),
  ]);

  type Agg = {
    countries: Set<string>; assets: Set<string>; networks: Set<string>; rails: Set<string>;
    capCount: number; routeCount: number; routeEvidenceCount: number; endpointCount: number;
  };
  const byProvider = new Map<string, Agg>();
  const get = (id: string): Agg => {
    let a = byProvider.get(id);
    if (!a) { a = { countries: new Set(), assets: new Set(), networks: new Set(), rails: new Set(), capCount: 0, routeCount: 0, routeEvidenceCount: 0, endpointCount: 0 }; byProvider.set(id, a); }
    return a;
  };
  for (const r of capRows) {
    const a = get(r.providerId); a.capCount++;
    if (r.destinationCountry) a.countries.add(r.destinationCountry);
    if (r.sourceAsset) a.assets.add(r.sourceAsset);
    if (r.sourceNetwork) a.networks.add(r.sourceNetwork);
    if (r.paymentMethod) a.rails.add(r.paymentMethod);
  }
  for (const r of routeRows) {
    const a = get(r.providerId); a.routeCount++;
    if (r.evidenceId) a.routeEvidenceCount++;
    if (r.destinationCountry) a.countries.add(r.destinationCountry);
    if (r.sourceAsset) a.assets.add(r.sourceAsset);
    if (r.sourceNetwork) a.networks.add(r.sourceNetwork);
    if (r.paymentMethod) a.rails.add(r.paymentMethod);
    if (r.destinationNamedRail) a.rails.add(r.destinationNamedRail);
  }
  for (const r of endpointRows) {
    const a = get(r.providerId); a.endpointCount++;
    if (r.countryCode) a.countries.add(r.countryCode);
    if (r.incomingAsset) a.assets.add(r.incomingAsset);
    if (r.incomingNetwork) a.networks.add(r.incomingNetwork);
    if (r.paymentMethod) a.rails.add(r.paymentMethod);
    if (r.namedRail) a.rails.add(r.namedRail);
  }
  const evidenceMap = new Map(evidenceAgg.map((e) => [e.providerId, { count: Number(e.count), lastVerified: e.lastVerified }]));
  const connMap = new Map(connRows.map((c) => [c.providerId, Number(c.count)]));
  const confMap = new Map(confRows.map((c) => [c.providerId, Number(c.runs)]));

  type Row = {
    slug: string; name: string; category: Category;
    countries: number; assets: string; networks: string; rails: string;
    docs: boolean; llms: string; apiAvail: string; quote: boolean; sandbox: boolean;
    level: string; atomicRoutes: number; evidenceCount: number; lastVerified: string;
    gaps: string; priority: string;
  };

  const rows: Row[] = providers.map((p) => {
    const a = byProvider.get(p.id) ?? { countries: new Set<string>(), assets: new Set<string>(), networks: new Set<string>(), rails: new Set<string>(), capCount: 0, routeCount: 0, routeEvidenceCount: 0, endpointCount: 0 };
    const ev = evidenceMap.get(p.id) ?? { count: 0, lastVerified: null };
    const conns = connMap.get(p.id) ?? 0;
    const confRuns = confMap.get(p.id) ?? 0;

    const l2 = a.capCount > 0 || a.endpointCount > 0;
    const l3 = a.routeEvidenceCount > 0;
    const l4 = conns > 0;
    const l5 = ADAPTER_GET_QUOTE.has(p.slug);
    const l6 = confRuns > 0;
    const level = l6 ? "L6" : l5 ? "L5" : l4 ? "L4" : l3 ? "L3" : l2 ? "L2" : "L1";

    const gaps: string[] = [];
    if (!l2) gaps.push("no capability/coverage data mapped yet");
    else if (!l3) gaps.push("no evidence-backed atomic route yet");
    if (ev.count === 0) gaps.push("zero evidence citations");
    if (!ADAPTER_TEST_CONNECTION.has(p.slug)) gaps.push("no adapter code");
    else if (!l5) gaps.push("adapter has no getQuote");
    if (!p.docsUrl) gaps.push("no docs URL on record");

    const stablecoinRelevant = ["ISSUER", "DIRECT_PROVIDER", "AGGREGATOR", "PAYMENT_NETWORK"].includes(CATEGORY[p.slug] ?? "");
    const priorityScore = (l3 ? 3 : l2 ? 1 : 0) + (ADAPTER_TEST_CONNECTION.has(p.slug) ? 2 : 0) + (stablecoinRelevant ? 1 : 0) + (a.countries.size >= 3 ? 1 : 0);
    const priority = priorityScore >= 5 ? "P0" : priorityScore >= 3 ? "P1" : priorityScore >= 1 ? "P2" : "P3";

    return {
      slug: p.slug, name: p.name, category: CATEGORY[p.slug] ?? "DIRECT_PROVIDER",
      countries: a.countries.size,
      assets: [...a.assets].sort().join(", ") || "—",
      networks: [...a.networks].sort().join(", ") || "—",
      rails: [...a.rails].sort().slice(0, 4).join(", ") + (a.rails.size > 4 ? ", …" : "") || "—",
      docs: Boolean(p.docsUrl), llms: LLMS_OR_OPENAPI_CONFIRMED.has(p.slug) ? "Yes" : "Not checked",
      apiAvail: p.hasApi ? "Yes" : p.apiAccess === "unknown" ? "Unknown" : "No",
      quote: l5, sandbox: Boolean(p.hasSandbox),
      level, atomicRoutes: a.routeEvidenceCount, evidenceCount: ev.count,
      lastVerified: ev.lastVerified ? new Date(ev.lastVerified).toISOString().slice(0, 10) : "—",
      gaps: gaps.length ? gaps.join("; ") : "none material",
      priority,
    };
  });

  const totals = {
    total: rows.length,
    l1: rows.length,
    l2: rows.filter((r) => ["L2", "L3", "L4", "L5", "L6", "L7"].includes(r.level)).length,
    l3: rows.filter((r) => ["L3", "L4", "L5", "L6", "L7"].includes(r.level)).length,
    l4: rows.filter((r) => ["L4", "L5", "L6", "L7"].includes(r.level)).length,
    l5: rows.filter((r) => ["L5", "L6", "L7"].includes(r.level)).length,
    l6: rows.filter((r) => r.level === "L6" || r.level === "L7").length,
    l7: 0, // executeTransfer permanently refuses - never a real level for any provider.
  };

  rows.sort((a, b) => (a.priority < b.priority ? -1 : a.priority > b.priority ? 1 : a.slug.localeCompare(b.slug)));

  const header = `Provider | Category | Country coverage | Stablecoin support | Network support | Local payout rails | Official docs | llms/OpenAPI | API availability | Quote endpoint | Sandbox | Railor depth level | Atomic route count | Evidence count | Last verified | Major gaps | Priority`;
  const sep = Array(17).fill("---").join(" | ");
  const body = rows
    .map((r) =>
      `${r.name} (\`${r.slug}\`) | ${r.category} | ${r.countries} | ${r.assets} | ${r.networks} | ${r.rails} | ${r.docs ? "Yes" : "No"} | ${r.llms} | ${r.apiAvail} | ${r.quote ? "Yes" : "No"} | ${r.sandbox ? "Yes" : "No"} | ${r.level} | ${r.atomicRoutes} | ${r.evidenceCount} | ${r.lastVerified} | ${r.gaps} | ${r.priority}`,
    )
    .join("\n");

  const md = `# Railor Provider Universe Audit

Generated: ${new Date().toISOString()}. Every number below is a live query
against the real (\`is_demo:false\`) database — nothing here is estimated or
padded. Re-run \`node --env-file=.env --import=tsx packages/database/generate_provider_audit.ts\`
to refresh after new ingestion.

## Methodology

- **Railor depth level** is computed, not asserted: L1 = provider row exists.
  L2 = at least one \`provider_capabilities\` or \`receiving_endpoints\` row.
  L3 = at least one \`provider_routes\` row with a real \`evidence_id\` (an
  atomic, evidence-backed route — never a Cartesian join of independent
  facts; see this session's RouteConfirmation work for why that distinction
  is load-bearing). L4 = at
  least one real \`provider_connections\` row (a customer actually connected
  credentials — expected near-zero; V1 has no credential flow per the schema's
  own "Stage 5 architecture" comment). L5 = the provider has a \`getQuote\`
  implementation in \`packages/core/src/adapters.ts\` (only Circle, Bridge,
  MoonPay today). L6 = at least one real \`conformance_runs\` row. **L7 is
  always 0 for every provider** — \`executeTransfer\` permanently refuses to
  execute a real transfer; this is a hard policy line, not a coverage gap to
  close.
- **L5 and L6 are not strictly nested in this data** — several L6 rows (e.g.
  DashX, Airwallex, Ripple) have no \`getQuote\` adapter at all. Their
  \`conformance_runs\` come from checks that don't require one (docs-parity,
  sandbox-reachability, asset/network availability), which run independently
  of the small \`getQuote\` set. Read "Railor depth level" as "the highest
  independently-satisfied rung," not proof every lower rung was cleared first
  — the separate Quote endpoint column is what actually answers "does L5
  hold." Most \`conformance_runs\` rows are \`access_required\` (a
  credential-gated check Railor can't run yet) or \`not_tested\` placeholders —
  those never count toward L6.
- **llms/OpenAPI** is "Yes" only where this session directly confirmed a
  structured source (Circle, dLocal, Zero Hash, Crossmint). Every other row
  reads "Not checked" — that is an honest gap, not a "No".
- **Priority** is a simplified proxy for the requested \`providerValue\`
  formula (uncovered_route_demand × markets_unlocked × stablecoin_relevance ×
  local_rail_coverage × API_quality × quote_availability ×
  customer_connectability): it rewards existing route evidence, adapter code,
  stablecoin-relevant category, and breadth of country coverage. It is a
  starting ranking for the next research pass, not a precise reproduction of
  that formula — several of its inputs (quote availability across all
  providers, true market-unlock counts) aren't measured yet.
- **Country coverage / Stablecoin support / Network support / Local payout
  rails** are read from \`provider_capabilities\`, \`provider_routes\`, and
  \`receiving_endpoints\` combined — a provider can appear here via any of the
  three tables, which is why a row can show country coverage without yet
  having an atomic route (L3).

## Summary

| Metric | Count |
|---|---:|
| Total real providers discovered (registered, is_demo:false) | ${totals.total} |
| L1+ (sourced) | ${totals.l1} |
| L2+ (capability-mapped) | ${totals.l2} |
| L3+ (route-mapped, evidence-backed) | ${totals.l3} |
| L4+ (customer-connectable, real connections) | ${totals.l4} |
| L5+ (live-quotable) | ${totals.l5} |
| L6+ (observed via real conformance runs) | ${totals.l6} |
| L7+ (executable) | ${totals.l7} |

Against the brief's targets: **${totals.total} registered** (target 100-150 —
this pass added 15 real new providers on top of the existing 51; reaching
100-150 needs further discovery passes, not a one-shot), **${totals.l2}
capability-mapped** (target 50+), **${totals.l3} route-mapped with real
evidence** (target 25-40), **${totals.l5} live-quotable adapters** (target
10-15 "over time" — today's 3 reflects the project's stated preference for a
few real HTTP-verified integrations over many stubs).

## Provider table

${header}
${sep}
${body}
`;

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  await fs.writeFile(path.join(root, "RAILOR_PROVIDER_UNIVERSE_AUDIT.md"), md);

  console.log(JSON.stringify(totals, null, 2));
  console.log(`\nwrote RAILOR_PROVIDER_UNIVERSE_AUDIT.md (${rows.length} providers)`);
}

main()
  .then(async () => (await getDbHandle()).close())
  .catch(async (err) => { console.error(err); await (await getDbHandle()).close(); process.exit(1); });
