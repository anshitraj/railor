"use client";

import { useState } from "react";
import { ArrowUpRight, Check, FileCheck2 } from "lucide-react";
import { cn } from "@railor/ui";
import { COMPARISON_PROVIDERS, FEATURE_REVIEWED_ON, featureRows } from "../../lib/provider-feature-comparison";
import { ProviderLogo } from "./provider-logo";

export function ProviderFeatureComparison() {
  const [differences, setDifferences] = useState(false);
  const rows = featureRows(differences);
  return (
    <section id="provider-features" aria-labelledby="provider-features-title" className="provider-comparison scroll-mt-28 rounded-[24px] border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex flex-wrap items-end justify-between gap-5 p-5 sm:p-7">
        <div className="max-w-xl">
          <p className="product-eyebrow mb-2">Beyond the price</p>
          <h2 id="provider-features-title" className="font-display text-[26px] font-semibold leading-tight tracking-[-0.04em] sm:text-[32px]">Different rails. Clear trade-offs.</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">Compare published features before checking your exact route. No account or API key needed to explore.</p>
        </div>
        <button type="button" aria-pressed={differences} onClick={() => setDifferences(v => !v)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-3.5 py-2 text-[12px] font-semibold transition-colors hover:bg-[var(--color-canvas)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]">
          <span aria-hidden className={cn("flex h-4 w-4 items-center justify-center rounded border", differences ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white" : "border-[var(--color-muted)]")} >{differences && <Check size={11} />}</span>
          Show differences
        </button>
      </div>
      <div role="region" aria-label="Provider feature comparison; scroll horizontally on small screens" tabIndex={0} className="overflow-x-auto border-y border-[var(--color-line)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]">
        <table className="w-full min-w-[790px] table-fixed border-collapse text-left">
          <caption className="sr-only">PayZoll, Skydo and Airwallex. Published provider claims reviewed {FEATURE_REVIEWED_ON}; not a route guarantee or live quote.</caption>
          <thead>
            <tr className="bg-[var(--color-canvas)]">
              <th scope="col" className="w-[19%] px-5 py-6 text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--color-muted)]">Capabilities</th>
              {COMPARISON_PROVIDERS.map(p => <th key={p.slug} scope="col" className={cn("px-5 py-6 font-normal", p.slug === "payzoll" && "bg-orange-500/[0.04]")}>
                <div className="mb-2 flex items-center gap-2.5"><ProviderLogo slug={p.slug} name={p.name} size={30} /><span className="text-[16px] font-semibold tracking-tight">{p.name}</span></div>
                <p className="text-[11px] text-[var(--color-muted)]">{p.description}</p>
              </th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => <tr key={row.key} className="border-t border-[var(--color-line)] transition-colors hover:bg-[var(--color-canvas)]/60">
              <th scope="row" className="px-5 py-4 align-top text-[12px] font-medium">
                {rows[index - 1]?.group !== row.group && <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">{row.group}</span>}
                {row.label}
              </th>
              {COMPARISON_PROVIDERS.map(p => {
                const cell = row.cells[p.slug];
                return <td key={p.slug} className={cn("px-5 py-4 align-top", p.slug === "payzoll" && "bg-orange-500/[0.025]")}>
                  <div className={cn("text-[12px] font-medium leading-relaxed", cell.status === "unknown" && "text-[var(--color-muted)]")}>
                    {cell.url ? <a href={cell.url} target="_blank" rel="noopener noreferrer" aria-label={`${p.name}: ${row.label} — source`} className="group inline hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2">{cell.value}<ArrowUpRight size={11} aria-hidden className="ml-1 inline opacity-40 transition-opacity group-hover:opacity-100" /></a> : cell.value}
                  </div>
                  {cell.detail && <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--color-muted)]">{cell.detail}</p>}
                </td>;
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 text-[11px] leading-relaxed text-[var(--color-muted)] sm:px-7">
        <p className="flex max-w-2xl items-start gap-2"><FileCheck2 size={15} className="mt-0.5 shrink-0" />Published claims, not independent verification. Unknown does not mean unsupported. Fees, eligibility and availability must be checked for the exact transaction.</p>
        <span className="shrink-0 font-mono text-[10px]">Source review · {FEATURE_REVIEWED_ON}</span>
      </div>
    </section>
  );
}
