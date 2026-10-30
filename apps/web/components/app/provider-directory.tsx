"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, ChevronDown, Code2, FlaskConical, Globe2, Search, SlidersHorizontal, Webhook, X } from "lucide-react";
import { EmptyState, Freshness, cn } from "@railor/ui";
import { CurrencyLogo } from "../marketing/currency-logo";
import { NetworkLogo } from "../marketing/network-logo";
import { ProviderLogo } from "./provider-logo";

export interface DirectoryProvider {
  slug: string; name: string; category: string; description: string;
  products: string[]; assets: string[]; networks: string[];
  countryCount: number; currencyCount: number; customerTypes: string[];
  hasApi: boolean; hasSandbox: boolean; hasWebhooks: boolean;
  headquartersCountry: string | null; lastVerifiedAt: string | null;
  profileAvailable?: boolean; sourceUrl?: string; pricingSummary?: string;
}

const PRODUCTS: Record<string, string> = {
  payout: "Payouts", collection: "Collections", off_ramp: "Off-ramp", on_ramp: "On-ramp",
  wallet: "Wallets", virtual_account: "Virtual accounts", treasury: "Treasury",
  kyc_kyb: "KYC / KYB", card_issuing: "Card issuing", card_funding: "Card funding",
};
type Sort = "name" | "coverage" | "fresh";
const control = "min-h-11 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-orange)]";

