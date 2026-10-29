import { redirect } from "next/navigation";
import { getPlatformPaymentFlags, listPayments } from "@railor/core";
import { getSession } from "../../../lib/auth";
import { getPaymentHistorySummary, HISTORY_STATUSES, HISTORY_STATUS_LABEL } from "../../../lib/payment-history";
import { PaymentHistory } from "../../../components/app/payments/payment-history";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const organizationId = session.organization.id;
  const params = await searchParams;
  const mode = params.mode === "live" ? "live" : "test";
  const status = HISTORY_STATUSES.find((value) => value === params.status);
  const [rows, summary, flags] = await Promise.all([
    listPayments(organizationId, { mode, status, limit: 100 }),
    getPaymentHistorySummary(organizationId, mode),
    getPlatformPaymentFlags(),
  ]);

  return <PaymentHistory key={`${mode}:${status ?? "all"}`} mode={mode} status={status} summary={summary}
    filters={HISTORY_STATUSES.map((value) => ({ value, label: HISTORY_STATUS_LABEL[value]!, count: summary.counts[value] ?? 0 }))}
    paused={flags.paused} pausedReason={flags.pausedReason}
    rows={rows.map(({ payment, beneficiaryLabel, beneficiaryHint }) => ({
      id: payment.id, status: payment.status, amount: payment.amount, sourceCurrency: payment.sourceCurrency,
      destinationCurrency: payment.destinationCurrency, provider: payment.selectedProvider,
      beneficiaryLabel, beneficiaryHint, reference: payment.reference, createdAt: payment.createdAt.toISOString(),
    }))} />;
}
