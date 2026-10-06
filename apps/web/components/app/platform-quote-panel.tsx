"use client";

import type { PlatformQuoteCheck } from "@railor/core";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { ProviderLogo } from "./provider-logo";

/** Separate from selectable rows: a Railor FX observation is not a customer payout quote. */
export function PlatformQuotePanel({ checks, now }: { checks: PlatformQuoteCheck[]; now: number }) {
  if (!checks.length) return null;
  return <div className="flex flex-col gap-3" aria-label="Railor-managed provider pricing">
    {checks.map(check => {
      const sandbox = check.environment === "sandbox";
      const q = check.quote;
      const expired = Boolean(q?.expiresAt && Date.parse(q.expiresAt) <= now);
      const available = check.status === "quoted" && q && !expired;
      return <section key={check.providerSlug} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5"><ProviderLogo slug={check.providerSlug} name={check.providerName} size={28} /><span className="text-[13px] font-semibold">{check.providerName}</span></div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-canvas)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{sandbox ? <FlaskConical size={11} /> : <ShieldCheck size={11} />}{sandbox ? "Sandbox · test data" : "Railor account · indicative"}</span>
        </div>
        <p className="mt-4 text-[11px] text-[var(--color-muted)]">{sandbox ? "Simulated FX conversion" : "Reference FX conversion"}</p>
        <p className="mt-1 font-display text-[25px] font-semibold tracking-tight tabular">{available && q.recipientAmount !== undefined ? `${q.recipientAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${q.destinationCurrency}` : expired ? "Refreshing observation…" : "Quote unavailable"}</p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-muted)]">{available ? sandbox ? "Backend integration is working. These are test rates, not real payment prices." : "Quoted for Railor's account, not your business. Payout fees are excluded; this is not an executable customer quote." : expired ? "The previous quote expired. Values stay hidden until a fresh quote arrives." : check.error}</p>
        <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-[var(--color-line)] pt-3 text-[10px] text-[var(--color-muted)]">
          <span>No visitor API key needed · never ranked best</span>
          {available && <span>Observed {new Date(q.observedAt).toISOString().slice(11, 19)} UTC</span>}
        </div>
      </section>;
    })}
  </div>;
}
