import catalog from "../../../packages/core/src/public-pricing/corridor-discovery.json";
import type { MarketCoverageProvider, PriceCheckInput } from "@railor/core";

export const DISCOVERED_PROVIDERS = catalog.providers;

/** Match explicit direction and user context; a currency pair is never expanded into its reverse. */
export function discoveredCoverage(input: PriceCheckInput): MarketCoverageProvider[] {
  return DISCOVERED_PROVIDERS.map(provider => {
    const routes = provider.routes.filter(route => route.from === input.sourceCurrency.toUpperCase() && route.to === input.destinationCurrency.toUpperCase());
    const method = "paymentMethod" in provider ? provider.paymentMethod : undefined;
    const match = routes.some(route => input.context && route.profiles.includes(input.context.profile)
      && (!method || input.context.paymentMethod === method)
      && input.context.country === (input.context.direction === "send" ? route.origin : route.destination)
      && (!input.destinationCountry || route.destination === input.destinationCountry));
    const documented = match && provider.slug !== "global66";
    const scope = provider.routes.map(route => `${route.from} → ${route.to} (${route.origin} → ${route.destination}; ${route.profiles.join("/")})`).filter((value, index, values) => values.indexOf(value) === index).join("; ");
    return {
      providerSlug: provider.slug, providerName: provider.name, websiteUrl: provider.website,
      category: method === "wire" ? "Bank wire" : "Transfer service", currencyMatch: documented ? "both" : "unverified", routeMatch: documented,
      lastVerified: provider.reviewedAt,
      pricingReviewedAt: provider.reviewedAt,
      pricingStatus: { label: documented ? (method === "wire" ? "SWIFT wire · rate at credit" : "Documented product · quote required") : "Route needs confirmation", reason: `${documented ? "The published product covers this direction and profile." : `Reviewed product scope: ${scope}${method === "wire" ? "; SWIFT wire" : ""}. Support for the current setup needs confirmation.`} ${provider.pricingNote}` },
      discoverySources: provider.sources.map(url => ({ label: "Official product and pricing source", url })),
    };
  });
}
