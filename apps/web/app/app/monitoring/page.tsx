import Link from "next/link";
import { NotifyMe } from "../../../components/notify-me";
import { redirect } from "next/navigation";
import { Card, EmptyState, Freshness, SectionLabel, StageBadge } from "@railor/ui";
import { CHANGE_KIND_LABEL } from "@railor/types";
import { getSession } from "../../../lib/auth";
import { getOrgAlerts, getWatchlists } from "../../../lib/org";
import { UnwatchButton } from "../../../components/app/unwatch-button";
import { WatchSettings } from "../../../components/app/watch-settings";
import { ControlButton } from "../../../components/app/control-forms";
import { decisions, productEvents, getDb } from "@railor/database";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monitoring" };

export default async function MonitoringPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");

  const [watches, alerts] = await Promise.all([
    getWatchlists(session.organization.id),
    getOrgAlerts(session.organization.id, 25),
  ]);
  const db = await getDb();
  const affected = await db.select({ id: decisions.id, status: decisions.status }).from(decisions).where(and(eq(decisions.organizationId, session.organization.id), eq(decisions.revalidationRequired, true))).orderBy(desc(decisions.evaluatedAt)).limit(20);
  const checks = await db.select().from(productEvents).where(and(eq(productEvents.organizationId, session.organization.id), eq(productEvents.kind, "decision_monitor_changed"))).orderBy(desc(productEvents.createdAt)).limit(10);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-semibold tracking-tight">Monitoring</h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          Railor snapshots provider sources, diffs the normalized values and raises an event with
          the evidence attached.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_1.4fr]">
        <Card className="space-y-3 p-5 lg:col-span-2"><h2 className="font-semibold">Decision revalidation</h2><p className="text-sm">Checks recent decisions against current policy, evidence, incidents and connection state. A changed decision gets a new audit record; approvals are never copied forward. Scheduled checks require the decision-monitor scheduler integration.</p>
          {["owner", "admin"].includes(session.role ?? "") && <ControlButton command={{ action: "monitor_decisions" }}>Check up to 25 recent decisions now</ControlButton>}
          <p className="text-sm">{affected.length ? "Flagged historical decisions (latest 20):" : "No flagged decisions."}</p>{affected.map((d) => <Link key={d.id} href={`/app/decisions/${d.id}`} className="flex items-center gap-2 text-sm hover:underline"><span className="product-mono text-[var(--color-muted)]">{d.id.slice(0, 8)}</span><span className="capitalize">{d.status.replaceAll("_", " ")}</span><span aria-hidden className="text-[var(--color-orange-deep)]">→</span></Link>)}
          {checks.map((e) => <p key={e.id} className="text-sm">{e.createdAt.toISOString()} · <Link href={`/app/decisions/${String(e.data.nextDecisionId)}`} className="underline">View refreshed decision</Link></p>)}
        </Card>
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
                    <div className="mt-1.5">
                      <WatchSettings id={w.id} digest={w.digest} channelEmail={w.channelEmail} kinds={w.kinds} readOnly={session.role === "viewer"} />
                    </div>
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
              <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--color-line-strong)] py-1 pl-2.5 pr-1 text-[var(--color-faint)]">
                Slack <StageBadge stage="soon" /> <NotifyMe feature="alerts-slack" signedIn compact />
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--color-line-strong)] py-1 pl-2.5 pr-1 text-[var(--color-faint)]">
                Webhook <StageBadge stage="soon" /> <NotifyMe feature="alerts-webhook" signedIn compact />
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
