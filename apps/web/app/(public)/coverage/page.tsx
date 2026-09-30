import { corridorLabel, loadProviderInputs, loadReferenceData, loadTopCoverageGaps, type TopCoverageGap } from "@railor/core";
import { Card, SectionLabel, cn } from "@railor/ui";
import { CoverageExplorer, type CoverageRow } from "../../../components/marketing/coverage-explorer";
import { PageHeader } from "../../../components/marketing/page-header";

export const metadata = { title: "Market coverage" };
export const dynamic = "force-dynamic";

/**
 * Coverage density per destination market, computed from the capability graph.
 * A thin market is as useful to know about as a deep one, so zero counts are
 * shown rather than filtered away.
 */
export default async function CoveragePage() {
  const [allInputs, reference, topGaps] = await Promise.all([
    loadProviderInputs(),
    loadReferenceData(),
    loadTopCoverageGaps(10),
  ]);
  // Real companies only, like search, decisions and the route map: a fictional demo provider must never count as coverage.
  const inputs = allInputs.filter((p) => !p.isDemo);

  const rows: CoverageRow[] = reference.countries.map((country) => {
    // Same rule as the provider directory: "unknown" and "unsupported" rows are evidence, not coverage.
    const providers = inputs.filter((p) =>
      p.facets.some(
        (f) =>
          f.destinationCountry === country.code &&
          (f.availability === "supported" || f.availability === "partial"),
      ),
    );
    const entityProviders = inputs.filter((p) =>
      p.facets.some((f) => f.entityCountry === country.code && f.availability === "supported"),
    );
    const currencies = [
      ...new Set(
        inputs.flatMap((p) =>
          p.facets
            .filter((f) => f.destinationCountry === country.code)
            .map((f) => f.destinationCurrency)
            .filter(Boolean),
        ),
      ),
    ] as string[];

    return {
      code: country.code,
      name: country.name,
      region: country.region,
      payoutProviders: providers.length,
      onboardingProviders: entityProviders.length,
      currencies,
    };
  });

  // Stable sort: markets with equal depth keep the reference data's popularity order.
  const sorted = [...rows].sort((a, b) => b.payoutProviders - a.payoutProviders);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Market coverage" title="Where the mapped infrastructure actually reaches.">
        <p>
          Two different questions, kept separate: how many providers can pay into a market, and how
          many can onboard a company incorporated there.
        </p>
      </PageHeader>

      <CoverageExplorer rows={sorted} />

      <p className="text-[12.5px] leading-relaxed text-[var(--color-muted)]">
        Counts cover the providers Railor has mapped so far, not the whole market. An unknown answer
        is never counted as coverage.
      </p>

      {topGaps.length > 0 && <UnansweredDemand gaps={topGaps} />}
    </div>
  );
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const TH = "border-b border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]";
const TD = "border-b border-[var(--color-line)] px-4 py-3 align-middle";

function UnansweredDemand({ gaps }: { gaps: TopCoverageGap[] }) {
  const most = Math.max(...gaps.map((gap) => gap.timesRequested));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SectionLabel>Most requested, still unanswered</SectionLabel>
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-[var(--color-muted)]">
          Real routes real searches have asked for that Railor still has no verified answer to —
          ranked by how often, not by a guessed priority score. Every one of these closes itself
          out automatically the moment real evidence answers it.
        </p>
      </div>
      <Card className="overflow-clip p-0">
        <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={cn(TH, "w-[68%] sm:w-[44%]")}>
                Corridor
              </th>
              <th scope="col" className={cn(TH, "hidden sm:table-cell sm:w-[26%]")}>
                Provider
              </th>
              <th scope="col" className={cn(TH, "w-[32%] sm:w-[16%]")}>
                Asked
              </th>
              <th scope="col" className={cn(TH, "hidden sm:table-cell sm:w-[14%]")}>
                Last asked
              </th>
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {gaps.map((gap) => {
              const lastAsked = new Date(gap.lastRequestedAt);
              return (
                <tr key={gap.id} className="transition hover:bg-[var(--color-paper)]">
                  <td className={TD}>
                    <span className="font-medium">{corridorLabel(gap.query)}</span>
                    <span className="mt-0.5 block text-[11.5px] text-[var(--color-muted)] sm:hidden">
                      {gap.providerName} · {DATE.format(lastAsked)}
                    </span>
                  </td>
                  <td className={cn(TD, "hidden truncate text-[var(--color-muted)] sm:table-cell")}>{gap.providerName}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      <span className="tabular w-6 text-[15px] font-semibold">{gap.timesRequested}</span>
                      <span aria-hidden className="relative hidden h-1.5 w-full max-w-16 overflow-hidden rounded-full bg-[var(--color-line)] lg:block">
                        <span
                          className="railor-grow absolute inset-y-0 left-0 rounded-full bg-[var(--color-orange)]"
                          style={{ width: `${Math.max(10, (gap.timesRequested / most) * 100)}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className={cn(TD, "hidden text-[var(--color-muted)] sm:table-cell")}>
                    <time dateTime={lastAsked.toISOString()}>{DATE.format(lastAsked)}</time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
