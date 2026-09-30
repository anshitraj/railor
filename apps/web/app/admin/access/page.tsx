import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, organizationEntitlements, organizations } from "@railor/database";
import { getSession } from "../../../lib/auth";
import { activateFounding } from "./actions";
import { AdminHeader } from "../../../components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Access" };
export default async function AccessPage() {
  const session = await getSession();
  if (!session?.user.isAdmin) redirect("/login");
  const db = await getDb();
  const rows = await db.select({ entitlement: organizationEntitlements, slug: organizations.slug }).from(organizationEntitlements).innerJoin(organizations, eq(organizations.id, organizationEntitlements.organizationId)).orderBy(desc(organizationEntitlements.updatedAt)).limit(50);
  return <div className="max-w-3xl space-y-6">
    <AdminHeader title="Founding access" description="Verify the payment in the payment provider first. Activation is audited. Reusing a reference does not extend access." />
    <form action={activateFounding} className="grid gap-4 rounded-2xl border border-[var(--color-line)] p-5">
      <label className="grid gap-1 text-sm">Workspace slug<input required name="slug" maxLength={120} className="rounded border p-2" /></label>
      <label className="grid gap-1 text-sm">Verified payment reference<input required name="reference" minLength={4} maxLength={160} className="rounded border p-2" /></label>
      <label className="grid gap-1 text-sm">Access expires at (UTC)<input required type="datetime-local" name="validUntil" className="rounded border p-2" /></label>
      <button className="rounded-full bg-[var(--color-ink)] p-3 text-white">Activate Founding</button>
    </form>
    <ul className="divide-y divide-[var(--color-line)]">{rows.map(({ entitlement: e, slug }) => <li key={e.id} className="py-3 text-sm"><strong>{slug}</strong> · {e.plan} · {e.status} · expires {e.validUntil?.toISOString() ?? "—"}</li>)}</ul>
  </div>;
}
