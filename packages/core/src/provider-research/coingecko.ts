/**
 * CoinGecko — free, keyless, no rate-limit auth required for the public API.
 *
 * Solves a specific gap: `catalog.ts` deliberately refuses to auto-add assets
 * and blockchains, because "which chain is this" from free text is genuinely
 * ambiguous (Base vs Base Sepolia, BSC vs BNB Chain) and a wrong row silently
 * corrupts routing. CoinGecko removes that ambiguity — it maintains a
 * canonical, per-asset map of real deployed contract addresses per chain, so
 * "does USDC really have a deployment on Cronos" becomes a lookup against a
 * structured registry instead of a guess about what a sentence meant.
 *
 * This module only ANSWERS "is this a real asset/chain, and what chains is it
 * really on" — it never invents a capability. Whether a *provider* actually
 * supports that asset still comes from the provider's own scraped page, same
 * as always; CoinGecko only resolves the asset/chain identity underneath it.
 */
const BASE_URL = "https://api.coingecko.com/api/v3";
const MIN_INTERVAL_MS = 2200; // public tier: ~30 req/min: unauthenticated

let nextSlotAt = 0;
async function throttle(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt);
  nextSlotAt = slot + MIN_INTERVAL_MS;
  const wait = slot - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function get(path: string): Promise<unknown> {
  await throttle();
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`CoinGecko ${path} -> HTTP ${response.status}`);
  return response.json();
}

export interface CoinGeckoAsset {
  id: string;
  symbol: string;
  name: string;
  /** chain slug (CoinGecko's `asset_platforms` id, e.g. "base") -> contract address */
  platforms: Record<string, string>;
}

const assetCache = new Map<string, CoinGeckoAsset | null>();

/**
 * Resolves a ticker (e.g. "USDC") to CoinGecko's canonical record via its
 * search endpoint, then fetches the full coin record for its platform map.
 * A ticker can be ambiguous across many low-cap tokens; the search result is
 * only trusted when the resolved symbol matches case-insensitively, so a
 * squatting shitcoin with the same ticker never gets picked over the real one
 * — market-cap ordering in the search response is used as the tiebreaker.
 */
export async function resolveAssetBySymbol(symbol: string): Promise<CoinGeckoAsset | null> {
  const key = symbol.trim().toUpperCase();
  if (assetCache.has(key)) return assetCache.get(key)!;

  try {
    const search = (await get(`/search?query=${encodeURIComponent(key)}`)) as {
      coins?: Array<{ id: string; symbol: string; name: string; market_cap_rank: number | null }>;
    };
    const candidates = (search.coins ?? []).filter((c) => c.symbol.toUpperCase() === key);
    if (candidates.length === 0) {
      assetCache.set(key, null);
      return null;
    }
    candidates.sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity));
    const best = candidates[0]!;

    const coin = (await get(`/coins/${best.id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`)) as {
      id: string;
      symbol: string;
      name: string;
      platforms?: Record<string, string>;
    };
    const resolved: CoinGeckoAsset = {
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      platforms: coin.platforms ?? {},
    };
    assetCache.set(key, resolved);
    return resolved;
  } catch {
    // Network hiccup or an unrecognized ticker — treated the same as "not
    // found": the caller falls back to reporting it unknown, never guesses.
    assetCache.set(key, null);
    return null;
  }
}

export interface CoinGeckoPlatform {
  /** CoinGecko's platform id, e.g. "binance-smart-chain" — NOT the same slug vocabulary as Railor's blockchains table. */
  id: string;
  name: string;
  chainIdentifier: number | null;
}

let platformCache: CoinGeckoPlatform[] | null = null;

/** The full chain registry, fetched once per process — used to resolve a free-text chain name to CoinGecko's canonical id/name. */
export async function listPlatforms(): Promise<CoinGeckoPlatform[]> {
  if (platformCache) return platformCache;
  const rows = (await get("/asset_platforms")) as Array<{ id: string; name: string; chain_identifier: number | null }>;
  platformCache = rows.map((r) => ({ id: r.id, name: r.name, chainIdentifier: r.chain_identifier }));
  return platformCache;
}

const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Matches a free-text chain name (as written on a provider's page, e.g. "BNB
 * Chain" or "X Layer") against CoinGecko's real platform registry. Returns
 * null rather than a fuzzy best-guess when nothing matches exactly.
 */
export async function resolvePlatformByName(name: string): Promise<CoinGeckoPlatform | null> {
  const platforms = await listPlatforms();
  const target = normalize(name);
  return platforms.find((p) => normalize(p.id) === target || normalize(p.name) === target) ?? null;
}
