import { wisePublicQuote } from "./payments/adapters/wise.js";
import type { UnifiedQuote } from "./unified.js";

/**
 * Price check: "send X of A, how much B arrives, through whom?" Every number
 * carries where it came from, because they are not equally strong:
 *
 *   exact            a live quote from the customer's own connected account
 *   live_public      a live quote anyone gets (Wise's public quote API)
 *   published        the provider's published price schedule, applied here
 *                    at a reference rate (read from the source URL on `observedAt`)
 *   market_estimate  prices Wise collects from other providers' public sites
 *                    (its comparison feed) — consumer pricing, dated
 *
 * Rows are ranked by what the recipient gets; a row whose cost is incomplete
 * (e.g. an FX quote without the transfer fee) is never ranked against
 * complete ones.
 */

export type PriceBasis = "exact" | "live_public" | "published" | "market_estimate";

export interface PriceCheckInput {
  sourceCurrency: string;
  destinationCurrency: string;
  destinationCountry?: string;
  amount: number;
  includeMarket?: boolean;
}

export interface PriceRow {
  providerSlug: string;
  providerName: string;
  /** Logo for providers Railor doesn't have a record of (market feed); otherwise resolved by slug. */
  logoUrl?: string;
  basis: PriceBasis;
  recipientAmount: number | null;
  feeAmount: number | null;
  feeCurrency: string | null;
  rate: number | null;
  /** 1 − recipient ÷ (amount × reference rate): everything the route costs, fee and FX together. */
  totalCostPct: number | null;
  /** Complete rows can be ranked; partial ones are missing a cost component. */
  partial: boolean;
  delivery: string | null;
  observedAt: string;
  expiresAt?: string;
  source: { label: string; url?: string };
  notes: string[];
  /**
   * Filled after ranking: how much less arrives than through the best complete
   * price a business can act on (exact, live public or published). Negative
   * for a market estimate that beats it.
   */
  shortfall?: number | null;
}

export interface PriceUnavailable {
  providerSlug: string;
  providerName: string;
  reason: string;
  /** The customer could get an exact price by connecting this provider. */
  connectable?: boolean;
}

export interface PriceCheckResult {
  input: PriceCheckInput;
  reference: { rate: number; source: string; observedAt: string } | null;
  rows: PriceRow[];
  unavailable: PriceUnavailable[];
  generatedAt: string;
}

export interface PriceCheckDeps {
  /** Live quotes from the organization's connected accounts (credentials stay in the web app). */
  connectedQuotes?: (input: PriceCheckInput) => Promise<Array<{ providerSlug: string; providerName: string; quote?: UnifiedQuote; error?: string }>>;
  /** Providers the customer could connect for an exact price, with whether they're connected already. */
  connectable?: Array<{ slug: string; name: string; connected: boolean }>;
  fetcher?: typeof fetch;
  now?: Date;
}

interface PublishedSchedule {
  slug: string;
  name: string;
  sourceUrl: string;
  observedAt: string;
  /** Null when the schedule applies; otherwise why it doesn't. */
  appliesTo(input: PriceCheckInput): string | null;
  /** Fee in USD or in the source currency, as the provider publishes it. */
  fee(input: PriceCheckInput, amountUsd: number | null): { amount: number; currency: string; parts: string[] } | null;
  notes: string[];
}

const intoIndia = (input: PriceCheckInput) =>
  input.destinationCurrency.toUpperCase() === "INR" && input.sourceCurrency.toUpperCase() !== "INR"
    ? null
    : "Published pricing covers money arriving in India (INR) only.";

