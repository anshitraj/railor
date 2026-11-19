import { CountryCode, CustomerType, ProductType } from "@railor/types";
import { z } from "zod";

const slug = z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/);

export const RouteComparisonRequest = z.object({
  providers: z.tuple([slug, slug]).refine(([left, right]) => left !== right),
  from: CountryCode,
  to: CountryCode,
  customerType: CustomerType,
  product: ProductType.optional(),
});
export type RouteComparisonRequest = z.infer<typeof RouteComparisonRequest>;

export const NEEDS_CONFIRMATION = "Needs confirmation";

export interface ComparisonSource {
  url: string;
  title: string;
  verifiedAt: string | null;
}

export interface ComparisonFact {
  label: string;
  value: string;
  detail?: string;
  source?: ComparisonSource;
}

export interface ComparisonCandidate {
  slug: string;
  name: string;
  category: string;
  website: string | null;
  product?: string | null;
  verdict: "supported" | "additional_requirements" | "unavailable" | "unknown";
  reason: string;
  advantages: string[];
  considerations: string[];
  facts: ComparisonFact[];
  sources: ComparisonSource[];
  webCheck?: {
    verdict: "supported" | "contradicted" | "unclear";
    quote: string;
    source: ComparisonSource;
  };
}

export interface RouteComparison {
  request: RouteComparisonRequest;
  origin: string;
  destination: string;
  productLabel: string | null;
  pendingWebChecks?: boolean;
  candidates: ComparisonCandidate[];
  checkedAt: string;
}
