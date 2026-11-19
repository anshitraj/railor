import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, sharedComparisons } from "@railor/database";
import { buildComparison } from "../../../lib/compare";
import { CompareBoard } from "../../../components/app/compare-table";
import { RailorMark } from "../../../components/marketing/nav";
import { buildRouteComparison } from "../../../lib/route-comparison";
import { RouteComparisonRequest } from "../../../lib/route-comparison-model";
import { addRouteComparisonResearch } from "../../../lib/route-comparison-research";
import { RouteComparisonResults } from "../../../components/app/route-comparison-results";

export const dynamic = "force-dynamic";

/** Public, read-only comparison — shareable without an account. */
export default async function SharedComparison({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await getDb();
  const [shared] = await db
    .select()
    .from(sharedComparisons)
    .where(eq(sharedComparisons.id, id))
    .limit(1);
  if (!shared) notFound();

  const route = RouteComparisonRequest.safeParse(shared.query.routeComparison);
  const documented = route.success ? await buildRouteComparison(route.data) : null;
  const comparison = documented ? await addRouteComparisonResearch(documented, "read").catch(() => documented) : null;
  const table = route.success ? null : await buildComparison(shared.providerSlugs);
  if (!comparison && !table) notFound();

  return (
    <main id="main" className="mx-auto flex w-[min(1180px,calc(100%-2rem))] flex-col gap-6 py-10">
      <header className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <RailorMark />
          <span className="text-[15px] font-semibold">Railor</span>
        </Link>
        <span className="text-[13px] text-[var(--color-muted)]">Shared comparison</span>
        <span className="flex-1" />
        <Link
          href="/login?intent=start"
          className="rounded-full bg-[var(--color-purple)] px-4 py-2 text-[13px] font-medium text-white"
        >
          Run your own corridor
        </Link>
      </header>

      {comparison ? <RouteComparisonResults comparison={comparison} /> : null}
      {table ? <CompareBoard table={table} selected={shared.providerSlugs} available={[]} readOnly /> : null}

      <p className="text-[12px] text-[var(--color-faint)]">
        Shared on{" "}
        {shared.createdAt.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
        . Open the source links in the comparison to check the published terms.
      </p>
    </main>
  );
}
