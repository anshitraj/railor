import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { getPlatformPaymentFlags } from "@railor/core";
import { changeEvents, getDb, payments } from "@railor/database";
import { getSession } from "../../lib/auth";
import { AdminShell } from "../../components/admin/admin-shell";

export const dynamic = "force-dynamic";

/** Every /admin page is operator-only; the check is here on the server, never in the client shell. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (!session.user.isAdmin) {
    return (
      <main id="main" className="mx-auto flex w-[min(700px,calc(100%-2rem))] flex-col gap-3 py-24">
        <h1 className="text-[24px] font-semibold">Operations console</h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          This console is restricted to Railor operators. Your account ({session.user.email}) does not have the operator flag.
        </p>
        <p className="text-[13px] text-[var(--color-faint)]">
          Grant it in the database: <code>update users set is_admin = true where email = &apos;…&apos;;</code>
        </p>
        <Link href="/app" className="text-[13.5px] font-medium text-[var(--color-purple)]">
          ← Back to the workspace
        </Link>
      </main>
    );
  }
  const db = await getDb();
  const [[unknown], [pending], flags] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.status, "unknown")),
    db.select({ n: sql<number>`count(*)::int` }).from(changeEvents).where(eq(changeEvents.reviewStatus, "pending")),
    getPlatformPaymentFlags(),
  ]);
  return (
    <AdminShell email={session.user.email} alerts={{ unknownPayments: unknown?.n ?? 0, pendingReview: pending?.n ?? 0, paused: flags.paused }}>
      {children}
    </AdminShell>
  );
}