/** Read from each provider's own site on `observedAt`. Re-check before relying on them. */
export const PUBLISHED_PRICING: PublishedSchedule[] = [
  {
    slug: "payzoll",
    name: "PayZoll",
    sourceUrl: "https://payzoll.finance/",
    observedAt: "2026-09-27",
    appliesTo: intoIndia,
    fee: (input) => ({ amount: round(input.amount * 0.01), currency: input.sourceCurrency.toUpperCase(), parts: ["1% per transfer"] }),
    notes: ["Publishes “1% per transfer, no hidden FX markups”.", "No public API yet — sign up on PayZoll to use it."],
  },
  {
    slug: "skydo",
    name: "Skydo",
    sourceUrl: "https://www.skydo.com/",
    observedAt: "2026-09-27",
    appliesTo: intoIndia,
    fee: (_input, amountUsd) => {
      if (amountUsd === null) return null;
      const base = amountUsd <= 2_000 ? 19 : amountUsd <= 10_000 ? 29 : round(amountUsd * 0.003);
      const slab = amountUsd <= 2_000 ? "$19 up to USD 2,000" : amountUsd <= 10_000 ? "$29 for USD 2,001–10,000" : "0.3% above USD 10,000";
      return { amount: round(base * 1.18), currency: "USD", parts: [slab, "+18% GST on the fee"] };
    },
    notes: ["For Indian businesses receiving from abroad (exports), with FIRA.", "Publishes zero FX margin; above USD 100K/month pricing is negotiated."],
  },
];

// Public quotes are the same for everyone for a few seconds: share them, so a
// page polling every 20s (or many viewers of the same pair) costs Wise one call.
const publicCache = new Map<string, { at: number; value: Promise<unknown> }>();
function shared<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = publicCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  publicCache.set(key, { at: Date.now(), value });
  value.catch(() => publicCache.delete(key));
  if (publicCache.size > 500) publicCache.delete(publicCache.keys().next().value!);
  return value;
}

function round(n: number, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

interface ComparisonProvider {
  alias?: string;
  name?: string;
  type?: string;
  logos?: { normal?: { svgUrl?: string | null; pngUrl?: string | null }; circle?: { svgUrl?: string | null } };
  quotes?: Array<{ rate?: number; fee?: number; receivedAmount?: number; dateCollected?: string }>;
}

async function marketEstimates(input: PriceCheckInput, fetcher: typeof fetch): Promise<PriceRow[]> {
  const params = new URLSearchParams({ sourceCurrency: input.sourceCurrency.toUpperCase(), targetCurrency: input.destinationCurrency.toUpperCase(), sendAmount: String(input.amount) });
  const response = await fetcher(`https://api.wise.com/v4/comparisons/?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return [];
  const body = (await response.json()) as { providers?: ComparisonProvider[] };
  return (body.providers ?? [])
    .filter((p) => p.alias && p.alias !== "wise" && p.quotes?.[0]?.receivedAmount)
    .map((p) => {
      const q = p.quotes![0]!;
      // The square "mark" variant reads at icon size; the normal logo is a wide wordmark.
      const logo = p.logos?.circle?.svgUrl ?? p.logos?.normal?.svgUrl ?? p.logos?.normal?.pngUrl ?? undefined;
      return {
        providerSlug: `market:${p.alias}`,
        providerName: p.name ?? p.alias!,
        logoUrl: logo ?? undefined,
        basis: "market_estimate" as const,
        recipientAmount: q.receivedAmount ?? null,
        feeAmount: q.fee ?? null,
        feeCurrency: input.sourceCurrency.toUpperCase(),
        rate: q.rate ?? null,
        totalCostPct: null,
        partial: false,
        delivery: null,
        observedAt: q.dateCollected ?? new Date().toISOString(),
        source: { label: "Wise comparison feed", url: "https://wise.com/gb/compare/" },
        notes: [
          `Collected by Wise from ${p.name ?? p.alias}'s public pricing${q.dateCollected ? ` on ${q.dateCollected.slice(0, 10)}` : ""}.`,
          p.type === "bank" ? "Bank rate for consumers; business pricing may differ." : "Consumer pricing; business pricing may differ.",
        ],
      };
    });
}

function fromQuote(q: UnifiedQuote, name: string, basis: PriceBasis, extra: { delivery?: string | null; notes?: string[]; source: PriceRow["source"] }): PriceRow {
  return {
    providerSlug: q.providerSlug,
    providerName: name,
    basis,
    recipientAmount: q.recipientAmount ?? null,
    feeAmount: q.feeAmount ?? null,
    feeCurrency: q.feeCurrency ?? null,
    rate: q.exchangeRate ? Number(q.exchangeRate) : null,
    totalCostPct: null,
    partial: q.costPartial,
    delivery: extra.delivery ?? (q.estimatedArrivalMinutes !== undefined ? arrival(q.estimatedArrivalMinutes) : null),
    observedAt: q.observedAt,
    expiresAt: q.expiresAt,
    source: extra.source,
    notes: [...(q.costPartial ? ["Excludes the transfer fee — the provider's quote covers FX only."] : []), ...(extra.notes ?? [])],
  };
}

