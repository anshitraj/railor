"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { ProviderLink } from "../../lib/provider-sites";

export interface HandoffSetup {
  provider: string;
  from: string;
  to: string;
  amount: number;
  /** How the transfer is paid for, when known. */
  funding: string | null;
  /** What Railor saw arrive, and when that price was collected. */
  recipientAmount: number | null;
  observedAt: string | null;
  carries: ProviderLink["carries"];
}

const money = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : `${date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
};

/**
 * What to enter at the provider so its price can be checked against Railor's:
 * the amount, the pair, how it's paid, and the figure Railor saw with its time.
 */
export function ProviderHandoff({ setup }: { setup: HandoffSetup }) {
  const [copied, setCopied] = useState(false);
  const seen = setup.observedAt ? when(setup.observedAt) : null;
  const lines = [
    `Send ${money(setup.amount)} ${setup.from} → ${setup.to}`,
    setup.funding ? `Pay by ${setup.funding}` : null,
    setup.recipientAmount !== null ? `Railor saw ${money(setup.recipientAmount)} ${setup.to} arrive${seen ? ` (${seen})` : ""}` : null,
  ].filter((line): line is string => Boolean(line));
  const intro = setup.carries === "amount"
    ? `${setup.provider} opens with this amount and pair filled in.`
    : setup.carries === "corridor"
      ? `${setup.provider} opens on this route. Enter:`
      : `Enter this at ${setup.provider}:`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* Clipboard blocked: the lines stay on screen to read. */ }
  }

  return (
    <div className="grid gap-1.5 rounded-2xl border border-[var(--color-line)] bg-[var(--color-canvas)] px-3.5 py-3 text-[12.5px]" aria-label={`Your setup for ${setup.provider}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-[var(--color-ink-soft)]">{intro}</span>
        <button type="button" onClick={() => void copy()} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 font-semibold text-[var(--color-orange-deep)] hover:bg-[var(--color-surface)]" aria-live="polite">
          {copied ? <><Check size={13} aria-hidden />Copied</> : <><Copy size={13} aria-hidden />Copy</>}
        </button>
      </div>
      <ul className="grid gap-0.5 text-[var(--color-ink)]">
        {lines.map((line) => <li key={line} className="tabular-nums">{line}</li>)}
      </ul>
      {setup.recipientAmount !== null ? <p className="text-[var(--color-muted)]">If {setup.provider} shows a different figure, its price moved or your account gets different terms.</p> : null}
    </div>
  );
}