/** Search first. Detailed evidence and technical filters are available on demand. */
export function ProviderDirectory({ providers, basePath = "/app/providers" }: { providers: DirectoryProvider[]; basePath?: string }) {
  const reduce = useReducedMotion();
  const [product, setProduct] = useState("");
  const [asset, setAsset] = useState("");
  const [network, setNetwork] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [apiOnly, setApiOnly] = useState(false);
  const [sandboxOnly, setSandboxOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(12);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => setLimit(12), [query, product, asset, network, customerType, apiOnly, sandboxOnly, sort]);

  const options = useMemo(() => {
    const count = (get: (provider: DirectoryProvider) => string[]) => {
      const values = new Map<string, number>();
      for (const provider of providers) for (const value of new Set(get(provider))) values.set(value, (values.get(value) ?? 0) + 1);
      return [...values.entries()].sort(([a], [b]) => a.localeCompare(b));
    };
    return { products: count(p => p.products), assets: count(p => p.assets), networks: count(p => p.networks) };
  }, [providers]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return providers.filter(provider => (!product || provider.products.includes(product))
      && (!asset || provider.assets.includes(asset)) && (!network || provider.networks.includes(network))
      && (!customerType || provider.customerTypes.includes(customerType)) && (!apiOnly || provider.hasApi) && (!sandboxOnly || provider.hasSandbox)
      && (!search || `${provider.name} ${provider.category} ${provider.description} ${provider.assets.join(" ")} ${provider.networks.join(" ")}`.toLowerCase().includes(search)))
      .sort((a, b) => (sort === "coverage" ? b.countryCount - a.countryCount : sort === "fresh" ? (Date.parse(b.lastVerifiedAt ?? "") || 0) - (Date.parse(a.lastVerifiedAt ?? "") || 0) : 0) || a.name.localeCompare(b.name));
  }, [providers, query, product, asset, network, customerType, apiOnly, sandboxOnly, sort]);
  const active = [
    ...(product ? [{ label: PRODUCTS[product] ?? product, clear: () => setProduct("") }] : []),
    ...(asset ? [{ label: asset, clear: () => setAsset("") }] : []),
    ...(network ? [{ label: network, clear: () => setNetwork("") }] : []),
    ...(customerType ? [{ label: customerType === "business" ? "Businesses" : "Individuals", clear: () => setCustomerType("") }] : []),
    ...(apiOnly ? [{ label: "Has API", clear: () => setApiOnly(false) }] : []),
    ...(sandboxOnly ? [{ label: "Has sandbox", clear: () => setSandboxOnly(false) }] : []),
  ];
  function clearAll() { setProduct(""); setAsset(""); setNetwork(""); setCustomerType(""); setApiOnly(false); setSandboxOnly(false); setQuery(""); }
  const mapped = providers.filter(provider => provider.profileAvailable !== false).length;
  const shown = filtered.slice(0, limit);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--color-orange-deep)]">Compare / Directory</p>
        <h1 className="font-display text-[clamp(1.8rem,4vw,2.5rem)] font-semibold leading-tight tracking-[-.045em]">Find your next provider.</h1>
        <p className="max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">Explore payment infrastructure. Open a provider for pricing, coverage and source evidence.</p>
      </div>
      <p className="text-xs text-[var(--color-muted)]"><strong className="text-[var(--color-ink)]">{providers.length}</strong> providers{mapped < providers.length ? ` · ${mapped} mapped profiles` : " mapped"}</p>
    </header>

    <section aria-label="Find providers" className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_170px_150px_auto]">
        <label className="col-span-2 flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 focus-within:ring-2 focus-within:ring-[var(--color-orange)] md:col-span-1">
          <Search size={17} className="shrink-0 text-[var(--color-faint)]" />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search providers" placeholder="Search a provider or capability…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-[var(--color-canvas)]"><X size={14} /></button>}
        </label>
        <select aria-label="Filter by product" value={product} onChange={event => setProduct(event.target.value)} className={control}><option value="">All products</option>{options.products.map(([value, count]) => <option key={value} value={value}>{PRODUCTS[value] ?? value} ({count})</option>)}</select>
        <select aria-label="Sort providers" value={sort} onChange={event => setSort(event.target.value as Sort)} className={control}><option value="name">Name: A–Z</option><option value="coverage">Most countries</option><option value="fresh">Recently verified</option></select>
        <button type="button" onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} aria-controls="provider-filters" className={cn(control, "col-span-2 flex items-center justify-center gap-2 md:col-span-1", filtersOpen && "border-[var(--color-ink)]")}><SlidersHorizontal size={15} />Filters{active.length > 0 && <span className="rounded-full bg-[var(--color-ink)] px-1.5 text-[10px] text-white">{active.length}</span>}</button>
      </div>
      <AnimatePresence initial={false}>{filtersOpen && <motion.div id="provider-filters" initial={reduce ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .16 }} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Filter label="Asset"><select aria-label="Filter by asset" value={asset} onChange={event => setAsset(event.target.value)} className={control}><option value="">Any asset</option>{options.assets.map(([value, count]) => <option key={value} value={value}>{value} ({count})</option>)}</select></Filter>
          <Filter label="Network"><select aria-label="Filter by network" value={network} onChange={event => setNetwork(event.target.value)} className={control}><option value="">Any network</option>{options.networks.map(([value, count]) => <option key={value} value={value}>{value} ({count})</option>)}</select></Filter>
          <Filter label="Customer"><select aria-label="Filter by customer" value={customerType} onChange={event => setCustomerType(event.target.value)} className={control}><option value="">Any customer</option><option value="business">Businesses</option><option value="individual">Individuals</option></select></Filter>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 border-t border-[var(--color-line)] pt-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" checked={apiOnly} onChange={event => setApiOnly(event.target.checked)} className="size-4 accent-[var(--color-ink)]" /><Code2 size={14} />Has API</label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" checked={sandboxOnly} onChange={event => setSandboxOnly(event.target.checked)} className="size-4 accent-[var(--color-ink)]" /><FlaskConical size={14} />Has sandbox</label>
        </div>
      </motion.div>}</AnimatePresence>
      <div className="flex min-h-7 flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]" aria-live="polite">
        <span>{filtered.length} {filtered.length === 1 ? "provider" : "providers"}{query ? ` matching “${query}”` : ""}</span>
        {active.map(filter => <button key={filter.label} type="button" onClick={filter.clear} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-[var(--color-ink)] px-2.5 text-[11px] text-white" aria-label={`Remove ${filter.label} filter`}>{filter.label}<X size={11} /></button>)}
        {(active.length > 0 || query) && <button type="button" onClick={clearAll} className="min-h-8 px-1 text-[var(--color-orange-deep)]">Reset</button>}
      </div>
    </section>

    {filtered.length ? <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_150px_130px_115px] gap-4 border-b border-[var(--color-line)] bg-[var(--color-paper)] px-5 py-3 text-[10px] font-medium uppercase tracking-[.1em] text-[var(--color-faint)] lg:grid"><span>Provider</span><span>Mapped coverage</span><span>Developers</span><span className="text-right">Explore</span></div>
      <ul aria-label="Provider directory" className="divide-y divide-[var(--color-line)]">{shown.map(provider => <ProviderRow key={provider.slug} provider={provider} href={provider.profileAvailable === false ? `/docs/pricing#provider-${provider.slug}` : `${basePath}/${provider.slug}`} open={expanded === provider.slug} onToggle={() => setExpanded(value => value === provider.slug ? null : provider.slug)} />)}</ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line)] px-4 py-2 text-xs text-[var(--color-muted)]"><span>Showing {shown.length} of {filtered.length}</span>{shown.length < filtered.length && <button type="button" onClick={() => setLimit(value => value + 24)} className="flex min-h-11 items-center gap-2 font-semibold text-[var(--color-ink)]">Show more providers<ChevronDown size={14} /></button>}{limit > 12 && <button type="button" onClick={() => setLimit(12)} className="min-h-11">Show fewer</button>}</div>
    </div> : <EmptyState what="No matching providers" why="Try another name or remove a filter." actionLabel="Clear filters" onAction={clearAll} />}
  </div>;
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1.5 text-xs text-[var(--color-muted)]"><span>{label}</span>{children}</label>; }

