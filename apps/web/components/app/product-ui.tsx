import type { ReactNode } from "react";

export function ProductHeader({ eyebrow, title, description, value, valueLabel, action }: { eyebrow: string; title: string; description: string; value?: string | number; valueLabel?: string; action?: ReactNode }) {
  return <header className="product-header">
    <div><span className="product-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p>{action && <div className="mt-4">{action}</div>}</div>
    {value !== undefined && <div className="product-header-aside"><strong className="tabular">{value}</strong><span>{valueLabel}</span></div>}
  </header>;
}

export function ProductBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll("_", " ");
  const tone = ["active", "approved", "allow", "allowed", "pass", "healthy", "connected", "completed", "investigate"].includes(normalized) ? "good"
    : ["pending", "approval required", "insufficient data", "unknown", "draft", "claimed", "queued", "review"].includes(normalized) ? "warn"
    : ["deny", "denied", "no verified route", "rejected", "revoked", "expired", "failed", "fail", "blocked", "dismissed"].includes(normalized) ? "bad" : "neutral";
  return <span className="product-badge" data-tone={tone}>{normalized}</span>;
}

export function ProductEmpty({ mark, title, description, action }: { mark: string; title: string; description: string; action?: ReactNode }) {
  return <div className="product-empty"><span className="product-empty-mark" aria-hidden="true">{mark}</span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

const RULE_LABELS: Record<string, string> = {
  requireExactRouteEvidence: "Exact route evidence required",
  requireConfirmedEntityEligibility: "Confirmed entity eligibility required",
  requireCustomerConnectedProvider: "Connected provider required",
  requireLiveQuote: "Live quote required",
  denyDuringActiveIncident: "Blocked during active incidents",
  allowAggregators: "Aggregators allowed",
  preferDirectProvider: "Prefer direct providers",
  allowPrefunding: "Prefunding allowed",
  humanApprovalAboveAmount: "Approval above",
  maximumEvidenceAgeHours: "Max evidence age (h)",
  maximumKnownCostBps: "Max known cost (bps)",
  maximumEtaMinutes: "Max settlement (min)",
  minimumObservedReliability: "Min observed reliability",
  minimumRouteCertainty: "Min route certainty",
  providerAllowlist: "Allowed providers",
  providerDenylist: "Blocked providers",
  allowedAssets: "Allowed assets",
  deniedAssets: "Blocked assets",
  allowedNetworks: "Allowed networks",
  deniedNetworks: "Blocked networks",
};

/** A policy's rules as readable chips — the JSON stays available, but nobody has to read it. */
export function RuleSummary({ rules }: { rules: Record<string, unknown> }) {
  const entries = Object.entries(rules).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0));
  const on = entries.filter(([, v]) => v === true);
  const values = entries.filter(([, v]) => typeof v === "number" || typeof v === "string" || Array.isArray(v));
  return <div className="space-y-3">
    {on.length ? <div className="flex flex-wrap gap-1.5">{on.map(([k]) => <span key={k} className="rounded-full border border-[var(--color-orange)]/40 bg-[var(--color-lavender)] px-2.5 py-1 text-[12px] font-semibold text-[var(--color-orange-deep)]">✓ {RULE_LABELS[k] ?? k}</span>)}</div> : null}
    {values.length ? <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">{values.map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line)] pb-1.5"><dt className="text-[var(--color-muted)]">{RULE_LABELS[k] ?? k}</dt><dd className="product-mono text-right">{Array.isArray(v) ? v.join(", ") : String(v)}</dd></div>)}</dl> : null}
    {!on.length && !values.length ? <p className="text-[13px] text-[var(--color-muted)]">Defaults only — no extra guardrails.</p> : null}
  </div>;
}
