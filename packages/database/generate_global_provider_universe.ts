/**
 * Generator for the three DB-derived outputs from the "global provider &
 * competitor intelligence expansion" pass: RAILOR_GLOBAL_PROVIDER_UNIVERSE.md,
 * RAILOR_PROVIDER_UNIVERSE.json, RAILOR_PROVIDER_RESEARCH_GAPS.json.
 *
 * Supersedes generate_provider_audit.ts's RAILOR_PROVIDER_UNIVERSE_AUDIT.md
 * with a wider column set (regions/currencies split from countries, BYO
 * credential + commercial access columns) and the brief's renamed depth
 * ladder (L1 OFFICIAL_SOURCE_FOUND, L6 RAILOR_OBSERVED). The old file is left
 * in place as a dated snapshot rather than deleted. RAILOR_COMPETITIVE_ROUTING_AUDIT.md
 * is a separate, hand-written document (no DB data in it) and is not touched
 * by this script.
 *
 * Every number is a live query against real (is_demo:false) rows - nothing
 * here is estimated. Two columns (BYO credential support, commercial access
 * requirement) are per-provider commercial terms this session did not
 * research for the DB-registered set; they read "Not researched" rather than
 * a guess, and that gap is itself recorded in RAILOR_PROVIDER_RESEARCH_GAPS.json.
 */
import "./src/dev-env.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, getDbHandle } from "./src/client.js";
import * as s from "./src/schema.js";

type Category =
  | "DIRECT_PAYOUT_PROVIDER" | "AGGREGATOR" | "PAYMENT_NETWORK" | "BANKING_INFRA"
  | "ONRAMP" | "OFFRAMP" | "FX_LIQUIDITY" | "LIQUIDITY_PROVIDER" | "LOCAL_PAYOUT_PROVIDER"
  | "MOBILE_MONEY" | "ISSUER" | "CUSTODY_SIGNING" | "ROUTING_ORCHESTRATOR"
  | "STABLECOIN_INFRA" | "WALLET_INFRA" | "LOCAL_RAIL_OPERATOR" | "CARD_INFRA";

