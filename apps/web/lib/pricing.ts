import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { PAYOUT_ADAPTERS, comparePrices, getAdapter, CustomerContext, type PriceCheckInput } from "@railor/core";
import { getDb, providerConnections, providers } from "@railor/database";
import { getConnectionCredentials } from "./connections";
import { getIntentOptions } from "./reference";
import { getPlatformQuoteCheck } from "./platform-pricing";
import { providerMarketCoverage } from "./provider-market";

/** Fiat payout networks whose connected accounts return the customer's own price. */
const ACCOUNT_PRICED = [
  { slug: "wise", name: "Wise" },
  { slug: "airwallex", name: "Airwallex" },
];

/**
 * Price check for a workspace: its own connected accounts first (production
 * connections only — sandbox prices aren't real), then public and published
 * prices. Credentials are decrypted here and never leave the server.
 */
export async function runPriceCheck(organizationId: string | null, input: PriceCheckInput) {
  const db = await getDb();
  const rows = await db.select({ id: providers.id, slug: providers.slug, name: providers.name }).from(providers).where(inArray(providers.slug, ACCOUNT_PRICED.map((p) => p.slug)));
  const connected = new Map<string, Record<string, string>>();
  const sandboxOnly = new Set<string>();
  if (organizationId && input.context?.direction !== "receive") {
    for (const row of rows) {
      const credentials = await getConnectionCredentials(organizationId, row.id);
      if (!credentials) continue;
      if (credentials.environment === "production") connected.set(row.slug, credentials);
      else sandboxOnly.add(row.slug);
    }
  }
  const nameOf = (slug: string) => rows.find((r) => r.slug === slug)?.name ?? ACCOUNT_PRICED.find((p) => p.slug === slug)?.name ?? slug;

  const result = await comparePrices(input, {
    platformQuotes: async (req) => {
      const check = await getPlatformQuoteCheck({ sourceAsset: req.sourceCurrency, destinationCurrency: req.destinationCurrency, destinationCountry: req.destinationCountry, amount: req.amount });
      return check ? [check] : [];
    },
    connectable: ACCOUNT_PRICED.map((p) => ({ slug: p.slug, name: nameOf(p.slug), connected: connected.has(p.slug) })),
    connectedQuotes: async (req) =>
      Promise.all(
        [...connected].map(async ([slug, credentials]) => {
          const adapter = getAdapter(slug);
          try {
            const quote = await adapter!.getQuote!(credentials, { sourceAsset: req.sourceCurrency, destinationCurrency: req.destinationCurrency, destinationCountry: req.destinationCountry, amount: req.amount });
            return { providerSlug: slug, providerName: nameOf(slug), quote };
          } catch (error) {
            return { providerSlug: slug, providerName: nameOf(slug), error: "The connected account could not return a quote. Check its currency access and permissions." };
          }
        }),
      ),
  });
  for (const slug of sandboxOnly) {
    if (!connected.has(slug)) {
      const entry = result.unavailable.find((u) => u.providerSlug === slug);
      if (entry) entry.reason = "Only a sandbox connection — sandbox prices aren't real. Connect production to see your price.";
    }
  }
  for (const check of result.platformQuotes ?? []) {
    const entry = result.unavailable.find(u => u.providerSlug === check.providerSlug);
    if (entry && check.status === "quoted") entry.reason = "Railor's backend FX observation is shown separately below. Connecting your own account is optional, for account-specific pricing.";
  }
  result.marketCoverage = providerMarketCoverage(input);
  return result;
}

/** Providers this workspace can send real money through right now (production connections). */
export async function productionConnectedSlugs(organizationId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ slug: providers.slug })
    .from(providerConnections)
    .innerJoin(providers, eq(providers.id, providerConnections.providerId))
    .where(and(eq(providerConnections.organizationId, organizationId), eq(providerConnections.status, "connected"), eq(providerConnections.environment, "production")));
  return [...new Set(rows.map((r) => r.slug))];
}

const STABLECOINS = new Set(["USDC", "USDT", "EURC", "PYUSD", "DAI", "USDP", "FDUSD", "USDE", "RLUSD"]);

/**
 * Everything a price page renders first: fiat currency options, the pair
 * from the URL (or a sensible default for the workspace's country), and a
 * server-side first quote so the card never opens empty.
 */
export async function loadPricePage(params: Record<string, string | undefined>, organizationId: string | null, entityCountry?: string | null) {
  const options = await getIntentOptions();
  const currencies = options.currencies.filter((c) => /^[A-Z]{3}$/.test(c.value) && !STABLECOINS.has(c.value));
  const known = new Set(currencies.map((c) => c.value));
  const pick = (v: string | undefined, fallback: string) => (v && known.has(v.toUpperCase()) ? v.toUpperCase() : fallback);
  const entity = entityCountry ?? "";
  const home = options.currencyByCountry[entity];
  const from = pick(params.from, "USD");
  const to = pick(params.to, !entity || entity === "IN" ? "INR" : home && home !== "USD" ? home : "EUR");
  const amount = Math.min(10_000_000, Math.max(1, Number(params.amount) || 1_000));
  // Show the broad comparison set on first load for every visitor. It remains
  // optional because Wise's consumer estimates are context, not executable
  // business quotes.
  const market = params.market === undefined ? true : params.market === "1";
  const context = readCustomerContext((key) => params[key], {
    profile: "business", country: entity || "IN", direction: (!entity || entity === "IN") && to === "INR" ? "receive" : "send", purpose: "services",
  });
  let result: Awaited<ReturnType<typeof runPriceCheck>> | null = null;
  let error: string | undefined;
  if (from === to) error = "Pick two different currencies.";
  else {
    try {
      result = await runPriceCheck(organizationId, { sourceCurrency: from, destinationCurrency: to, amount, includeMarket: market, context });
    } catch (e) {
      error = e instanceof Error ? e.message : "Price check failed.";
    }
  }
  return { currencies, initial: { from, to, amount, market, context }, result, error, executable: Object.keys(PAYOUT_ADAPTERS) };
}

/** Query string → price-check input, clamped; null when unusable. */
export function parsePriceQuery(params: URLSearchParams | Record<string, string | undefined>) {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]) ?? undefined;
  const from = get("from")?.trim().toUpperCase();
  const to = get("to")?.trim().toUpperCase();
  const amount = Number(get("amount"));
  if (!from || !to || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to || !(amount > 0)) return null;
  const hasContext = ["profile", "country", "direction", "purpose"].some((key) => get(key) !== undefined);
  const parsed = CustomerContext.safeParse({ profile: get("profile"), country: get("country"), direction: get("direction"), purpose: get("purpose") });
  if (hasContext && !parsed.success) return null;
  return { sourceCurrency: from, destinationCurrency: to, amount: Math.min(10_000_000, amount), includeMarket: get("market") === "1", ...(hasContext && parsed.success ? { context: parsed.data } : {}) };
}

function readCustomerContext(get: (key: string) => string | undefined, fallback: CustomerContext): CustomerContext {
  const parsed = CustomerContext.safeParse({ profile: get("profile") ?? fallback.profile, country: get("country")?.toUpperCase() ?? fallback.country, direction: get("direction") ?? fallback.direction, purpose: get("purpose") ?? fallback.purpose });
  return parsed.success ? parsed.data : fallback;
}
