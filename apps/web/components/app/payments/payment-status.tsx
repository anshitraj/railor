const TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  completed: "good",
  ready: "good",
  processing: "warn",
  submitting: "warn",
  awaiting_funds: "warn",
  requires_approval: "warn",
  unknown: "warn",
  failed: "bad",
  blocked: "bad",
  returned: "bad",
  cancelled: "neutral",
};

const LABEL: Record<string, string> = {
  requires_approval: "needs approval",
  awaiting_funds: "awaiting funds",
  unknown: "outcome unknown",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <span className="product-badge" data-tone={TONE[status] ?? "neutral"}>
      {LABEL[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}

export function ModeChip({ mode }: { mode: string }) {
  return mode === "live" ? (
    <span className="rounded-full bg-[var(--color-ink)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">Live</span>
  ) : (
    <span className="rounded-full border border-dashed border-[var(--color-line-strong)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--color-muted)]">Test</span>
  );
}

export function formatAmount(amount: string | number | null | undefined, currency?: string | null) {
  if (amount === null || amount === undefined) return "—";
  const n = Number(amount);
  const text = Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : String(amount);
  return currency ? `${text} ${currency}` : text;
}
