/**
 * Phase 0 proof: Railor's first real `provider_routes` rows, sourced entirely
 * from Ramp Network's public, keyless host-api v3 — no credentials needed,
 * no doc-page scraping, no cross-provider joins.
 *
 * Two live API calls, joined by the one dimension Ramp's own off-ramp
 * product uses to connect them:
 *   GET /host-api/v3/offramp/assets?currencyCode=X  -> which asset+network
 *     pairs Ramp will convert into currency X, with real min/max amounts.
 *   GET /host-api/v3/payout-methods                  -> which named payout
 *     method disburses currency X in which countries.
 * This is NOT the forbidden "provider supports France" + "provider supports
 * USDC" join — both endpoints are scoped by the *same* settlement currency,
 * which is exactly the mechanism Ramp's own off-ramp product uses internally
 * (convert crypto -> currency, then pay that currency out locally). The
 * note on every row says so explicitly, so nobody downstream mistakes this
 * for a single-sentence citation.
 *
 * Deliberately excludes:
 *   - CARD payouts (119 countries) — a card refund isn't what "local bank
 *     rail" means for the B2B stablecoin-payout use case this whole project
 *     is for; including it would ~10x the row count without answering a
 *     real question.
 *   - Bridged/wrapped variants (USDC.e, USDT0) — Railor's asset catalog
 *     doesn't distinguish them from native USDC/USDT, and silently treating
 *     a bridged token as identical to the native one is exactly the kind of
 *     imprecision this project exists to avoid.
 *   - BRL/MXN payout methods (PIX/SPEI) — Ramp's own /currencies endpoint
 *     reports both as offramp-unavailable; PIX/SPEI exist there only for
 *     on-ramp (paying in), not payout.
 *
 * Idempotent: existing (provider, product, asset, network, country,
 * currency, paymentMethod) tuples are loaded once and skipped.
 *
 *   pnpm --filter @railor/database ramp-network-route-import
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const RAMP_BASE = "https://api.rampnetwork.com/api/host-api/v3";
const now = () => new Date();
const hash = (v: string) => createHash("sha256").update(v).digest("hex");

const CHAIN_MAP: Record<string, string> = {
  ETH: "ethereum", MATIC: "polygon", BASE: "base", SOLANA: "solana", AVAX: "avalanche",
  ARBITRUM: "arbitrum", OPTIMISM: "optimism", CELO: "celo", BSC: "bnb-chain", TRON: "tron",
  NEAR: "near", LINEA: "linea", ZKSYNCERA: "zksync", MONAD: "monad", WORLDCHAIN: "world-chain", TON: "ton", XLM: "stellar",
};

/** Ramp's own generic term for its USD ACH-style domestic bank payout. */
const PAYOUT_METHOD_MAP: Record<string, { paymentMethod: (typeof s.paymentMethodEnum.enumValues)[number] }> = {
  SEPA: { paymentMethod: "sepa" },
  AMERICAN_BANK_TRANSFER: { paymentMethod: "ach" },
};