function arrival(minutes: number) {
  if (minutes < 5) return "in seconds";
  if (minutes < 120) return `in ~${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `in ~${Math.round(minutes / 60)} h`;
  return `in ~${Math.round(minutes / 1440)} days`;
}

export async function comparePrices(rawInput: PriceCheckInput, deps: PriceCheckDeps = {}): Promise<PriceCheckResult> {
  const input: PriceCheckInput = {
    ...rawInput,
    sourceCurrency: rawInput.sourceCurrency.trim().toUpperCase(),
    destinationCurrency: rawInput.destinationCurrency.trim().toUpperCase(),
    destinationCountry: rawInput.destinationCountry?.trim().toUpperCase() || undefined,
  };
  if (!(input.amount > 0) || !/^[A-Z]{3}$/.test(input.sourceCurrency) || !/^[A-Z]{3}$/.test(input.destinationCurrency)) {
    throw new Error("Pick two currencies and an amount above zero.");
  }
  const fetcher = deps.fetcher ?? fetch;
  const now = deps.now ?? new Date();
  const rows: PriceRow[] = [];
  const unavailable: PriceUnavailable[] = [];
  const quoteRequest = { sourceAsset: input.sourceCurrency, destinationCurrency: input.destinationCurrency, destinationCountry: input.destinationCountry, amount: input.amount };

  // Injected fetchers (tests) bypass the shared cache.
  const cache = <T>(key: string, ttlMs: number, load: () => Promise<T>) => (deps.fetcher ? load() : shared(key, ttlMs, load));
  const pair = `${input.sourceCurrency}:${input.destinationCurrency}:${input.amount}`;
  const [connected, wisePublic, market, usdRate] = await Promise.all([
    deps.connectedQuotes ? deps.connectedQuotes(input).catch(() => []) : Promise.resolve([]),
    cache(`wise:${pair}`, 15_000, () => wisePublicQuote(quoteRequest, fetcher)).catch((error: Error) => error),
    input.includeMarket ? cache(`market:${pair}`, 60_000, () => marketEstimates(input, fetcher)).catch(() => []) : Promise.resolve([]),
    input.sourceCurrency === "USD"
      ? Promise.resolve(1)
      : cache(`usd:${input.sourceCurrency}`, 60_000, () => wisePublicQuote({ sourceAsset: input.sourceCurrency, destinationCurrency: "USD", amount: input.amount }, fetcher))
          .then((q) => Number(q.exchangeRate))
          .catch(() => null),
  ]);

  for (const c of connected) {
    if (c.quote) rows.push(fromQuote(c.quote, c.providerName, "exact", { source: { label: "Your connected account" } }));
    else unavailable.push({ providerSlug: c.providerSlug, providerName: c.providerName, reason: c.error ?? "The connected account returned no quote." });
  }
  const connectedSlugs = new Set(connected.filter((c) => c.quote).map((c) => c.providerSlug));

  let reference: PriceCheckResult["reference"] = null;
  if (!(wisePublic instanceof Error)) {
    const rate = Number(wisePublic.exchangeRate);
    if (Number.isFinite(rate) && rate > 0) reference = { rate, source: "Wise's public rate (Wise quotes the mid-market rate)", observedAt: wisePublic.observedAt };
    if (!connectedSlugs.has("wise")) {
      rows.push(
        fromQuote(wisePublic, "Wise", "live_public", {
          delivery: wisePublic.deliveryLabel ?? null,
          source: { label: "Wise public quote", url: "https://wise.com/" },
          notes: [`Paying ${wisePublic.payInLabel}. Your own account's price can be lower — connect Wise to see it.`],
        }),
      );
    }
  } else {
    unavailable.push({ providerSlug: "wise", providerName: "Wise", reason: `No public quote: ${wisePublic.message}` });
  }

  const amountUsd = usdRate ? input.amount * usdRate : null;
  for (const schedule of PUBLISHED_PRICING) {
    const reason = schedule.appliesTo(input);
    if (reason) continue;
    const fee = schedule.fee(input, amountUsd);
    if (!fee) {
      unavailable.push({ providerSlug: schedule.slug, providerName: schedule.name, reason: "Its fee slabs are in USD and no USD reference rate was available." });
      continue;
    }
    const feeInSource = fee.currency === input.sourceCurrency ? fee.amount : usdRate ? fee.amount / usdRate : null;
    const recipient = reference && feeInSource !== null ? round((input.amount - feeInSource) * reference.rate) : null;
    rows.push({
      providerSlug: schedule.slug,
      providerName: schedule.name,
      basis: "published",
      recipientAmount: recipient,
      feeAmount: fee.amount,
      feeCurrency: fee.currency,
      rate: reference?.rate ?? null,
      totalCostPct: null,
      partial: false,
      delivery: null,
      observedAt: new Date(`${schedule.observedAt}T00:00:00Z`).toISOString(),
      source: { label: `${schedule.name} pricing page`, url: schedule.sourceUrl },
      notes: [`Fee: ${fee.parts.join(", ")}.`, reference ? "Converted at the reference rate — published as no FX markup." : "No reference rate, so the amount received can't be computed.", ...schedule.notes],
    });
  }

  rows.push(...market);

  for (const provider of deps.connectable ?? []) {
    if (provider.connected || rows.some((r) => r.providerSlug === provider.slug)) continue;
    // Already listed (e.g. Wise's public quote failed for this pair): one entry, now also connectable.
    const listed = unavailable.find((u) => u.providerSlug === provider.slug);
    if (listed) {
      listed.connectable = true;
      continue;
    }
    unavailable.push({ providerSlug: provider.slug, providerName: provider.name, reason: "Prices are per account and not public — connect it to see your exact price.", connectable: true });
  }

  // Rank: prices a business can act on before market estimates; within each,
  // complete rows by what arrives, then partial rows, then rows with no amount.
  const expected = reference ? input.amount * reference.rate : null;
  for (const row of rows) {
    if (row.recipientAmount !== null && expected) row.totalCostPct = round((1 - row.recipientAmount / expected) * 100, 2);
  }
  const tier = (r: PriceRow) => (r.recipientAmount === null ? 2 : r.partial ? 1 : 0);
  const group = (r: PriceRow) => (r.basis === "market_estimate" ? 1 : 0);
  rows.sort((a, b) => group(a) - group(b) || tier(a) - tier(b) || (b.recipientAmount ?? 0) - (a.recipientAmount ?? 0) || basisOrder(a.basis) - basisOrder(b.basis));
  // Dated consumer estimates are context, never "the best price".
  const best = rows.find((r) => tier(r) === 0 && group(r) === 0) ?? rows.find((r) => tier(r) === 0);
  for (const row of rows) row.shortfall = best && tier(row) === 0 ? round(best.recipientAmount! - row.recipientAmount!) : null;

  return { input, reference, rows, unavailable, generatedAt: now.toISOString() };
}