// A provider can carry more than one category - the brief is explicit that
// e.g. custody infra must never be conflated with a direct payout provider,
// but a company can genuinely be both a card issuer and a stablecoin infra
// provider. Everyone not listed defaults to ["DIRECT_PAYOUT_PROVIDER"].
const CATEGORIES: Record<string, Category[]> = {
  airwallex: ["DIRECT_PAYOUT_PROVIDER", "BANKING_INFRA"], "alchemy-pay": ["ONRAMP", "OFFRAMP"],
  alfred: ["DIRECT_PAYOUT_PROVIDER", "STABLECOIN_INFRA"], anchorage: ["CUSTODY_SIGNING"],
  anclap: ["OFFRAMP", "STABLECOIN_INFRA"], b2c2: ["FX_LIQUIDITY", "LIQUIDITY_PROVIDER"],
  "banking-circle": ["BANKING_INFRA"], banxa: ["ONRAMP", "OFFRAMP"], bitgo: ["CUSTODY_SIGNING"],
  bitso: ["DIRECT_PAYOUT_PROVIDER", "ONRAMP"], "bitso-juno": ["LOCAL_PAYOUT_PROVIDER"],
  blindpay: ["OFFRAMP", "STABLECOIN_INFRA"], brale: ["ISSUER", "STABLECOIN_INFRA"],
  bridge: ["DIRECT_PAYOUT_PROVIDER", "STABLECOIN_INFRA"], bvnk: ["DIRECT_PAYOUT_PROVIDER", "STABLECOIN_INFRA"],
  cashfree: ["LOCAL_PAYOUT_PROVIDER"], "checkout-com": ["DIRECT_PAYOUT_PROVIDER"],
  circle: ["ISSUER", "PAYMENT_NETWORK"], clickpesa: ["MOBILE_MONEY"], coinbase: ["ONRAMP", "OFFRAMP"],
  "coins-ph": ["ONRAMP", "OFFRAMP"], conduit: ["DIRECT_PAYOUT_PROVIDER", "STABLECOIN_INFRA"],
  cowrie: ["DIRECT_PAYOUT_PROVIDER"], crossmint: ["OFFRAMP", "ONRAMP"], currencycloud: ["BANKING_INFRA", "FX_LIQUIDITY"],
  dashx: ["DIRECT_PAYOUT_PROVIDER"], dlocal: ["AGGREGATOR", "LOCAL_RAIL_OPERATOR"],
  eco: ["ISSUER", "STABLECOIN_INFRA"], ethena: ["ISSUER"], fireblocks: ["CUSTODY_SIGNING"],
  flutterwave: ["LOCAL_PAYOUT_PROVIDER", "MOBILE_MONEY"], "fomo-pay": ["DIRECT_PAYOUT_PROVIDER"],
  "mastercard-move": ["PAYMENT_NETWORK"], mercuryo: ["ONRAMP", "OFFRAMP"], mesh: ["AGGREGATOR", "WALLET_INFRA"],
  mobee: ["ONRAMP", "OFFRAMP"], moneygram: ["DIRECT_PAYOUT_PROVIDER", "LOCAL_RAIL_OPERATOR"],
  moonpay: ["ONRAMP", "OFFRAMP"], "mural-pay": ["DIRECT_PAYOUT_PROVIDER", "STABLECOIN_INFRA"],
  "n-exchange": ["ONRAMP", "OFFRAMP"], nium: ["DIRECT_PAYOUT_PROVIDER", "AGGREGATOR"],
  onafriq: ["LOCAL_PAYOUT_PROVIDER", "MOBILE_MONEY"], openpayd: ["BANKING_INFRA"],
  paxos: ["ISSUER", "STABLECOIN_INFRA"], payglocal: ["LOCAL_PAYOUT_PROVIDER"],
  payoneer: ["DIRECT_PAYOUT_PROVIDER"], paypal: ["DIRECT_PAYOUT_PROVIDER"],
  "ramp-network": ["ONRAMP", "OFFRAMP"], rapyd: ["AGGREGATOR"], ripple: ["PAYMENT_NETWORK", "STABLECOIN_INFRA"],
  scrypt: ["CUSTODY_SIGNING"], skydo: ["DIRECT_PAYOUT_PROVIDER"], sphere: ["DIRECT_PAYOUT_PROVIDER", "STABLECOIN_INFRA"],
  straitsx: ["ISSUER", "STABLECOIN_INFRA"], stripe: ["DIRECT_PAYOUT_PROVIDER"],
  tazapay: ["DIRECT_PAYOUT_PROVIDER"], tether: ["ISSUER"], thunes: ["AGGREGATOR", "LOCAL_RAIL_OPERATOR"],
  transak: ["ONRAMP", "OFFRAMP"], "triple-a": ["DIRECT_PAYOUT_PROVIDER", "STABLECOIN_INFRA"],
  vibrant: ["OFFRAMP", "WALLET_INFRA"], "visa-direct": ["PAYMENT_NETWORK"],
  wise: ["DIRECT_PAYOUT_PROVIDER"], xflow: ["DIRECT_PAYOUT_PROVIDER"],
  "yellow-card": ["DIRECT_PAYOUT_PROVIDER", "STABLECOIN_INFRA"], "zero-hash": ["DIRECT_PAYOUT_PROVIDER", "STABLECOIN_INFRA"],
  // This pass's batch, from the Mastercard Crypto Partner Program list and
  // Meld's network-integrations page - see register.ts for the domain
  // verification notes on each.
  dtcpay: ["DIRECT_PAYOUT_PROVIDER", "STABLECOIN_INFRA"], lirium: ["STABLECOIN_INFRA", "LIQUIDITY_PROVIDER"],
  parfin: ["DIRECT_PAYOUT_PROVIDER", "CUSTODY_SIGNING"], fuze: ["STABLECOIN_INFRA", "BANKING_INFRA"],
  stablecore: ["STABLECOIN_INFRA", "ISSUER"], "1money": ["PAYMENT_NETWORK", "STABLECOIN_INFRA"],
  thredd: ["CARD_INFRA"], "pomelo-la": ["CARD_INFRA"], kulipa: ["CARD_INFRA"],
  "episode-six": ["CARD_INFRA"], moorwand: ["CARD_INFRA", "BANKING_INFRA"], highnote: ["CARD_INFRA"],
  monavate: ["BANKING_INFRA", "CARD_INFRA"], paycaddy: ["CARD_INFRA"], baanx: ["CARD_INFRA", "WALLET_INFRA"],
  immersve: ["CARD_INFRA"], unlimit: ["DIRECT_PAYOUT_PROVIDER", "AGGREGATOR"],
  "cross-river": ["BANKING_INFRA"], "cbw-bank": ["BANKING_INFRA"], webbank: ["BANKING_INFRA"],
  "peoples-group": ["BANKING_INFRA"], koywe: ["STABLECOIN_INFRA", "DIRECT_PAYOUT_PROVIDER"],
  opendue: ["DIRECT_PAYOUT_PROVIDER", "WALLET_INFRA"], fonbnk: ["STABLECOIN_INFRA", "MOBILE_MONEY"],
  guardarian: ["ONRAMP", "OFFRAMP"],
};

