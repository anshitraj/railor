import Link from "next/link";
import { redirect } from "next/navigation";
import { loadChangeFeed, loadPlatformCounts, searchCorridors } from "@railor/core";
import { CorridorQuery } from "@railor/types";
import { Card, EmptyState, Freshness, SectionLabel, Stat, VerdictPill } from "@railor/ui";
import { getSession } from "../../lib/auth";
import { getKybProfile, getOrgAlerts, getSavedCorridors, getSatisfiedRequirements } from "../../lib/org";
import { RoutePill } from "../../components/app/route-pill";

export const dynamic = "force-dynamic";

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
  const changesThisWeek = (await loadChangeFeed({ limit: 50 })).filter(
    (c) => Date.now() - c.change.detectedAt.getTime() < 7 * 86_400_000,
  ).length;

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

      <section className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-line)] md:grid-cols-4">
        {[
          { value: counts.providers, label: "Providers tracked", hint: `${counts.capabilities.toLocaleString()} capability rows` },
          { value: corridors.length, label: "Active corridors", hint: corridors.some((c) => c.suggested) ? "includes suggested" : "all yours", tone: "purple" as const },
          { value: changesThisWeek, label: "Changes this week", hint: `${counts.sources} sources monitored` },
          { value: warnings, label: "Coverage warnings", hint: warnings ? "corridor with no compatible provider" : "none right now", tone: warnings ? ("warn" as const) : undefined },
        ].map((panel) => (
          <div key={panel.label} className="bg-white p-5">
            <Stat value={panel.value} label={panel.label} hint={panel.hint} tone={panel.tone} />
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
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
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium">{corridor.label}</span>
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

                      <div className="flex items-center gap-2">
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
