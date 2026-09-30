import { desc, eq, sql } from "drizzle-orm";
import { getDb, organizationEntitlements, organizationMembers, orgPaymentSettings, organizations, payments, providerConnections } from "@railor/database";
import { effectivePlan } from "../../../lib/plans";
import { AdminHeader } from "../../../components/admin/admin-shell";
import { OrgLiveEditor } from "../../../components/admin/payment-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Organizations" };

export default async function AdminOrganizationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const q = params.q?.trim().toLowerCase();
  const db = await getDb();
  const [orgs, members, entitlements, settings, paymentCounts, connectionCounts] = await Promise.all([
    db.select().from(organizations).orderBy(desc(organizations.createdAt)).limit(300),
    db.select({ org: organizationMembers.organizationId, n: sql<number>`count(*)::int` }).from(organizationMembers).groupBy(organizationMembers.organizationId),
    db.select().from(organizationEntitlements),
    db.select().from(orgPaymentSettings),
    db
      .select({ org: payments.organizationId, live: sql<number>`count(*) filter (where ${payments.mode} = 'live')::int`, test: sql<number>`count(*) filter (where ${payments.mode} = 'test')::int` })
      .from(payments)
      .groupBy(payments.organizationId),
    db
      .select({ org: providerConnections.organizationId, production: sql<number>`count(*) filter (where ${providerConnections.environment} = 'production' and ${providerConnections.status} = 'connected')::int`, sandbox: sql<number>`count(*) filter (where ${providerConnections.environment} = 'sandbox' and ${providerConnections.status} = 'connected')::int` })
      .from(providerConnections)
      .where(eq(providerConnections.status, "connected"))
      .groupBy(providerConnections.organizationId),
  ]);
  const by = <T extends { org?: string; organizationId?: string }>(rows: T[]) => new Map(rows.map((r) => [(r.org ?? r.organizationId)!, r]));
  const memberMap = by(members);
  const entMap = by(entitlements);
  const settingMap = by(settings);
  const payMap = by(paymentCounts);
  const connMap = by(connectionCounts);
  const visible = orgs.filter((o) => !q || `${o.name} ${o.slug} ${o.emailDomain ?? ""}`.toLowerCase().includes(q));

  return (
    <>
      <AdminHeader
        title="Organizations"
        description="Workspaces, their plan, connections and payment activity. Enable live payments only after reviewing the business — limits are mandatory and every change is audited."
      />
      <form className="flex max-w-xl gap-2">
        <input name="q" defaultValue={params.q} placeholder="Search name, slug or email domain" aria-label="Search organizations" className="product-field !mt-0 min-w-0 flex-1" />
        <button className="rounded-lg border border-[var(--color-line-strong)] bg-white px-5 text-sm font-semibold">Search</button>
      </form>
      <ul className="flex flex-col gap-2">
        {visible.map((o) => {
          const s = settingMap.get(o.id);
          const e = entMap.get(o.id);
          const plan = effectivePlan(e ?? null);
          const pc = payMap.get(o.id);
          const cc = connMap.get(o.id);
          return (
            <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-ink)] text-[13px] font-bold uppercase text-white">{o.name.charAt(0)}</span>
              <span className="flex min-w-[200px] flex-1 flex-col">
                <span className="text-[14px] font-semibold">{o.name}</span>
                <span className="text-[11.5px] text-[var(--color-muted)]">
                  {o.slug} · {o.emailDomain ?? "no domain"} · {o.entityCountry ?? "—"} · created {o.createdAt.toISOString().slice(0, 10)}
                </span>
              </span>
              <Stat label="Members" value={memberMap.get(o.id)?.n ?? 0} />
              <Stat label="Plan" value={plan === "founding" ? "Founding" : "Free"} />
              <Stat label="Connections" value={`${cc?.production ?? 0} prod · ${cc?.sandbox ?? 0} sbx`} />
              <Stat label="Payments" value={`${pc?.live ?? 0} live · ${pc?.test ?? 0} test`} />
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${s?.liveEnabled ? "bg-[var(--color-ok-bg)] text-[var(--color-ok)]" : "bg-[var(--color-canvas)] text-[var(--color-muted)]"}`}>
                {s?.liveEnabled ? `Live · ≤${Number(s.maxPaymentAmount ?? 0).toLocaleString("en-US")}/payment` : "Live off"}
              </span>
              <OrgLiveEditor
                organizationId={o.id}
                initial={{
                  liveEnabled: s?.liveEnabled ?? false,
                  maxPaymentAmount: s?.maxPaymentAmount ? Number(s.maxPaymentAmount) : null,
                  dailyPaymentAmount: s?.dailyPaymentAmount ? Number(s.dailyPaymentAmount) : null,
                  note: s?.liveNote ?? "",
                }}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex min-w-[90px] flex-col">
      <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-faint)]">{label}</span>
      <span className="text-[12.5px] font-semibold tabular">{value}</span>
    </span>
  );
}
