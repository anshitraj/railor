import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, sharedComparisons } from "@railor/database";
import { buildComparison } from "../../../lib/compare";
import { CompareBoard } from "../../../components/app/compare-table";
import { RailorMark } from "../../../components/marketing/nav";

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

  const table = await buildComparison(shared.providerSlugs);

  return (
    <main className="mx-auto flex w-[min(1180px,calc(100%-2rem))] flex-col gap-6 py-10">
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

      <CompareBoard table={table} selected={shared.providerSlugs} available={[]} readOnly />

      <p className="text-[12px] text-[var(--color-faint)]">
        Generated from Railor&apos;s capability graph on{" "}
        {shared.createdAt.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
        . Each row is sourced; open the provider profile for the evidence behind it.
      </p>
    </main>
  );
}
