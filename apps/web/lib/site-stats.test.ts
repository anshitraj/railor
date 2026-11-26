import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { coverageCounts } = await import("./site-stats");

const facet = (entityCountry: string, destinationCountry: string, destinationCurrency: string, availability: string) => ({ entityCountry, destinationCountry, destinationCurrency, availability }) as never;

describe("what the landing page counts", () => {
  it("counts countries, currencies and routes from supported and partial coverage only", () => {
    const counts = coverageCounts([
      { isDemo: false, facets: [facet("US", "IN", "INR", "supported"), facet("US", "IN", "INR", "partial"), facet("US", "MX", "MXN", "supported"), facet("GB", "IN", "INR", "supported")] },
      { isDemo: false, facets: [facet("US", "BR", "BRL", "unknown"), facet("US", "NG", "NGN", "unsupported")] },
    ]);
    expect(counts).toEqual({ countries: 2, currencies: 2, routes: 3 });
  });

  it("never counts a demo company as coverage", () => {
    expect(coverageCounts([{ isDemo: true, facets: [facet("US", "IN", "INR", "supported")] }])).toEqual({ countries: 0, currencies: 0, routes: 0 });
  });
});
