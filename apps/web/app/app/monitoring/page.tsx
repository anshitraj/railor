import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, Freshness, SectionLabel, StageBadge } from "@railor/ui";
import { CHANGE_KIND_LABEL } from "@railor/types";
import { getSession } from "../../../lib/auth";
import { getOrgAlerts, getWatchlists } from "../../../lib/org";
import { UnwatchButton } from "../../../components/app/unwatch-button";

export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");

  const [watches, alerts] = await Promise.all([
    getWatchlists(session.organization.id),
    getOrgAlerts(session.organization.id, 25),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-semibold tracking-tight">Monitoring</h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          Railor snapshots provider sources, diffs the normalized values and raises an event with
          the evidence attached.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <SectionLabel>Watching</SectionLabel>
            <Link href="/app/corridors" className="text-[12.5px] font-medium text-[var(--color-purple)]">
              Add corridor →
            </Link>
          </div>

          {watches.length ? (
            <ul className="flex flex-col gap-2">
              {watches.map((w) => (
                <li
                  key={w.id}
                  className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] p-3"
                >
                  <span className="mt-0.5 rounded-full bg-[var(--color-lavender)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-purple)]">
                    {w.targetType}
                  </span>
                  <div className="flex flex-1 flex-col">
                    <span className="text-[13.5px] font-medium">{w.label}</span>
                    <span className="text-[11.5px] text-[var(--color-muted)]">
                      {w.kinds.map((k) => CHANGE_KIND_LABEL[k as keyof typeof CHANGE_KIND_LABEL] ?? k).join(" · ")}
                    </span>
                  </div>
                  <UnwatchButton id={w.id} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              what="You're not monitoring anything yet"
              why="Add a provider or a corridor and Railor will notify you when its coverage, requirements, pricing, limits or availability change."
              actionLabel="Open Corridor Explorer"
              href="/app/corridors"
            />
          )}

          <div className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-3">
            <SectionLabel>Delivery</SectionLabel>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="rounded-full border border-[var(--color-line)] px-2.5 py-1">
                Dashboard <StageBadge stage="live" />
              </span>
              <span className="rounded-full border border-[var(--color-line)] px-2.5 py-1">
                Email <StageBadge stage="beta" />
              </span>
              <span className="rounded-full border border-dashed border-[var(--color-line-strong)] px-2.5 py-1 text-[var(--color-faint)]">
                Slack <StageBadge stage="soon" />
              </span>
              <span className="rounded-full border border-dashed border-[var(--color-line-strong)] px-2.5 py-1 text-[var(--color-faint)]">
                Webhook <StageBadge stage="soon" />
              </span>
            </div>
            <p className="text-[12px] text-[var(--color-muted)]">
              Email delivery requires SMTP configuration on this deployment; until then alerts
              appear here.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <SectionLabel>Alert feed</SectionLabel>
          {alerts.length ? (
            <ul className="flex flex-col gap-3">
              {alerts.map(({ alert, change, providerName, providerSlug }) => (
                <li
                  key={alert.id}
                  className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-[var(--color-line)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--color-lavender)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-purple)]">
                      {CHANGE_KIND_LABEL[change.kind]}
                    </span>
                    <Link
                      href={`/app/providers/${providerSlug}`}
                      className="text-[13px] font-medium hover:text-[var(--color-purple)]"
                    >
                      {providerName}
                    </Link>
                    <span className="flex-1" />
                    <Freshness date={change.detectedAt} prefix="Detected" />
                  </div>
                  <p className="text-[13.5px] leading-snug text-[var(--color-ink)]">
                    {change.summary}
                  </p>
                  {change.previousValue && change.currentValue ? (
                    <p className="tabular text-[12px] text-[var(--color-muted)]">
                      {change.previousValue} → {change.currentValue} · confidence{" "}
                      {Number(change.confidence).toFixed(2)}
                      {change.reviewStatus === "pending" ? " · pending human review" : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              what="No alerts yet"
              why="When something moves in a market you watch, it lands here with the diff, the source and the corridors it affects."
              actionLabel="See all detected changes"
              href="/app/changes"
            />
          )}
        </Card>
      </div>
    </div>
  );
}
