import Link from "next/link";
import { redirect } from "next/navigation";
import { loadChangeFeed, loadPlatformCounts, searchCorridors } from "@railor/core";
import { CorridorQuery } from "@railor/types";
import { Card, CountUp, EmptyState, Freshness, SectionLabel, VerdictPill } from "@railor/ui";
import { getSession } from "../../lib/auth";
import { getKybProfile, getOrgAlerts, getSavedCorridors, getSatisfiedRequirements } from "../../lib/org";
import { RoutePill } from "../../components/app/route-pill";
import { Sparkline, dailyCounts } from "../../components/app/sparkline";
import { KeepSuggestedCorridor } from "../../components/app/suggested-corridor";
import { getReferenceOptions } from "../../lib/reference";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;

  const [corridors, counts, alerts, kyb, satisfied] = await Promise.all([
    getSavedCorridors(org.id),
    loadPlatformCounts(),
    getOrgAlerts(org.id, 8),
    getKybProfile(org.id),
    getSatisfiedRequirements(org.id),
  ]);

  const evaluated = await Promise.all(
    corridors.map(async (corridor) => {
      const query = CorridorQuery.parse(corridor.query);
      const result = await searchCorridors(query, { satisfiedRequirements: satisfied });
      return { corridor, query, result };
    }),
  );

  const warnings = evaluated.filter((e) => e.result.counts.supported === 0).length;
  const recentChanges = await loadChangeFeed({ limit: 200, since: new Date(Date.now() - 14 * 86_400_000) });
  const changesThisWeek = recentChanges.filter(
    (c) => Date.now() - c.change.detectedAt.getTime() < 7 * 86_400_000,
  ).length;
  const changeSeries = dailyCounts(recentChanges.map((c) => c.change.detectedAt), 14);

  // Law 2 — no empty dashboard: with no saved corridor, evaluate a suggested one
  // from what Railor knows about the workspace, and let it be kept in one click.
  let suggestion: { query: CorridorQuery; label: string; result: Awaited<ReturnType<typeof searchCorridors>> } | null = null;
  if (!corridors.length) {
    const reference = await getReferenceOptions();
    const entity = org.entityCountry ?? "IN";
    const destination = org.targetCountries?.find((c) => c !== entity) ?? (entity === "AE" ? "GB" : "AE");
    const currency = org.settlementCurrencies?.[0] ?? reference.currencyByCountry[destination];
    const query = CorridorQuery.parse({
      entityCountry: entity,
      customerType: "business",
      sourceAsset: "USDC",
      destinationCountry: destination,
      destinationCurrency: currency,
    });
    const result = await searchCorridors(query, { satisfiedRequirements: satisfied });
    const name = (code: string) => reference.countries.find((c) => c.value === code)?.label ?? code;
    suggestion = { query, result, label: `${name(entity)} → USDC → ${name(destination)}${currency ? ` · ${currency}` : ""}` };
  }

  const kybComplete = kyb.filter((k) => k.status === "have").length;
  const name = session.user.name ?? session.user.email.split("@")[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-semibold tracking-tight">
          {greeting()}, {name}
        </h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          Here&apos;s what&apos;s changed across your infrastructure.
        </p>
      </div>

      <section className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-2 lg:grid-cols-4">
        {[
          { value: counts.providers, label: "Providers tracked", hint: `${counts.capabilities.toLocaleString()} capability rows`, href: "/app/providers" },
          { value: corridors.length, label: "Active corridors", hint: corridors.some((c) => c.suggested) ? "includes suggested" : corridors.length ? "all yours" : "one suggestion below", tone: "purple" as const, href: "/app/corridors" },
          { value: changesThisWeek, label: "Changes this week", hint: `${counts.sources} sources monitored`, href: "/app/changes", series: changeSeries },
          { value: warnings, label: "Coverage warnings", hint: warnings ? "corridor with no compatible provider" : "none right now", tone: warnings ? ("warn" as const) : undefined, href: "/app/monitoring" },
        ].map((panel) => (
          <Link key={panel.label} href={panel.href} className="group flex items-end justify-between gap-3 bg-white p-5 transition-colors hover:bg-[var(--color-paper)]">
            <span className="flex flex-col gap-1">
              <span className={`tabular text-[28px] font-semibold leading-none ${panel.tone === "purple" ? "text-[var(--color-purple)]" : panel.tone === "warn" ? "text-[var(--color-warn)]" : ""}`}>
                <CountUp value={panel.value} />
              </span>
              <span className="text-[13px] text-[var(--color-ink-soft)]">{panel.label}</span>
              <span className="text-[11px] text-[var(--color-faint)]">{panel.hint}</span>
            </span>
            {"series" in panel && panel.series ? (
              <Sparkline values={panel.series} label={`${panel.label}: daily changes over the last 14 days`} width={96} height={30} />
            ) : (
              <span aria-hidden className="text-[var(--color-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-orange-deep)]">→</span>
            )}
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <SectionLabel>Infrastructure map</SectionLabel>
            <Link href="/app/corridors" className="text-[12.5px] font-medium text-[var(--color-purple)]">
              Open explorer →
            </Link>
          </div>

          {evaluated.length ? (
            <ul className="flex flex-col gap-3">
              {evaluated.map(({ corridor, query, result }) => {
                const tone =
                  result.counts.supported > 0
                    ? "bg-[var(--color-ok)]"
                    : result.counts.additional_requirements > 0
                      ? "bg-[var(--color-warn)]"
                      : "bg-[var(--color-bad)]";
                return (
                  <li key={corridor.id}>
                    <Link
                      href={`/app/corridors?saved=${corridor.id}`}
                      className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-line)] p-4 transition hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-soft)]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 text-[14px] font-medium">{corridor.label}</span>
                        {corridor.suggested ? (
                          <span className="rounded-full bg-[var(--color-lavender)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-purple)]">
                            Suggested — edit this
                          </span>
                        ) : null}
                        <span className="flex-1" />
                        <span className="tabular text-[12px] text-[var(--color-muted)]">
                          {result.counts.supported} compatible / {result.providersChecked} checked
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          query.entityCountry,
                          query.sourceAsset,
                          query.destinationCountry,
                          query.destinationCurrency,
                        ]
                          .filter(Boolean)
                          .map((node, i, arr) => (
                            <span key={`${node}-${i}`} className="flex items-center gap-2">
                              <RoutePill value={String(node)} />
                              {i < arr.length - 1 ? (
                                <span className="relative h-px w-8 overflow-hidden bg-[var(--color-line-strong)]">
                                  <span className={`absolute inset-y-0 left-0 w-full ${tone} opacity-70`} />
                                </span>
                              ) : null}
                            </span>
                          ))}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {result.results.slice(0, 4).map((r) => (
                          <span
                            key={r.provider.slug}
                            className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[11px] text-[var(--color-ink-soft)]"
                          >
                            {r.provider.name}
                          </span>
                        ))}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : suggestion ? (
            <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-orange)]/50 bg-[var(--color-lavender)]/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-medium">{suggestion.label}</span>
                <span className="rounded-full bg-[var(--color-lavender)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-purple)]">
                  Suggested — edit this
                </span>
                <span className="flex-1" />
                <span className="tabular text-[12px] text-[var(--color-muted)]">
                  {suggestion.result.counts.supported} compatible / {suggestion.result.providersChecked} checked
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[suggestion.query.entityCountry, suggestion.query.sourceAsset, suggestion.query.destinationCountry, suggestion.query.destinationCurrency]
                  .filter(Boolean)
                  .map((node, i, arr) => (
                    <span key={`${node}-${i}`} className="flex items-center gap-2">
                      <RoutePill value={String(node)} />
                      {i < arr.length - 1 ? <span className="h-px w-8 bg-[var(--color-line-strong)]" /> : null}
                    </span>
                  ))}
              </div>
              <p className="text-[12.5px] leading-relaxed text-[var(--color-muted)]">
                Built from your workspace profile so this page is never empty. Keep it and Railor watches it for coverage, requirement and pricing changes — or open the explorer to change any part of it.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <KeepSuggestedCorridor query={suggestion.query as Record<string, unknown>} label={suggestion.label} />
                <Link href="/app/corridors" className="text-[12.5px] font-medium text-[var(--color-purple)]">
                  Edit in explorer →
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              what="No corridors yet"
              why="A corridor is a route you care about — an entity jurisdiction, an asset, a destination and a rail. Railor evaluates every mapped provider against it and watches it for changes."
              actionLabel="Build a corridor"
              href="/app/corridors"
            />
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Recent changes</SectionLabel>
              <Link href="/app/changes" className="text-[12.5px] font-medium text-[var(--color-purple)]">
                All changes →
              </Link>
            </div>
            {alerts.length ? (
              <ul className="flex flex-col gap-3">
                {alerts.slice(0, 5).map(({ alert, change, providerName }) => (
                  <li key={alert.id} className="flex flex-col gap-0.5">
                    <span className="text-[13px] leading-snug text-[var(--color-ink)]">
                      {change.summary}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--color-muted)]">{providerName}</span>
                      <Freshness date={change.detectedAt} prefix="" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                what="Nothing has changed in your markets yet"
                why="Railor raises an alert when coverage, requirements, pricing, limits or availability move for a provider, corridor or country you watch."
                actionLabel="Add a monitor"
                href="/app/monitoring"
              />
            )}
          </Card>

          <Card className="flex flex-col gap-2 p-5">
            <SectionLabel>KYB readiness</SectionLabel>
            <p className="text-[13px] text-[var(--color-ink-soft)]">
              <span className="tabular text-[20px] font-semibold text-[var(--color-purple)]">
                {kybComplete}
              </span>{" "}
              <span className="text-[var(--color-muted)]">of {kyb.length} documents recorded</span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-sand)]" role="progressbar" aria-valuemin={0} aria-valuemax={kyb.length} aria-valuenow={kybComplete} aria-label="KYB profile completeness">
              <div className="railor-grow h-full rounded-full bg-[var(--color-orange)]" style={{ width: `${kyb.length ? Math.round((kybComplete / kyb.length) * 100) : 0}%` }} />
            </div>
            <p className="text-[12.5px] text-[var(--color-muted)]">
              Recording what you already hold turns “supported” into “supported for you”, and shows
              exactly what each provider still needs.
            </p>
            <Link
              href="/app/readiness"
              className="mt-1 text-[13px] font-medium text-[var(--color-purple)]"
            >
              Update readiness profile →
            </Link>
          </Card>
        </div>
      </section>

      {org.assumptions?.length ? (
        <Card className="flex flex-col gap-2 border-dashed p-5">
          <SectionLabel>Assumptions Railor is making</SectionLabel>
          <ul className="flex flex-col gap-1">
            {org.assumptions.map((a) => (
              <li key={a} className="text-[13px] text-[var(--color-ink-soft)]">
                • {a}
              </li>
            ))}
          </ul>
          <Link href="/welcome" className="text-[12.5px] font-medium text-[var(--color-purple)]">
            Change these answers →
          </Link>
        </Card>
      ) : null}

      <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-4">
        <VerdictPill verdict="supported" compact />
        <p className="flex-1 text-[13px] text-[var(--color-ink-soft)]">
          Every verdict in Railor carries a reason, a source and a verification time. Open any
          result row to see them.
        </p>
        <Link href="/app/developers" className="text-[13px] font-medium text-[var(--color-purple)]">
          Get the same answers via API →
        </Link>
      </section>
    </div>
  );
}