interface RampAsset {
  symbol: string;
  name: string;
  chain: string;
  type: string;
  enabled: boolean;
  minPurchaseAmount: number;
  maxPurchaseAmount: number;
}
interface RampOfframpAssetsResponse {
  assets: RampAsset[];
  currencyCode: string;
}
interface RampPayoutMethod {
  name: string;
  currencies: string[];
  countries: string[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Ramp ${url} -> HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function runRampRouteImport() {
  const db = await getDb();

  const [providerRow] = await db.select({ id: s.providers.id }).from(s.providers).where(eq(s.providers.slug, "ramp-network")).limit(1);
  if (!providerRow) throw new Error("ramp-network provider must already exist");
  const providerId = providerRow.id;

  const currenciesToCheck = ["USD", "EUR", "GBP"];
  const [payoutMethods, ...assetResponses] = await Promise.all([
    fetchJson<RampPayoutMethod[]>(`${RAMP_BASE}/payout-methods`),
    ...currenciesToCheck.map((c) => fetchJson<RampOfframpAssetsResponse>(`${RAMP_BASE}/offramp/assets?currencyCode=${c}`)),
  ]);
  const assetsByCurrency = new Map(currenciesToCheck.map((c, i) => [c, assetResponses[i]!]));

  const relevantMethods = payoutMethods.filter((m) => m.name in PAYOUT_METHOD_MAP && m.currencies.some((c) => currenciesToCheck.includes(c)));

  // One evidence row per currency, citing the exact endpoints and a real excerpt.
  const evidenceByCurrency = new Map<string, string>();
  for (const currency of currenciesToCheck) {
    const assetsUrl = `${RAMP_BASE}/offramp/assets?currencyCode=${currency}`;
    const methodsForThisCurrency = payoutMethods.filter((m) => m.currencies.includes(currency) && m.name in PAYOUT_METHOD_MAP);
    if (!methodsForThisCurrency.length) continue;
    const excerpt = `Live Ramp Network host-api v3 responses, retrieved this session. GET ${assetsUrl} returned ${assetsByCurrency.get(currency)!.assets.filter((a) => a.enabled).length} enabled asset/network entries scoped to currencyCode=${currency} (real min/max amounts included). GET ${RAMP_BASE}/payout-methods returned ${JSON.stringify(methodsForThisCurrency.map((m) => ({ name: m.name, countries: m.countries.length })))} for this currency. Both calls are scoped by the same settlement currency, which is how Ramp's own off-ramp product connects a crypto asset to a local payout method — not a cross-provider inference.`;
    const rawHash = hash(assetsUrl + excerpt);
    const [existing] = await db.select({ id: s.evidence.id }).from(s.evidence).where(eq(s.evidence.rawHash, rawHash)).limit(1);
    if (existing) {
      evidenceByCurrency.set(currency, existing.id);
      continue;
    }
    const [doc] = await db.insert(s.sourceDocuments).values({ providerId, url: assetsUrl, title: `Ramp Network host-api v3 — offramp assets (${currency})`, sourceType: "api", crawlFrequencyHours: 24, parser: "api_reference", lastCheckedAt: now() }).onConflictDoNothing({ target: [s.sourceDocuments.providerId, s.sourceDocuments.url] }).returning({ id: s.sourceDocuments.id });
    const docId = doc?.id ?? (await db.select({ id: s.sourceDocuments.id }).from(s.sourceDocuments).where(eq(s.sourceDocuments.url, assetsUrl)).limit(1))[0]!.id;
    const [ev] = await db.insert(s.evidence).values({
      providerId, sourceDocumentId: docId, sourceUrl: assetsUrl, sourceTitle: `Ramp Network host-api v3 — offramp assets + payout methods (${currency})`,
      sourceType: "api", verificationType: "provider_reported", retrievedAt: now(), lastVerifiedAt: now(), confidence: "0.95", rawExcerpt: excerpt, rawHash,
    }).returning({ id: s.evidence.id });
    evidenceByCurrency.set(currency, ev!.id);
  }

  const existingRoutes = await db.select().from(s.providerRoutes).where(eq(s.providerRoutes.providerId, providerId));
  const existingKeys = new Set(existingRoutes.map((r) => [r.product, r.sourceAsset, r.sourceNetwork, r.destinationCountry, r.destinationCurrency, r.paymentMethod].join("|")));
  const knownCountries = new Set((await db.select({ code: s.countries.code }).from(s.countries)).map((c) => c.code));

  const toInsert: (typeof s.providerRoutes.$inferInsert)[] = [];
  let skippedNoChainMap = 0;
  const skippedUnknownCountries = new Set<string>();

  for (const method of relevantMethods) {
    const mapped = PAYOUT_METHOD_MAP[method.name]!;
    for (const currency of method.currencies) {
      if (!currenciesToCheck.includes(currency)) continue;
      const evidenceId = evidenceByCurrency.get(currency);
      if (!evidenceId) continue;
      const assetsForCurrency = assetsByCurrency.get(currency)!.assets.filter((a) => a.enabled && (a.symbol === "USDC" || a.symbol === "USDT"));

      for (const asset of assetsForCurrency) {
        const railorChain = CHAIN_MAP[asset.chain];
        if (!railorChain) {
          skippedNoChainMap++;
          continue;
        }
        for (const countryLower of method.countries) {
          const country = countryLower.toUpperCase();
          if (!knownCountries.has(country)) {
            skippedUnknownCountries.add(country);
            continue;
          }
          const key = ["off_ramp", asset.symbol, railorChain, country, currency, mapped.paymentMethod].join("|");
          if (existingKeys.has(key)) continue;
          existingKeys.add(key);

          toInsert.push({
            providerId,
            product: "off_ramp",
            customerType: "business",
            sourceAsset: asset.symbol,
            sourceNetwork: railorChain,
            destinationCountry: country,
            destinationCurrency: currency,
            destinationEndpointType: "bank_account",
            paymentMethod: mapped.paymentMethod,
            minAmount: asset.minPurchaseAmount.toFixed(8),
            maxAmount: asset.maxPurchaseAmount.toFixed(8),
            amountCurrency: currency,
            availability: "supported",
            note: `Live Ramp Network host-api v3: ${asset.symbol} on ${asset.chain} off-ramps to ${currency} (min ${asset.minPurchaseAmount} / max ${asset.maxPurchaseAmount} ${currency}); ${currency} disburses to ${country} via ${method.name}. Two real API calls joined by the shared settlement currency — see evidence excerpt for the exact mechanism.`,
            evidenceId,
            lastVerifiedAt: now(),
          });
        }
      }
    }
  }

  if (toInsert.length) {
    // Postgres parameter limit safety: chunk large batches.
    for (let i = 0; i < toInsert.length; i += 500) {
      await db.insert(s.providerRoutes).values(toInsert.slice(i, i + 500));
    }
  }

  return {
    routesCreated: toInsert.length,
    routesSkippedAlreadyExisting: existingRoutes.length,
    skippedNoChainMap,
    skippedUnknownCountries: [...skippedUnknownCountries].sort(),
    currenciesProcessed: currenciesToCheck,
    payoutMethodsUsed: relevantMethods.map((m) => m.name),
  };
}

async function main() {
  const { close } = await getDbHandle();
  try {
    console.log(JSON.stringify(await runRampRouteImport(), null, 2));
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
