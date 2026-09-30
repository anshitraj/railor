import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getOrgPaymentSettings, getPlatformPaymentFlags, liveMoneyMovementEnabled, listPayments, paymentStats } from "@railor/core";
import { getSession } from "../../../lib/auth";
import { ProductEmpty, ProductHeader } from "../../../components/app/product-ui";
import { ModeChip, PaymentStatusBadge, formatAmount } from "../../../components/app/payments/payment-status";
import { ProviderLogo } from "../../../components/app/provider-logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

const STATUS_FILTERS = ["ready", "requires_approval", "processing", "awaiting_funds", "unknown", "completed", "failed", "returned", "blocked", "cancelled"];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization.id;
  const params = await searchParams;
  const mode = params.mode === "live" ? "live" : "test";
  const status = STATUS_FILTERS.includes(params.status ?? "") ? params.status : undefined;
  const [rows, stats, settings, flags] = await Promise.all([
    listPayments(org, { mode, status, limit: 100 }),
    paymentStats({ organizationId: org, sinceDays: 30 }),
    getOrgPaymentSettings(org),
    getPlatformPaymentFlags(),
  ]);
  const modeStats = stats.filter((s) => s.mode === mode);
  const completedCount = modeStats.filter((s) => s.status === "completed").reduce((sum, s) => sum + s.count, 0);
  const openCount = modeStats.filter((s) => ["processing", "awaiting_funds", "unknown", "submitting"].includes(s.status)).reduce((sum, s) => sum + s.count, 0);
  const liveReady = liveMoneyMovementEnabled() && settings.liveEnabled;
  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ mode, status, ...patch }).filter((e): e is [string, string] => Boolean(e[1])));
    return `/app/payments?${next}`;
  };

  return (
    <div className="product-page space-y-6">
      <ProductHeader
        eyebrow="Money movement / execution"
        title="Payments"
        description="Send payouts through your own connected provider accounts. Every payment is checked against your policy, routed across eligible providers, and tracked to settlement — funds never touch Railor."
        value={completedCount.toLocaleString("en-US")}
        valueLabel={`${completedCount === 1 ? "payment" : "payments"} settled · ${mode} · 30 days`}
        action={
          session.role !== "viewer" ? (
            <Link href="/app/payments/new" className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-[13px] font-bold text-white transition hover:bg-[var(--color-orange-deep)]">
              <Plus size={15} /> New payment
            </Link>
          ) : undefined
        }
      />

      {flags.paused ? (
        <div role="status" className="rounded-xl border border-[var(--color-bad)]/30 bg-[var(--color-bad-bg)] p-4 text-[13px]">
          <strong>Payments are paused by Railor operations.</strong> {flags.pausedReason ?? ""} Nothing can be submitted until they resume; open payments keep settling.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Mode" className="inline-flex rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] p-1">
          {(["test", "live"] as const).map((m) => (
            <Link
              key={m}
              role="tab"
              aria-selected={mode === m}
              href={qs({ mode: m, status: undefined })}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${mode === m ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}
            >
              {m === "test" ? "Test" : "Live"}
            </Link>
          ))}
        </div>
        <span className="text-[12.5px] text-[var(--color-muted)]">{openCount} open</span>
        <span className="flex-1" />
        <Link href="/app/beneficiaries" className="text-[12.5px] font-semibold text-[var(--color-orange-deep)] underline underline-offset-2">
          Beneficiaries
        </Link>
        <Link href="/app/routing" className="text-[12.5px] font-semibold text-[var(--color-orange-deep)] underline underline-offset-2">
          Routing settings
        </Link>
      </div>

      {mode === "test" ? (
        <div className="rounded-xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-paper)] p-4 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
          <strong className="text-[var(--color-ink)]">Test mode.</strong> Payments run against your providers&apos; sandbox APIs where you&apos;ve connected them, and Railor&apos;s simulator everywhere else. The cents choose the simulated outcome:{" "}
          <code>.13</code> insufficient funds (falls back to the next provider) · <code>.66</code> compliance rejection · <code>.55</code> awaiting funds · <code>.77</code> returned · <code>.99</code> outcome unknown, then resolved.
        </div>
      ) : !liveReady ? (
        <div className="rounded-xl border border-[var(--color-warn)]/30 bg-[var(--color-warn-bg)] p-4 text-[12.5px] leading-relaxed">
          <strong>Live payments are not enabled for this workspace.</strong>{" "}
          {!liveMoneyMovementEnabled()
            ? "This deployment has live money movement switched off (RAILOR_LIVE_PAYMENTS)."
            : "Railor enables them after reviewing your account; you'll also need a production connection to a provider approved for live payouts."}{" "}
          <Link href="/app/settings/connections" className="font-semibold underline">
            Connections →
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <Link href={qs({ status: undefined })} className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${!status ? "border-[var(--color-orange)] bg-[var(--color-lavender)] text-[var(--color-orange-deep)]" : "border-[var(--color-line)]"}`}>
          All
        </Link>
        {STATUS_FILTERS.map((s) => {
          const count = modeStats.filter((x) => x.status === s).reduce((sum, x) => sum + x.count, 0);
          return (
            <Link key={s} href={qs({ status: s })} className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${status === s ? "border-[var(--color-orange)] bg-[var(--color-lavender)] text-[var(--color-orange-deep)]" : "border-[var(--color-line)] text-[var(--color-ink-soft)]"}`}>
              {s.replaceAll("_", " ")} <span className="tabular opacity-60">{count}</span>
            </Link>
          );
        })}
      </div>

      {rows.length ? (
        <div className="product-panel">
          {rows.map(({ payment, beneficiaryLabel, beneficiaryHint }) => (
            <Link key={payment.id} href={`/app/payments/${payment.id}`} className="product-row">
              <span className="product-row-primary flex flex-wrap items-center gap-2">
                <PaymentStatusBadge status={payment.status} />
                <span className="tabular">{formatAmount(payment.amount, payment.sourceCurrency)}</span>
                <span className="text-[var(--color-orange-deep)]">→</span>
                <span>{payment.destinationCurrency}</span>
              </span>
              <span className="product-row-secondary">
                {beneficiaryLabel} · <span className="font-mono">{beneficiaryHint}</span>
              </span>
              <span className="product-row-secondary inline-flex items-center gap-1.5">
                {payment.selectedProvider ? <ProviderLogo slug={payment.selectedProvider} name={payment.selectedProvider} size={18} /> : null}
                {payment.selectedProvider ?? (payment.status === "ready" ? "Not sent yet" : "—")}
              </span>
              <span className="flex items-center gap-2">
                <ModeChip mode={payment.mode} />
                <time className="product-mono text-[var(--color-muted)]">{payment.createdAt.toISOString().slice(0, 16).replace("T", " ")}</time>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <ProductEmpty
          mark="→"
          title={status ? `No ${status.replaceAll("_", " ")} ${mode} payments` : `No ${mode} payments yet`}
          description={mode === "test" ? "Create a test payment to see the full flow — policy check, routing, submission and settlement — without moving real money." : "Live payments appear here once your workspace is enabled and you send one."}
          action={session.role !== "viewer" ? <Link href="/app/payments/new" className="product-quiet-link">Create a payment →</Link> : undefined}
        />
      )}
    </div>
  );
}