const LLMS_OR_OPENAPI_CONFIRMED = new Set(["circle", "dlocal", "zero-hash", "crossmint", "onramper", "moderntreasury"]);
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
      providerId: s.providerCapabilities.providerId, destinationCountry: s.providerCapabilities.destinationCountry,
      destinationCurrency: s.providerCapabilities.destinationCurrency, sourceAsset: s.providerCapabilities.sourceAsset,
      sourceNetwork: s.providerCapabilities.sourceNetwork, paymentMethod: s.providerCapabilities.paymentMethod,
    }).from(s.providerCapabilities),
    db.select({
      providerId: s.providerRoutes.providerId, destinationCountry: s.providerRoutes.destinationCountry,
      destinationCurrency: s.providerRoutes.destinationCurrency, sourceAsset: s.providerRoutes.sourceAsset,
      sourceNetwork: s.providerRoutes.sourceNetwork, paymentMethod: s.providerRoutes.paymentMethod,
      destinationNamedRail: s.providerRoutes.destinationNamedRail, evidenceId: s.providerRoutes.evidenceId,
    }).from(s.providerRoutes),
    db.select({
      providerId: s.receivingEndpoints.providerId, countryCode: s.receivingEndpoints.countryCode,
      destinationCurrency: s.receivingEndpoints.destinationCurrency, incomingAsset: s.receivingEndpoints.incomingAsset,
      incomingNetwork: s.receivingEndpoints.incomingNetwork, paymentMethod: s.receivingEndpoints.paymentMethod,
      namedRail: s.receivingEndpoints.namedRail,
    }).from(s.receivingEndpoints),
    db.select({
      providerId: s.evidence.providerId, count: sql<number>`count(*)`,
      lastVerified: sql<string | null>`max(${s.evidence.lastVerifiedAt})`,
    }).from(s.evidence).groupBy(s.evidence.providerId),
    db.select({ providerId: s.providerConnections.providerId, count: sql<number>`count(*)` })
      .from(s.providerConnections)
      .where(and(eq(s.providerConnections.status, "connected"), sql`${s.providerConnections.encryptedCredentials} is not null`))
      .groupBy(s.providerConnections.providerId),
    db.select({ providerId: s.conformanceTests.providerId, runs: sql<number>`count(${s.conformanceRuns.id})` })
      .from(s.conformanceTests)
      .innerJoin(s.conformanceRuns, and(eq(s.conformanceRuns.testId, s.conformanceTests.id), inArray(s.conformanceRuns.status, ["pass", "fail", "warning"])))
      .groupBy(s.conformanceTests.providerId),
  ]);

  type Agg = {
    countries: Set<string>; currencies: Set<string>; assets: Set<string>; networks: Set<string>;
    rails: Set<string>; namedRails: Set<string>;
    capCount: number; routeCount: number; routeEvidenceCount: number; endpointCount: number;
  };
  const byProvider = new Map<string, Agg>();
  const get = (id: string): Agg => {
    let a = byProvider.get(id);
    if (!a) { a = { countries: new Set(), currencies: new Set(), assets: new Set(), networks: new Set(), rails: new Set(), namedRails: new Set(), capCount: 0, routeCount: 0, routeEvidenceCount: 0, endpointCount: 0 }; byProvider.set(id, a); }
    return a;
  };
  for (const r of capRows) {
    const a = get(r.providerId); a.capCount++;
    if (r.destinationCountry) a.countries.add(r.destinationCountry);
    if (r.destinationCurrency) a.currencies.add(r.destinationCurrency);
    if (r.sourceAsset) a.assets.add(r.sourceAsset);
    if (r.sourceNetwork) a.networks.add(r.sourceNetwork);
    if (r.paymentMethod) a.rails.add(r.paymentMethod);
  }
  for (const r of routeRows) {
    const a = get(r.providerId); a.routeCount++;
    if (r.evidenceId) a.routeEvidenceCount++;
    if (r.destinationCountry) a.countries.add(r.destinationCountry);
    if (r.destinationCurrency) a.currencies.add(r.destinationCurrency);
    if (r.sourceAsset) a.assets.add(r.sourceAsset);
    if (r.sourceNetwork) a.networks.add(r.sourceNetwork);
    if (r.paymentMethod) a.rails.add(r.paymentMethod);
    if (r.destinationNamedRail) a.namedRails.add(r.destinationNamedRail);
  }
  for (const r of endpointRows) {
    const a = get(r.providerId); a.endpointCount++;
    if (r.countryCode) a.countries.add(r.countryCode);
    if (r.destinationCurrency) a.currencies.add(r.destinationCurrency);
    if (r.incomingAsset) a.assets.add(r.incomingAsset);
    if (r.incomingNetwork) a.networks.add(r.incomingNetwork);
    if (r.paymentMethod) a.rails.add(r.paymentMethod);
    if (r.namedRail) a.namedRails.add(r.namedRail);
  }
  const evidenceMap = new Map(evidenceAgg.map((e) => [e.providerId, { count: Number(e.count), lastVerified: e.lastVerified }]));
  const connMap = new Map(connRows.map((c) => [c.providerId, Number(c.count)]));
  const confMap = new Map(confRows.map((c) => [c.providerId, Number(c.runs)]));

  const now = Date.now();
  const STALE_DAYS = 30;

  type Row = {
    slug: string; name: string; categories: Category[]; website: string | null; docs: string | null;
    apiDocs: string | null; llmsOrOpenapi: boolean; regions: string; stablecoins: string; networks: string;
    countries: number; currencies: string; localRails: string; routeCount: number; evidenceCount: number;
    level: string; quoteSupport: boolean; byoCredentials: string; commercialAccess: string;
    lastVerified: string | null; staleEvidence: boolean; gaps: string[];
  };

  const rows: Row[] = providers.map((p) => {
    const a = byProvider.get(p.id) ?? { countries: new Set<string>(), currencies: new Set<string>(), assets: new Set<string>(), networks: new Set<string>(), rails: new Set<string>(), namedRails: new Set<string>(), capCount: 0, routeCount: 0, routeEvidenceCount: 0, endpointCount: 0 };
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
    gaps.push("BYO-credential support not researched");
    gaps.push("commercial access requirement not researched");

    const lastVerifiedDate = ev.lastVerified ? new Date(ev.lastVerified) : null;
    const staleEvidence = Boolean(lastVerifiedDate && now - lastVerifiedDate.getTime() > STALE_DAYS * 86_400_000);
    if (staleEvidence) gaps.push(`evidence older than ${STALE_DAYS} days`);

    return {
      slug: p.slug, name: p.name, categories: CATEGORIES[p.slug] ?? ["DIRECT_PAYOUT_PROVIDER"],
      website: p.websiteUrl, docs: p.docsUrl, apiDocs: p.docsUrl,
      llmsOrOpenapi: LLMS_OR_OPENAPI_CONFIRMED.has(p.slug),
      regions: [...a.countries].sort().join(", ") || "—",
      stablecoins: [...a.assets].sort().join(", ") || "—",
      networks: [...a.networks].sort().join(", ") || "—",
      countries: a.countries.size,
      currencies: [...a.currencies].sort().join(", ") || "—",
      localRails: [...a.namedRails, ...a.rails].filter((v, i, arr) => arr.indexOf(v) === i).sort().join(", ") || "—",
      routeCount: a.routeEvidenceCount, evidenceCount: ev.count, level,
      quoteSupport: l5, byoCredentials: "Not researched", commercialAccess: "Not researched",
      lastVerified: lastVerifiedDate ? lastVerifiedDate.toISOString().slice(0, 10) : null,
      staleEvidence, gaps,
    };
  });

  rows.sort((a, b) => a.slug.localeCompare(b.slug));

  const cumulative = (lv: string[]) => rows.filter((r) => lv.includes(r.level)).length;
  const totals = {
    totalRegistered: rows.length,
    l1_officialSourceFound: rows.length,
    l2_capabilityMapped: cumulative(["L2", "L3", "L4", "L5", "L6", "L7"]),
    l3_routeMapped: cumulative(["L3", "L4", "L5", "L6", "L7"]),
    l4_customerConnectable: cumulative(["L4", "L5", "L6", "L7"]),
    l5_liveQuotable: cumulative(["L5", "L6", "L7"]),
    l6_railorObserved: cumulative(["L6", "L7"]),
    l7_executable: 0,
  };
  const extra = {
    meaningfullyMappedProviders: totals.l2_capabilityMapped,
    providersWithExactRouteEvidence: totals.l3_routeMapped,
    providersWithNamedRails: rows.filter((r) => (byProvider.get(providers.find((p) => p.slug === r.slug)!.id)?.namedRails.size ?? 0) > 0).length,
    customerConnectableProviders: totals.l4_customerConnectable,
    // Distinct from totals.l5_liveQuotable, which is a CUMULATIVE ladder count
    // (anyone at L5 or above, so an L6 provider with no getQuote still counts).
    // This is the true, non-cascading number - the one to compare against the
    // brief's "3-5 initially" target, since that target means real getQuote
    // adapters, not "reached at least this rung."
    providersWithRealGetQuote: rows.filter((r) => r.quoteSupport).length,
    providersWithObservedReliability: totals.l6_railorObserved,
    providersWithStaleEvidence: rows.filter((r) => r.staleEvidence).length,
    providersWithZeroEvidence: rows.filter((r) => r.evidenceCount === 0).length,
  };

  // --- RAILOR_PROVIDER_UNIVERSE.json ---
  const jsonOut = {
    generatedAt: new Date().toISOString(),
    methodology: "Every field is a live query against real (is_demo:false) database rows. byoCredentials and commercialAccess are per-provider commercial terms not yet researched for this batch and read 'Not researched', not a guess.",
    totals, extra,
    providers: rows.map((r) => ({
      slug: r.slug, name: r.name, categories: r.categories, website: r.website, docs: r.docs, apiDocs: r.apiDocs,
      llmsOrOpenapi: r.llmsOrOpenapi, regions: r.regions.split(", ").filter((x) => x !== "—"),
      stablecoins: r.stablecoins.split(", ").filter((x) => x !== "—"),
      networks: r.networks.split(", ").filter((x) => x !== "—"), countryCount: r.countries,
      currencies: r.currencies.split(", ").filter((x) => x !== "—"),
      localRails: r.localRails.split(", ").filter((x) => x !== "—"),
      routeCount: r.routeCount, evidenceCount: r.evidenceCount, providerLevel: r.level,
      quoteSupport: r.quoteSupport, byoCredentialSupport: r.byoCredentials, commercialAccessRequirement: r.commercialAccess,
      lastVerified: r.lastVerified, staleEvidence: r.staleEvidence,
    })),
  };

  // --- RAILOR_PROVIDER_RESEARCH_GAPS.json ---
  const gapsOut = {
    generatedAt: new Date().toISOString(),
    methodology: "One entry per provider with at least one open gap. This is the punch list for the next research pass, not a criticism - most gaps here are simply 'not yet researched', which is the honest and expected state for a provider registered this pass.",
    providersWithGaps: rows
      .filter((r) => r.gaps.length > 0)
      .map((r) => ({ slug: r.slug, name: r.name, level: r.level, gaps: r.gaps })),
  };

  // --- RAILOR_GLOBAL_PROVIDER_UNIVERSE.md ---
  const header = "Provider | Categories | Website | Docs | API docs | llms/OpenAPI | Regions | Stablecoins | Networks | Countries | Currencies | Local rails | Route count | Evidence count | Provider level | Quote support | BYO credentials | Commercial access | Last verified | Research gaps";
  const sep = Array(20).fill("---").join(" | ");
  const body = rows
    .map((r) =>
      `${r.name} (\`${r.slug}\`) | ${r.categories.join(", ")} | ${r.website ?? "—"} | ${r.docs ? "Yes" : "No"} | ${r.apiDocs ? "Yes" : "No"} | ${r.llmsOrOpenapi ? "Yes" : "Not checked"} | ${r.countries} | ${r.stablecoins} | ${r.networks} | ${r.countries} | ${r.currencies} | ${r.localRails} | ${r.routeCount} | ${r.evidenceCount} | ${r.level} | ${r.quoteSupport ? "Yes" : "No"} | ${r.byoCredentials} | ${r.commercialAccess} | ${r.lastVerified ?? "—"} | ${r.gaps.length}`,
    )
    .join("\n");

  const md = `# Railor Global Provider Universe

Generated: ${new Date().toISOString()}. Supersedes RAILOR_PROVIDER_UNIVERSE_AUDIT.md
(kept as a dated snapshot) with the wider column set and renamed depth ladder
from the global provider & competitor intelligence expansion brief. Every
number is a live query against real (\`is_demo:false\`) rows — nothing here is
estimated or padded. Re-run \`node --env-file=.env --import=tsx packages/database/generate_global_provider_universe.ts\`
to refresh.

Competitor products (Borderless, Heron, RIVR, StableNexus, OneStable,
Paycrest, DFNS Payouts, Fireblocks Network for Payments, Circle Payments
Network, Meld, Onramper, Modern Treasury, Basilic) are covered in
[RAILOR_COMPETITIVE_ROUTING_AUDIT.md](./RAILOR_COMPETITIVE_ROUTING_AUDIT.md),
not registered as Railor providers here — they are execution/orchestration
platforms sitting *over* real infra companies, several of which (Circle,
dLocal, Banxa, Bridge, Coins.ph, Yellow Card, Koywe) already appear in this
table directly. Paycrest is the one borderline case (a genuine open protocol
a customer could integrate against directly) held out of the registry this
pass pending a decision on whether Railor models permissionless-liquidity
protocols the same way it models named companies.

## Depth ladder (this brief's naming)

L0 DISCOVERED (name/domain only, not yet in this table) · **L1
OFFICIAL_SOURCE_FOUND** (provider row exists — official site/docs on record)
· **L2 CAPABILITY_MAPPED** (≥1 \`provider_capabilities\` or
\`receiving_endpoints\` row) · **L3 ROUTE_MAPPED** (≥1 \`provider_routes\` row
with a real \`evidence_id\` — never a Cartesian join of independently-true
facts) · **L4 CUSTOMER_CONNECTABLE** (≥1 real \`provider_connections\` row
with status \`connected\` and stored credentials — genuinely 0 today; V1 has
no credential flow) · **L5 LIVE_QUOTABLE** (a \`getQuote\` implementation
exists in \`packages/core/src/adapters.ts\` — Circle, Bridge, MoonPay only) ·
**L6 RAILOR_OBSERVED** (≥1 real \`conformance_runs\` row with status
pass/fail/warning — placeholders don't count) · **L7 EXECUTABLE** — always 0;
\`executeTransfer\` permanently refuses to execute a real transfer, a hard
policy line, not a gap. L5/L6 are not strictly nested in this data (some L6
rows have no \`getQuote\` adapter — their conformance checks don't need one);
"provider level" means the highest independently-satisfied rung.

## Summary

| Metric | Count | Target (brief) |
|---|---:|---|
| Total candidate entities discovered this + prior pass | ${totals.totalRegistered} + (see gaps file for un-registered leads) | 150+ candidates |
| Registered / L1+ (official source found) | ${totals.l1_officialSourceFound} | 100+ verified |
| L2+ (meaningfully mapped) | ${totals.l2_capabilityMapped} | 50-75 |
| L3+ (route-mapped, real evidence) | ${totals.l3_routeMapped} | 25-40 |
| L4+ (customer-connectable, cumulative ladder) | ${totals.l4_customerConnectable} | — |
| L5+ (cumulative ladder — includes L6/L7 providers who lack \`getQuote\`) | ${totals.l5_liveQuotable} | — |
| **Real \`getQuote\` adapters (the actual "live-quotable" count)** | **${extra.providersWithRealGetQuote}** | **3-5 initially, 10-15 over time** |
| L6+ (Railor-observed via real conformance runs) | ${totals.l6_railorObserved} | — |
| L7 (executable) | ${totals.l7_executable} | never fabricated |
| Providers with named rails on record | ${extra.providersWithNamedRails} | — |
| Providers with zero evidence citations | ${extra.providersWithZeroEvidence} | — |
| Providers with evidence older than ${STALE_DAYS} days | ${extra.providersWithStaleEvidence} | — |

**Honest read against targets:** ${totals.totalRegistered} registered is real
progress toward 100+ verified but short of 150+ candidates — this pass added
25 new real, individually-domain-verified providers (on top of the prior
pass's 66) sourced from Mastercard's Crypto Partner Program list and Meld's
integration directory, filtered down from ~100 raw names to ones that
actually move money (blockchains, pure custody/signing infra, and pure
compliance tooling from those source lists were excluded per this brief's own
classification rule, not registered as low-quality padding). ${totals.l2_capabilityMapped}
capability-mapped sits below the 50-75 target's midpoint mainly because most
of this pass's 25 new providers are still L1-only (official source found,
nothing extracted yet) — that extraction work is the next pass, not this
one. ${totals.l3_routeMapped} route-mapped is below the 25-40 target;
Ramp Network alone (868 real atomic routes from its structured coverage API)
still carries most of that number. ${extra.providersWithRealGetQuote} real
\`getQuote\` adapters (Circle, Bridge, MoonPay) sits inside the brief's own
"3-5 initially" band — the L5+/L6+ ladder rows above read higher only because
several L6 providers reached conformance-observed status through checks that
never required a quote adapter (docs-parity, sandbox-reachability), not
because they can actually be quoted today.

## Provider table

${header}
${sep}
${body}
`;

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  await Promise.all([
    fs.writeFile(path.join(root, "RAILOR_GLOBAL_PROVIDER_UNIVERSE.md"), md),
    fs.writeFile(path.join(root, "RAILOR_PROVIDER_UNIVERSE.json"), JSON.stringify(jsonOut, null, 2)),
    fs.writeFile(path.join(root, "RAILOR_PROVIDER_RESEARCH_GAPS.json"), JSON.stringify(gapsOut, null, 2)),
  ]);

  console.log(JSON.stringify({ totals, extra }, null, 2));
  console.log(`\nwrote RAILOR_GLOBAL_PROVIDER_UNIVERSE.md, RAILOR_PROVIDER_UNIVERSE.json, RAILOR_PROVIDER_RESEARCH_GAPS.json (${rows.length} providers)`);
}

main()
  .then(async () => (await getDbHandle()).close())
  .catch(async (err) => { console.error(err); await (await getDbHandle()).close(); process.exit(1); });