function basisOrder(b: PriceBasis) {
  return { exact: 0, live_public: 1, published: 2, market_estimate: 3 }[b];
}

/** Pairs shown on the live FX ticker. */
export const TICKER_PAIRS: Array<[string, string]> = [
  ["USD", "INR"], ["USD", "EUR"], ["GBP", "INR"], ["USD", "AED"], ["EUR", "INR"], ["USD", "GBP"],
  ["USD", "SGD"], ["AED", "INR"], ["USD", "MXN"], ["USD", "BRL"], ["USD", "PHP"], ["EUR", "GBP"],
];

export interface TickerRate {
  from: string;
  to: string;
  rate: number;
  observedAt: string;
}

/** Mid-market rates for the ticker (Wise's public rate), shared for 60s across every viewer. */
export async function fxTicker(pairs: Array<[string, string]> = TICKER_PAIRS): Promise<TickerRate[]> {
  const settled = await Promise.allSettled(
    pairs.map(([from, to]) =>
      shared(`ticker:${from}:${to}`, 60_000, async () => {
        const q = await wisePublicQuote({ sourceAsset: from, destinationCurrency: to, amount: 1000 });
        return { from, to, rate: Number(q.exchangeRate), observedAt: q.observedAt };
      }),
    ),
  );
  return settled.flatMap((r) => (r.status === "fulfilled" && Number.isFinite(r.value.rate) && r.value.rate > 0 ? [r.value] : []));
}
