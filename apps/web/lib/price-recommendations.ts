import type { PriceRow } from "@railor/core";

/** Keep the comparable winner first, but do not bury credible lower-fee references behind every complete estimate. */
export function recommendedPriceRows(rows: PriceRow[], best: PriceRow | null): PriceRow[] {
  if (!best || best.recipientAmount === null) return rows;
  const promising = rows.filter((row) => row.basis === "published" && row.partial && row.costComplete === false
    && row.profileAssessment?.status === "documented" && row.profileAssessment.priceApplicable
    && row.recipientAmount !== null && row.recipientAmount > best.recipientAmount!
    && row.feeAmount !== null && !row.webChecks?.some((check) => check.state === "contradicted"))
    .sort((a, b) => b.recipientAmount! - a.recipientAmount!).slice(0, 2);
  const pinned = new Set([best.providerSlug, ...promising.map((row) => row.providerSlug)]);
  return [best, ...promising, ...rows.filter((row) => !pinned.has(row.providerSlug))];
}