function ProviderRow({ provider: p, href, open, onToggle }: { provider: DirectoryProvider; href: string; open: boolean; onToggle: () => void }) {
  const reduce = useReducedMotion();
  return <li>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-[var(--color-paper)] sm:px-5 lg:grid-cols-[minmax(0,1fr)_150px_130px_115px]">
      <div className="flex min-w-0 items-center gap-3"><ProviderLogo slug={p.slug} name={p.name} size={38} /><div className="min-w-0"><Link href={href} className="block truncate text-sm font-semibold tracking-tight hover:text-[var(--color-orange-deep)]">{p.name}</Link><p className="mt-1 truncate text-xs text-[var(--color-muted)]">{p.category}</p></div></div>
      <div className="hidden text-xs lg:block">{p.countryCount ? <span className="flex items-center gap-1.5"><Globe2 size={13} className="text-[var(--color-faint)]" />{p.countryCount} {p.countryCount === 1 ? "country" : "countries"}</span> : <span className="text-[var(--color-faint)]">Not yet mapped</span>}{p.currencyCount > 0 && <span className="mt-1 block pl-5 text-[11px] text-[var(--color-muted)]">{p.currencyCount} currencies</span>}</div>
      <div className="hidden text-xs text-[var(--color-muted)] lg:block">{p.hasApi ? <span className="inline-flex items-center gap-1.5 text-[var(--color-ink)]"><Code2 size={14} />API available</span> : "See profile"}{p.hasSandbox && <span className="mt-1 block text-[11px]">Sandbox available</span>}</div>
      <div className="flex items-center justify-end gap-1"><Link href={href} aria-label={`View ${p.name}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium hover:bg-[var(--color-canvas)]">View<ArrowRight size={13} /></Link><button type="button" aria-label={`${open ? "Hide" : "Show"} ${p.name} details`} aria-expanded={open} aria-controls={`directory-${p.slug}`} onClick={onToggle} className="grid size-11 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-canvas)]"><ChevronDown size={15} className={cn("transition-transform", open && "rotate-180")} /></button></div>
    </div>
    <AnimatePresence initial={false}>{open && <motion.div id={`directory-${p.slug}`} initial={reduce ? false : { opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .15 }} className="space-y-3 border-t border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-4 sm:px-5">
      <p className="max-w-3xl text-[13px] leading-relaxed text-[var(--color-muted)]">{p.description}</p>
      {p.pricingSummary && p.pricingSummary !== p.description && <p className="max-w-3xl text-[13px] leading-relaxed"><span className="font-medium">Pricing: </span>{p.pricingSummary}</p>}
      <div className="flex flex-wrap gap-2">{p.products.map(product => <span key={product} className="rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-muted)]">{PRODUCTS[product] ?? product}</span>)}</div>
      {(p.assets.length > 0 || p.networks.length > 0) && <div className="flex flex-wrap gap-x-5 gap-y-3">
        {p.assets.length > 0 && <div className="flex flex-wrap items-center gap-2 text-[11px]"><span className="text-[var(--color-faint)]">Assets</span>{p.assets.map(asset => <span key={asset} className="inline-flex items-center gap-1.5"><CurrencyLogo symbol={asset} size={17} />{asset}</span>)}</div>}
        {p.networks.length > 0 && <div className="flex flex-wrap items-center gap-2 text-[11px]"><span className="text-[var(--color-faint)]">Networks</span>{p.networks.map(network => <span key={network} className="inline-flex items-center gap-1.5"><NetworkLogo slug={network} size={17} />{network}</span>)}</div>}
      </div>}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--color-muted)]">
        {p.countryCount > 0 && <span>{p.countryCount} mapped countries · {p.currencyCount} currencies</span>}
        {p.hasApi && <span className="inline-flex items-center gap-1.5"><Code2 size={13} />API</span>}{p.hasSandbox && <span className="inline-flex items-center gap-1.5"><FlaskConical size={13} />Sandbox</span>}{p.hasWebhooks && <span className="inline-flex items-center gap-1.5"><Webhook size={13} />Webhooks</span>}
        {p.profileAvailable === false ? <span>Source research · route support needs confirmation</span> : <Freshness date={p.lastVerifiedAt} />}
        {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-8 items-center gap-1 text-[var(--color-orange-deep)]">Official pricing source<ArrowUpRight size={11} /></a>}
      </div>
    </motion.div>}</AnimatePresence>
  </li>;
}
