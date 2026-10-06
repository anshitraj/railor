"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { ConnectionCard, type ConnectionCardProps } from "./connection-card";

export function ConnectionDirectory({ providers, selectedSlug }: { providers: ConnectionCardProps[]; selectedSlug: string | null }) {
  const [query, setQuery] = useState("");
  const selected = providers.find((provider) => provider.slug === selectedSlug);
  const matches = providers.filter((provider) => `${provider.name} ${provider.slug} ${provider.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const remaining = matches.filter((provider) => Boolean(query) || provider.slug !== selected?.slug);
  const available = remaining.filter((provider) => provider.hasAdapter);
  const planned = remaining.filter((provider) => !provider.hasAdapter);
  const card = (provider: ConnectionCardProps) => <ConnectionCard key={provider.slug} {...provider} />;

  return <div className="flex flex-col gap-5">
    <label className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5">
      <Search size={16} className="text-[var(--color-muted)]" aria-hidden />
      <input aria-label="Search provider connections" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${providers.length} providers`} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
    </label>
    {selected && !query ? <section aria-label="Selected provider connection" className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold">Connection options for {selected.name}</h2>
      {card({ ...selected, initialOpen: selected.hasAdapter && selected.canManage && selected.connections.length === 0 })}
    </section> : null}
    {selectedSlug && !selected ? <p role="status" className="text-[13px] text-[var(--color-muted)]">This provider is not in the connection directory yet. Search the providers below.</p> : null}
    {available.length ? <section aria-label="Available provider integrations" className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold">Available integrations · {available.length}</h2>
      <div className="grid gap-3">{available.map(card)}</div>
    </section> : null}
    {planned.length ? <details key={query ? "search" : "browse"} open={Boolean(query)} className="rounded-xl border border-[var(--color-line)] px-4 py-3">
      <summary className="cursor-pointer text-[13px] font-semibold">Request a connection · {planned.length}</summary>
      <p className="mt-2 text-[12.5px] text-[var(--color-muted)]">These providers are tracked for research or public pricing. Account integrations require provider access and development; partnerships are not confirmed.</p>
      <div className="mt-3 grid gap-3">{planned.map(card)}</div>
    </details> : null}
    {!matches.length ? <p role="status" className="text-[13px] text-[var(--color-muted)]">No providers match this search.</p> : null}
  </div>;
}
