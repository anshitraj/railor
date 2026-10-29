"use client";

import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { ProviderLogo } from "../app/provider-logo";

export interface PricingDirectoryEntry { slug: string; name: string; website: string | null; sourceStatus: string; pricing: string; pricingUrl?: string }

export function PricingSourceDirectory({ entries }: { entries: PricingDirectoryEntry[] }) {
  const [query, setQuery] = useState("");
  const filtered = entries.filter((entry) => `${entry.name} ${entry.slug} ${entry.pricing}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] p-4"><label className="flex min-w-0 items-center gap-2 text-[var(--color-muted)]"><Search size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search provider source audit" placeholder="Search any provider" className="min-w-0 bg-transparent text-xs outline-none" /></label><span className="text-xs text-[var(--color-muted)]">{filtered.length} of {entries.length} checked sites</span></div>
    <ul className="max-h-[580px] overflow-y-auto overscroll-contain" aria-label="Provider source audit">{filtered.map((entry) => <li key={entry.slug} className="flex gap-3 border-b border-[var(--color-line)] p-4 last:border-0"><ProviderLogo slug={entry.slug} name={entry.name} size={28} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs">{entry.name}</strong><span className="text-[10px] text-[var(--color-muted)]">{entry.sourceStatus}</span></div><p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{entry.pricing}</p>{(entry.pricingUrl || entry.website) && <a href={entry.pricingUrl ?? entry.website!} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-[11px] text-[var(--color-orange-deep)]">Official source<ArrowUpRight size={11} /></a>}</div></li>)}</ul>
  </div>;
}
