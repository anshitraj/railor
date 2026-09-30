import { ROUTING_PRESET_LABEL, type PaymentRoutePlan, type RouteDimension } from "@railor/core/payments-view";
import { ProviderLogo } from "../provider-logo";

const DIM_LABEL: Record<RouteDimension, string> = {
  health: "Health",
  reliability: "Reliability",
  cost: "Cost",
  speed: "Speed",
  limits: "Limits",
  preference: "Preference",
};

function executorLabel(kind: string, environment?: string) {
  if (kind === "railor_sandbox") return "Railor sandbox (simulated)";
  return environment === "production" ? "Your production account" : "Your sandbox account";
}

/**
 * The route plan, readable: who will be tried and in what order, why each
 * scored as it did, and who was excluded — with the reason, never silently.
 */
function RouteBadge({ slug, index, selectedProvider, outcomes }: { slug: string; index: number; selectedProvider?: string | null; outcomes?: Record<string, string> }) {
  if (selectedProvider === slug) return <span className="product-badge" data-tone="good">executed</span>;
  const outcome = outcomes?.[slug];
  if (outcome) return <span className="product-badge" data-tone={outcome === "unknown" ? "warn" : "bad"}>{outcome}</span>;
  if (selectedProvider || (outcomes && Object.keys(outcomes).length)) return <span className="text-[11px] text-[var(--color-muted)]">not tried</span>;
  return index === 0 ? <span className="product-badge" data-tone="neutral">first choice</span> : <span className="text-[11px] text-[var(--color-muted)]">fallback</span>;
}

export function RoutePlanView({
  plan,
  selectedProvider,
  outcomes,
  compact = false,
}: {
  plan: PaymentRoutePlan;
  selectedProvider?: string | null;
  /** Latest attempt status per provider, once the payment was sent. */
  outcomes?: Record<string, string>;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-muted)]">
        <span className="rounded-full bg-[var(--color-sand)] px-2 py-0.5 font-semibold text-[var(--color-ink-soft)]">{ROUTING_PRESET_LABEL[plan.preset] ?? plan.preset}</span>
        <span>
          Weights: {Object.entries(plan.weights).map(([k, w]) => `${DIM_LABEL[k as RouteDimension]} ${w}`).join(" · ")}
        </span>
      </div>
      {plan.candidates.length ? (
        <ol className="flex flex-col gap-2">
          {plan.candidates.map((c, index) => (
            <li
              key={c.providerSlug}
              className={`rounded-xl border px-4 py-3 ${selectedProvider === c.providerSlug ? "border-[var(--color-orange)] bg-[var(--color-lavender)]/50" : "border-[var(--color-line)] bg-[var(--color-surface)]"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-ink)] font-mono text-[11px] font-bold text-white">{index + 1}</span>
                <ProviderLogo slug={c.providerSlug} name={c.providerName} size={22} />
                <span className="text-[14px] font-semibold">{c.providerName}</span>
                <RouteBadge slug={c.providerSlug} index={index} selectedProvider={selectedProvider} outcomes={outcomes} />
                <span className="flex-1" />
                <span className="font-mono text-[12px] tabular text-[var(--color-ink-soft)]">score {c.score.toFixed(2)}</span>
                <span className="font-mono text-[11px] tabular text-[var(--color-muted)]" title="Share of the scoring weight Railor had real data for">conf {Math.round(c.confidence * 100)}%</span>
              </div>
              <p className="mt-1 text-[12px] text-[var(--color-muted)]">
                {executorLabel(c.executor.kind, "environment" in c.executor ? c.executor.environment : undefined)}
                {c.executorNote ? ` — ${c.executorNote}` : ""}
              </p>
              {!compact ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11.5px] font-semibold text-[var(--color-muted)]">Why this score</summary>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {(Object.entries(c.dimensions) as Array<[RouteDimension, { score: number | null; weight: number; detail: string }]>).map(([key, d]) => (
                      <li key={key} className="flex items-start gap-2 text-[12px]">
                        <span className="w-20 shrink-0 font-semibold text-[var(--color-ink-soft)]">{DIM_LABEL[key]}</span>
                        <span className="w-10 shrink-0 font-mono tabular text-[var(--color-muted)]">{d.score === null ? "—" : d.score.toFixed(2)}</span>
                        <span className="text-[var(--color-muted)]">{d.detail}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--color-line-strong)] px-4 py-3 text-[13px] text-[var(--color-muted)]">No provider can execute this route right now.</p>
      )}
      {plan.excluded.length ? (
        <details className="rounded-xl border border-[var(--color-line)] px-4 py-2" open={!plan.candidates.length}>
          <summary className="cursor-pointer text-[12px] font-semibold text-[var(--color-muted)]">Excluded · {plan.excluded.length}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {plan.excluded.map((e) => (
              <li key={e.providerSlug} className="text-[12px]">
                <span className="font-semibold">{e.providerName}</span> <span className="text-[var(--color-muted)]">— {e.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
