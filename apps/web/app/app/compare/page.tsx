import { loadProviderSummaries } from "@railor/core";
import { buildComparison } from "../../../lib/compare";
import { CompareBoard } from "../../../components/app/compare-table";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.providers === "string" ? params.providers : "";
  const summaries = await loadProviderSummaries();

  // Default to a comparison that is actually interesting rather than empty.
  const selected = raw
    ? raw.split(",").filter(Boolean).slice(0, 4)
    : summaries.slice(0, 3).map((p) => p.slug);

  const table = await buildComparison(selected);

  return (
    <CompareBoard
      table={table}
      selected={selected}
      available={summaries.map((p) => ({ slug: p.slug, name: p.name }))}
    />
  );
}
