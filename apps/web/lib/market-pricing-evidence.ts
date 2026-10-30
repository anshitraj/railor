import type { MarketCoverage, MarketCoverageProvider, PriceRow, PriceUnavailable } from "@railor/core";

export interface CapturedFee {
  providerSlug: string;
  summary: string;
  product: string;
  destinationCurrency: string | null;
  sourceUrl: string | null;
  observedAt: string | null;
}

function sourceLink(value: string | null) {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

/** A fee statement can explain a gap, but never creates a numeric quote. */
export function attachMarketPricingEvidence(coverage: MarketCoverage, currency: string, rows: PriceRow[], unavailable: PriceUnavailable[], captured: CapturedFee[]): MarketCoverage {
  const attach = (provider: MarketCoverageProvider) => {
    const price = rows.find(row => row.providerSlug.replace(/^market:/, "") === provider.providerSlug);
    const missing = unavailable.find(row => row.providerSlug === provider.providerSlug);
    const seen = new Set<string>();
    const feeEvidence = [...(provider.feeEvidence ?? []), ...captured.filter(fee => fee.providerSlug === provider.providerSlug && (!fee.destinationCurrency || fee.destinationCurrency === currency))].flatMap(fee => {
      const key = `${fee.product}:${fee.summary}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ summary: fee.summary, product: fee.product, sourceUrl: sourceLink(fee.sourceUrl), observedAt: fee.observedAt }];
    });
    const pricingStatus = price
      ? { label: price.basis === "published" ? "Published estimate above" : price.basis === "market_estimate" ? "Market estimate above" : "Price reference above", reason: price.partial ? "Some fees or profile rules remain unconfirmed. See the price details above." : "See the amount, fee and collection time above." }
      : { label: feeEvidence.length ? "Captured fee information" : "Quote not available", reason: missing?.reason ?? "No public quote source is integrated for this request. Account pricing requires provider access." };
    return { ...provider, feeEvidence, pricingStatus: (provider.discoverySources?.length || provider.currencyMatch === "unverified") && !price && !missing ? provider.pricingStatus ?? pricingStatus : pricingStatus };
  };
  return { ...coverage, providers: coverage.providers.map(attach), ...(coverage.allProviders ? { allProviders: coverage.allProviders.map(attach) } : {}) };
}
