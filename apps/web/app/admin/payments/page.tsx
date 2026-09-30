import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { getDb, orgPaymentSettings } from "@railor/database";
import { getPlatformPaymentFlags, liveMoneyMovementEnabled, listAllPayments, paymentStats } from "@railor/core";
import { AdminHeader } from "../../../components/admin/admin-shell";
import { KillSwitch, UnknownPaymentResolver } from "../../../components/admin/payment-controls";
import { ModeChip, PaymentStatusBadge, formatAmount } from "../../../components/app/payments/payment-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Payments" };

const FILTERS = ["unknown", "processing", "awaiting_funds", "failed", "returned", "completed", "requires_approval", "ready", "blocked"];

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const status = FILTERS.includes(params.status ?? "") ? params.status : undefined;
  const mode = params.mode === "live" || params.mode === "test" ? params.mode : undefined;
  const db = await getDb();
  const [flags, rows, stats, [liveOrgs]] = await Promise.all([
    getPlatformPaymentFlags(),
    listAllPayments({ status, mode, limit: 150 }),
    paymentStats({ sinceDays: 30 }),
    db.select({ n: sql<number>`count(*)::int` }).from(orgPaymentSettings).where(eq(orgPaymentSettings.liveEnabled, true)),
  ]);
  const liveOrgCount = liveOrgs?.n ?? 0;
  const tally = (s: string) => stats.filter((x) => x.status === s).reduce((a, x) => a + x.count, 0);
  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ status, mode, ...patch }).filter((e): e is [string, string] => Boolean(e[1])));
    return `/admin/payments${next.size ? `?${next}` : ""}`;
  };

  return (
    <>
      <AdminHeader
        title="Payments ops"
        description="Every payment across every workspace, the platform kill switch, and the tools to resolve payments whose outcome is unknown. Resolving by hand requires checking the provider's own dashboard first."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <KillSwitch paused={flags.paused} reason={flags.pausedReason} />
        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 text-[13px]">
          <p className="text-[15px] font-semibold">Live money gates</p>
          <Gate ok={liveMoneyMovementEnabled()} label="Deployment switch" detail="RAILOR_LIVE_PAYMENTS=enabled in the environment" />
          <Gate ok={flags.liveProviders.length > 0} label="Providers approved for live" detail={flags.liveProviders.join(", ") || "Approve on Providers after sandbox evidence"} href="/admin/providers" />
          <Gate
            ok={liveOrgCount > 0}
            label="Per-workspace approval + limits"
            detail={liveOrgCount ? `${liveOrgCount} ${liveOrgCount === 1 ? "workspace" : "workspaces"} approved for live` : "No workspace approved yet — grant on Organizations"}
            href="/admin/organizations"
          />
          <Gate ok label="Policy authorization" detail="Every payment needs an allowed or independently approved decision" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {[undefined, "live", "test"].map((m) => (
          <Link key={m ?? "all"} href={qs({ mode: m })} className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${mode === m ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white" : "border-[var(--color-line)]"}`}>
            {m ?? "All modes"}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-[var(--color-line)]" />
        <Link href={qs({ status: undefined })} className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${!status ? "border-[var(--color-orange)] bg-[var(--color-lavender)] text-[var(--color-orange-deep)]" : "border-[var(--color-line)]"}`}>
          All statuses
        </Link>
        {FILTERS.map((s) => (
          <Link key={s} href={qs({ status: s })} className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${status === s ? "border-[var(--color-orange)] bg-[var(--color-lavender)] text-[var(--color-orange-deep)]" : "border-[var(--color-line)]"} ${s === "unknown" && tally(s) ? "text-[var(--color-bad)]" : ""}`}>
            {s.replaceAll("_", " ")} <span className="tabular opacity-60">{tally(s)}</span>
          </Link>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map(({ payment, organizationName }) => (
          <li key={payment.id} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <PaymentStatusBadge status={payment.status} />
              <ModeChip mode={payment.mode} />
              <span className="font-semibold tabular">{formatAmount(payment.amount, payment.sourceCurrency)}</span>
              <span className="text-[var(--color-muted)]">
                → {payment.destinationCurrency} · {payment.destinationCountry}
              </span>
              <span className="text-[var(--color-muted)]">· {payment.selectedProvider ?? "no provider yet"}</span>
              <span className="min-w-0 flex-1 truncate text-right text-[12px] text-[var(--color-muted)]">{organizationName}</span>
              <time className="font-mono text-[11px] text-[var(--color-faint)]">{payment.createdAt.toISOString().slice(0, 16).replace("T", " ")}</time>
            </div>
            {payment.failureMessage ? <p className="mt-1 text-[12px] text-[var(--color-bad)]">{payment.failureMessage}</p> : null}
            <p className="mt-1 break-all font-mono text-[10.5px] text-[var(--color-faint)]">
              {payment.id}
              {payment.providerReference ? ` · ref ${payment.providerReference}` : ""}
            </p>
            {payment.status === "unknown" ? (
              <div className="mt-3 border-t border-[var(--color-line)] pt-3">
                <UnknownPaymentResolver paymentId={payment.id} />
              </div>
            ) : null}
          </li>
        ))}
        {!rows.length ? <li className="rounded-2xl border border-dashed border-[var(--color-line-strong)] px-4 py-6 text-[13px] text-[var(--color-muted)]">No payments match.</li> : null}
      </ul>
    </>
  );
}

function Gate({ ok, label, detail, href }: { ok: boolean; label: string; detail: string; href?: string }) {
  const body = (
    <span className="flex items-start gap-2">
      <span className={`mt-1 size-2 shrink-0 rounded-full ${ok ? "bg-[var(--color-ok)]" : "bg-[var(--color-warn)]"}`} />
      <span>
        <span className="font-semibold">{label}</span>
        <span className="block text-[12px] text-[var(--color-muted)]">{detail}</span>
      </span>
    </span>
  );
  return href ? <Link href={href} className="rounded-lg px-1 py-1 hover:bg-[var(--color-paper)]">{body}</Link> : <div className="px-1 py-1">{body}</div>;
}
