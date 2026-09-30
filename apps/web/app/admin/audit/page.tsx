import { getAuditLog } from "@railor/core";
import { AdminHeader } from "../../../components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const q = params.q?.trim().toLowerCase();
  const rows = (await getAuditLog(300)).filter((r) => !q || `${r.action} ${r.target ?? ""} ${r.actorEmail ?? ""} ${r.organizationName ?? ""}`.toLowerCase().includes(q));
  return (
    <>
      <AdminHeader title="Audit log" description="Every operator and security-relevant action: who did it, to what, and why. Append-only." />
      <form className="flex max-w-xl gap-2">
        <input name="q" defaultValue={params.q} placeholder="Filter by action, target, actor or workspace" aria-label="Filter audit log" className="product-field !mt-0 min-w-0 flex-1" />
        <button className="rounded-lg border border-[var(--color-line-strong)] bg-white px-5 text-sm font-semibold">Filter</button>
      </form>
      <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        {rows.map((entry) => (
          <li key={entry.id} className="grid gap-1 px-4 py-3 text-[13px] sm:grid-cols-[170px_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-start">
            <time className="font-mono text-[11.5px] text-[var(--color-muted)]">{entry.createdAt.toISOString().slice(0, 19).replace("T", " ")}</time>
            <span>
              <span className="font-semibold">{entry.action}</span>
              <span className="block text-[11.5px] text-[var(--color-muted)]">
                {entry.actorEmail ?? "system"}
                {entry.organizationName ? ` · ${entry.organizationName}` : ""}
              </span>
            </span>
            <span className="break-all font-mono text-[11.5px] text-[var(--color-ink-soft)]">
              {entry.target ?? ""}
              {entry.metadata && Object.keys(entry.metadata).length ? <span className="block text-[var(--color-muted)]">{JSON.stringify(entry.metadata).slice(0, 240)}</span> : null}
            </span>
          </li>
        ))}
        {!rows.length ? <li className="px-4 py-6 text-[13px] text-[var(--color-muted)]">No entries{q ? " match that filter" : " yet"}.</li> : null}
      </ul>
    </>
  );
}
