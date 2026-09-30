import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PaymentError, getPaymentDetail, syncAuthorization, type PaymentRoutePlan } from "@railor/core";
import { getSession } from "../../../../lib/auth";
import { PaymentActions } from "../../../../components/app/payments/payment-actions";
import { ModeChip, PaymentStatusBadge, formatAmount } from "../../../../components/app/payments/payment-status";
import { RoutePlanView } from "../../../../components/app/payments/route-plan-view";
import { ProviderLogo } from "../../../../components/app/provider-logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment" };

const EXECUTOR_LABEL: Record<string, string> = { railor_sandbox: "Railor sandbox (simulated)", provider: "Your provider account" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization.id;
  let detail: Awaited<ReturnType<typeof getPaymentDetail>>;
  try {
    detail = await getPaymentDetail(org, id);
  } catch (error) {
    if (error instanceof PaymentError && error.status === 404) notFound();
    throw error;
  }
  // An approval granted since the last visit moves the payment to ready.
  if (detail.payment.status === "requires_approval") {
    const synced = await syncAuthorization(detail.payment, { userId: session.user.id, source: "user" });
    if (synced.status !== detail.payment.status) detail = await getPaymentDetail(org, id);
  }
  const { payment, attempts, events, beneficiary, decision } = detail;
  const plan = payment.routePlan as unknown as PaymentRoutePlan;
  const deposit = payment.depositInstructions as Record<string, unknown> | null;
  const canSend = session.role !== "viewer" && (payment.mode === "test" || session.role === "owner" || session.role === "admin");
  const settled = ["completed", "failed", "returned", "cancelled"].includes(payment.status);
  const lastAttempt = attempts.at(-1);
  const simulated = lastAttempt?.executor === "railor_sandbox" && Boolean(payment.feeAmount);

  return (
    <div className="product-page space-y-6">
      <Link href={`/app/payments?mode=${payment.mode}`} className="product-quiet-link">
        ← Payments
      </Link>

      <section className="product-dark p-6 sm:p-8">
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <PaymentStatusBadge status={payment.status} />
            <ModeChip mode={payment.mode} />
            <span className="font-mono text-[11px] text-white/50">{payment.id}</span>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <p className="font-display text-[clamp(2rem,5vw,3.4rem)] font-semibold leading-none tracking-[-0.05em]">{formatAmount(payment.amount, payment.sourceCurrency)}</p>
            <p className="pb-1 text-[15px] text-white/70">
              → {beneficiary?.label ?? "beneficiary"} · {payment.destinationCurrency} · {payment.destinationCountry}
            </p>
          </div>
          <dl className="grid gap-4 border-t border-white/15 pt-4 text-[12.5px] sm:grid-cols-4">
            <Item label="Provider" value={payment.selectedProvider ?? (lastAttempt ? `${lastAttempt.providerSlug} (${lastAttempt.status})` : settled || payment.status === "blocked" ? "None" : "Chosen at send")} />
            <Item label="Provider reference" value={payment.providerReference ?? "—"} mono />
            <Item label={simulated ? "Fee (simulated)" : "Fee"} value={payment.feeAmount ? formatAmount(payment.feeAmount, payment.feeCurrency) : "Not reported"} />
            <Item label="Recipient gets" value={payment.recipientAmount ? formatAmount(payment.recipientAmount, payment.destinationCurrency) : "Provider-reported at settlement"} />
          </dl>
          {payment.failureMessage ? <p className="rounded-lg bg-white/10 px-3 py-2 text-[13px] text-[#ffd2c2]">{payment.failureMessage}</p> : null}
          {settled ? null : (
            <div className="rounded-xl bg-[var(--color-surface)] p-4 text-[var(--color-ink)]">
              <PaymentActions
                id={payment.id}
                status={payment.status}
                mode={payment.mode}
                amountLabel={formatAmount(payment.amount, payment.sourceCurrency)}
                decisionId={payment.decisionId}
                canSend={canSend}
              />
            </div>
          )}
        </div>
      </section>

      {deposit && payment.status === "awaiting_funds" ? (
        <section className="product-panel p-5">
          <h2 className="font-display text-xl font-semibold">Fund this payment</h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">The provider is waiting for the source funds. Send exactly this, and the payout continues automatically.</p>
          <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
            {Object.entries(deposit).map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-lg bg-[var(--color-paper)] px-3 py-2">
                <dt className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-faint)]">{k.replaceAll("_", " ")}</dt>
                <dd className="break-all font-mono text-[12.5px]">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <div className="product-panel p-5 sm:p-6">
          <span className="product-eyebrow">Route / plan</span>
          <h2 className="font-display text-2xl font-semibold">How Railor routes it</h2>
          <div className="mt-4">{plan?.candidates ? <RoutePlanView plan={plan} selectedProvider={payment.selectedProvider} outcomes={Object.fromEntries(attempts.map((a) => [a.providerSlug, a.status]))} /> : null}</div>
        </div>
        <div className="flex flex-col gap-5">
          <div className="product-panel p-5">
            <span className="product-eyebrow">Controls</span>
            <ul className="mt-2 flex flex-col gap-2 text-[13px]">
              <li className="flex justify-between gap-3">
                <span className="text-[var(--color-muted)]">Policy decision</span>
                {decision ? (
                  <Link href={`/app/decisions/${decision.id}`} className="font-semibold underline">
                    {decision.status.replaceAll("_", " ")} ↗
                  </Link>
                ) : (
                  <span>—</span>
                )}
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-[var(--color-muted)]">Beneficiary</span>
                <span className="text-right">
                  {beneficiary?.holderName}
                  <br />
                  <span className="font-mono text-[12px] text-[var(--color-muted)]">{beneficiary?.displayHint}</span>
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-[var(--color-muted)]">Reference</span>
                <span>{payment.reference ?? "—"}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-[var(--color-muted)]">Pinned provider</span>
                <span>{payment.pinnedProvider ?? "Auto-route"}</span>
              </li>
            </ul>
          </div>
          <div className="product-panel p-5">
            <span className="product-eyebrow">Attempts</span>
            {attempts.length ? (
              <ol className="mt-2 flex flex-col gap-2">
                {attempts.map((a) => (
                  <li key={a.id} className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-[12.5px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-[var(--color-muted)]">#{a.attemptNumber}</span>
                      <ProviderLogo slug={a.providerSlug} name={a.providerSlug} size={18} />
                      <span className="font-semibold">{a.providerSlug}</span>
                      <PaymentStatusBadge status={a.status === "accepted" ? "processing" : a.status === "rejected" ? "failed" : a.status} />
                    </div>
                    <p className="mt-1 text-[11.5px] text-[var(--color-muted)]">
                      {EXECUTOR_LABEL[a.executor]} · {a.environment}
                      {a.providerStatus ? ` · provider says “${a.providerStatus}”` : ""}
                    </p>
                    {a.errorMessage ? <p className="mt-1 text-[11.5px] text-[var(--color-bad)]">{a.errorMessage}</p> : null}
                    <p className="mt-1 break-all font-mono text-[10.5px] text-[var(--color-faint)]">idempotency {a.idempotencyKey}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-[12.5px] text-[var(--color-muted)]">Nothing has been sent to a provider yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <span className="product-eyebrow">Record / append-only</span>
        <h2 className="font-display text-2xl font-semibold">Timeline</h2>
        <ol className="product-panel divide-y divide-[var(--color-line)]">
          {events.map((e) => (
            <li key={e.id} className="grid gap-1 px-4 py-3 text-[13px] sm:grid-cols-[190px_1fr_auto] sm:items-center">
              <time className="product-mono text-[var(--color-muted)]">{e.createdAt.toISOString().slice(0, 19).replace("T", " ")} UTC</time>
              <span>
                <span className="font-semibold">{e.type}</span>
                {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus ? (
                  <span className="text-[var(--color-muted)]">
                    {" "}
                    · {e.fromStatus.replaceAll("_", " ")} → {e.toStatus.replaceAll("_", " ")}
                  </span>
                ) : null}
                {typeof e.detail.reason === "string" ? <span className="text-[var(--color-muted)]"> · {e.detail.reason}</span> : null}
              </span>
              <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]">{e.source.replaceAll("_", " ")}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[10.5px] uppercase tracking-[0.12em] text-white/45">{label}</dt>
      <dd className={`break-all ${mono ? "font-mono text-[12px]" : ""}`}>{value}</dd>
    </div>
  );
}
