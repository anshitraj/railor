"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  BadgeCheck,
  Banknote,
  Code2,
  Coins,
  CreditCard,
  FlaskConical,
  Globe2,
  Inbox,
  Landmark,
  LayoutGrid,
  Search,
  Send,
  Wallet,
  Webhook,
  X,
  type LucideIcon,
} from "lucide-react";
import { EmptyState, Freshness, cn } from "@railor/ui";
import { CurrencyLogo } from "../marketing/currency-logo";
import { NetworkLogo } from "../marketing/network-logo";
import { ProviderLogo } from "./provider-logo";

export interface DirectoryProvider {
  slug: string;
  name: string;
  category: string;
  description: string;
  products: string[];
  assets: string[];
  networks: string[];
  countryCount: number;
  currencyCount: number;
  customerTypes: string[];
  hasApi: boolean;
  hasSandbox: boolean;
  hasWebhooks: boolean;
  headquartersCountry: string | null;
  lastVerifiedAt: string | null;
}

const PRODUCTS: Record<string, { label: string; icon: LucideIcon }> = {
  payout: { label: "Payouts", icon: Send },
  collection: { label: "Collections", icon: Inbox },
  off_ramp: { label: "Off-ramp", icon: ArrowUpFromLine },
  on_ramp: { label: "On-ramp", icon: ArrowDownToLine },
  wallet: { label: "Wallets", icon: Wallet },
  virtual_account: { label: "Virtual accounts", icon: Banknote },
  treasury: { label: "Treasury", icon: Landmark },
  kyc_kyb: { label: "KYC / KYB", icon: BadgeCheck },
  card_issuing: { label: "Card issuing", icon: CreditCard },
  card_funding: { label: "Card funding", icon: CreditCard },
};

type Sort = "name" | "coverage" | "fresh";
const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "name", label: "A–Z" },
  { value: "coverage", label: "Most countries" },
  { value: "fresh", label: "Recently verified" },
];
const COLLAPSED = 8;

/** Filters are one click each, never required; every option shows how many providers it matches. */
export function ProviderDirectory({ providers, basePath = "/app/providers" }: { providers: DirectoryProvider[]; basePath?: string }) {
  const reduce = useReducedMotion();
  const [product, setProduct] = useState<string | null>(null);
  const [asset, setAsset] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<string | null>(null);
  const [apiOnly, setApiOnly] = useState(false);
  const [sandboxOnly, setSandboxOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [moreAssets, setMoreAssets] = useState(false);
  const [moreNetworks, setMoreNetworks] = useState(false);

  // Counted against the full dataset so a number never shifts under a chip the user didn't touch.
  const counts = useMemo(() => {
    const count = (get: (p: DirectoryProvider) => string[]) => {
      const map: Record<string, number> = {};
      for (const p of providers) for (const v of get(p)) map[v] = (map[v] ?? 0) + 1;
      return map;
    };
    return {
      products: count((p) => p.products),
      assets: count((p) => p.assets),
      networks: count((p) => p.networks),
      customerTypes: count((p) => p.customerTypes),
      api: providers.filter((p) => p.hasApi).length,
      sandbox: providers.filter((p) => p.hasSandbox).length,
    };
  }, [providers]);
  const byCount = (map: Record<string, number>) => Object.keys(map).sort((a, b) => map[b]! - map[a]! || a.localeCompare(b));
  const products = byCount(counts.products);
  const assets = byCount(counts.assets);
  const networks = byCount(counts.networks);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = providers.filter(
      (p) =>
        (!product || p.products.includes(product)) &&
        (!asset || p.assets.includes(asset)) &&
        (!network || p.networks.includes(network)) &&
        (!customerType || p.customerTypes.includes(customerType)) &&
        (!apiOnly || p.hasApi) &&
        (!sandboxOnly || p.hasSandbox) &&
        (!q || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q)),
    );
    const time = (p: DirectoryProvider) => (p.lastVerifiedAt ? Date.parse(p.lastVerifiedAt) : 0);
    return rows.sort((a, b) => (sort === "coverage" ? b.countryCount - a.countryCount : sort === "fresh" ? time(b) - time(a) : 0) || a.name.localeCompare(b.name));
  }, [providers, product, asset, network, customerType, apiOnly, sandboxOnly, query, sort]);

  const active: Array<{ label: string; clear: () => void }> = [
    ...(product ? [{ label: PRODUCTS[product]?.label ?? product, clear: () => setProduct(null) }] : []),
    ...(asset ? [{ label: asset, clear: () => setAsset(null) }] : []),
    ...(network ? [{ label: network, clear: () => setNetwork(null) }] : []),
    ...(customerType ? [{ label: customerType === "business" ? "Businesses" : "Individuals", clear: () => setCustomerType(null) }] : []),
    ...(apiOnly ? [{ label: "Has API", clear: () => setApiOnly(false) }] : []),
    ...(sandboxOnly ? [{ label: "Has sandbox", clear: () => setSandboxOnly(false) }] : []),
  ];
  const clearAll = () => {
    setProduct(null);
    setAsset(null);
    setNetwork(null);
    setCustomerType(null);
    setApiOnly(false);
    setSandboxOnly(false);
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[clamp(1.9rem,4vw,2.8rem)] font-semibold leading-none tracking-[-0.045em]">Provider directory</h1>
            <p className="text-[14.5px] text-[var(--color-muted)]">
              <span className="font-semibold text-[var(--color-ink)] tabular">{providers.length}</span> providers mapped — every fact linked to its source. Filter by what you actually need.
            </p>
          </div>
          <div className="inline-flex rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] p-1" role="group" aria-label="Sort providers">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={sort === s.value}
                onClick={() => setSort(s.value)}
                className={cn("rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition", sort === s.value ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]")}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 shadow-[0_1px_0_rgba(28,27,25,.03)] transition focus-within:border-[var(--color-orange)] focus-within:shadow-[0_0_0_4px_rgba(233,90,44,.08)]">
          <Search size={18} className="shrink-0 text-[var(--color-faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search providers — Wise, stablecoin payouts, India…"
            aria-label="Search providers"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--color-faint)]"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="rounded-full p-1 text-[var(--color-faint)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]">
              <X size={15} />
            </button>
          ) : null}
        </label>

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by product">
          <ProductTab active={!product} onClick={() => setProduct(null)} icon={LayoutGrid} label="All products" count={providers.length} />
          {products.map((p) => (
            <ProductTab key={p} active={product === p} onClick={() => setProduct(product === p ? null : p)} icon={PRODUCTS[p]?.icon ?? LayoutGrid} label={PRODUCTS[p]?.label ?? p} count={counts.products[p]!} />
          ))}
        </div>

        <div className="grid gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 lg:grid-cols-2">
          <FacetGroup title="Assets" expanded={moreAssets} onToggle={() => setMoreAssets((v) => !v)} total={assets.length}>
            {(moreAssets ? assets : assets.slice(0, COLLAPSED)).map((a) => (
              <LogoChip key={a} active={asset === a} onClick={() => setAsset(asset === a ? null : a)} count={counts.assets[a]!} label={a} logo={<CurrencyLogo symbol={a} size={18} />} />
            ))}
          </FacetGroup>
          <FacetGroup title="Networks" expanded={moreNetworks} onToggle={() => setMoreNetworks((v) => !v)} total={networks.length}>
            {(moreNetworks ? networks : networks.slice(0, COLLAPSED)).map((n) => (
              <LogoChip key={n} active={network === n} onClick={() => setNetwork(network === n ? null : n)} count={counts.networks[n]!} label={n} logo={<NetworkLogo slug={n} size={18} />} />
            ))}
          </FacetGroup>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-line)] pt-3 lg:col-span-2">
            <span className="mr-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--color-faint)]">Serves</span>
            {["business", "individual"].map((c) => (
              <LogoChip key={c} active={customerType === c} onClick={() => setCustomerType(customerType === c ? null : c)} count={counts.customerTypes[c] ?? 0} label={c === "business" ? "Businesses" : "Individuals"} />
            ))}
            <span className="mx-1 h-4 w-px bg-[var(--color-line)]" />
            <LogoChip active={apiOnly} onClick={() => setApiOnly((v) => !v)} count={counts.api} label="Has API" logo={<Code2 size={14} />} />
            <LogoChip active={sandboxOnly} onClick={() => setSandboxOnly((v) => !v)} count={counts.sandbox} label="Has sandbox" logo={<FlaskConical size={14} />} />
          </div>
        </div>

        <div className="flex min-h-7 flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-[var(--color-muted)]">
            <span className="font-semibold text-[var(--color-ink)] tabular">{filtered.length}</span> of {providers.length} providers
          </span>
          <AnimatePresence initial={false}>
            {active.map((f) => (
              <motion.button
                key={f.label}
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={f.clear}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-ink)] px-2.5 py-1 text-[12px] font-semibold text-white"
              >
                {f.label} <X size={12} />
              </motion.button>
            ))}
          </AnimatePresence>
          {active.length ? (
            <button type="button" onClick={clearAll} className="font-semibold text-[var(--color-orange-deep)] underline-offset-4 hover:underline">
              Clear all
            </button>
          ) : null}
        </div>
      </header>

      {filtered.length ? (
        <motion.div layout={!reduce} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout" initial={!reduce}>
            {filtered.map((p, i) => (
              <motion.div
                key={p.slug}
                layout={!reduce}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(i, 11) * 0.03, ease: [0.22, 1, 0.36, 1] }}
              >
                <ProviderCard provider={p} href={`${basePath}/${p.slug}`} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <EmptyState
          what="No provider matches those filters"
          why="Nothing in the mapped dataset satisfies every filter at once. Clearing the narrowest one usually brings results back."
          actionLabel="Clear filters"
          onAction={clearAll}
        />
      )}
    </div>
  );
}

function ProviderCard({ provider: p, href }: { provider: DirectoryProvider; href: string }) {
  const capabilities = [
    { on: p.hasApi, icon: Code2, label: "API" },
    { on: p.hasSandbox, icon: FlaskConical, label: "Sandbox" },
    { on: p.hasWebhooks, icon: Webhook, label: "Webhooks" },
  ];
  return (
    <Link
      href={href}
      className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 transition duration-200 hover:-translate-y-1 hover:border-[var(--color-line-strong)] hover:shadow-[0_22px_50px_-28px_rgba(28,27,25,.55)]"
    >
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-[radial-gradient(circle,rgba(233,90,44,.10),transparent_65%)] opacity-0 transition duration-300 group-hover:opacity-100" />
      <div className="flex items-start gap-3">
        <ProviderLogo slug={p.slug} name={p.name} size={44} className="transition duration-300 group-hover:scale-105" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[16px] font-semibold tracking-tight">{p.name}</span>
          <span className="truncate text-[12px] text-[var(--color-muted)]">{p.category}</span>
        </div>
        <div className="flex gap-1">
          {capabilities.map((c) => (
            <span
              key={c.label}
              title={`${c.label}: ${c.on ? "yes" : "not published"}`}
              aria-label={`${c.label} ${c.on ? "available" : "not published"}`}
              className={cn("grid size-7 place-items-center rounded-lg", c.on ? "bg-emerald-50 text-emerald-700" : "bg-[var(--color-canvas)] text-[var(--color-faint)] opacity-60")}
            >
              <c.icon size={13} />
            </span>
          ))}
        </div>
      </div>

      <p className="line-clamp-2 text-[13px] leading-relaxed text-[var(--color-muted)]">{p.description}</p>

      {p.countryCount === 0 && p.currencyCount === 0 ? (
        // Unpublished is "not published", never zero: a provider with nothing confirmed must not read as "0 countries".
        <p className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-muted)]">
          <Globe2 size={14} className="text-[var(--color-faint)]" />
          No confirmed coverage yet
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5">
            <Globe2 size={14} className="text-[var(--color-faint)]" />
            <span className="font-semibold tabular">{p.countryCount}</span>
            <span className="text-[var(--color-muted)]">{p.countryCount === 1 ? "country" : "countries"}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Coins size={14} className="text-[var(--color-faint)]" />
            <span className="font-semibold tabular">{p.currencyCount}</span>
            <span className="text-[var(--color-muted)]">{p.currencyCount === 1 ? "currency" : "currencies"}</span>
          </span>
        </div>
      )}

      {p.assets.length || p.networks.length ? (
        <div className="flex flex-wrap items-center gap-3">
          {p.assets.length ? <LogoStack items={p.assets} render={(a) => <CurrencyLogo symbol={a} size={22} />} /> : null}
          {p.networks.length ? <LogoStack items={p.networks} render={(n) => <NetworkLogo slug={n} size={22} />} /> : null}
        </div>
      ) : null}

      {p.products.length ? (
        <div className="flex flex-wrap gap-1.5">
          {p.products.slice(0, 4).map((product) => {
            const meta = PRODUCTS[product];
            const Icon = meta?.icon ?? LayoutGrid;
            return (
              <span key={product} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-canvas)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-soft)]">
                <Icon size={11} /> {meta?.label ?? product}
              </span>
            );
          })}
          {p.products.length > 4 ? <span className="px-1 text-[11px] text-[var(--color-faint)]">+{p.products.length - 4}</span> : null}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between border-t border-[var(--color-line)] pt-3">
        <Freshness date={p.lastVerifiedAt} />
        <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--color-orange-deep)]">
          View <ArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

function LogoStack({ items, render }: { items: string[]; render: (item: string) => React.ReactNode }) {
  const shown = items.slice(0, 5);
  return (
    <span className="flex items-center" title={items.join(", ")}>
      <span className="flex -space-x-1.5">
        {shown.map((item) => (
          <span key={item} className="rounded-full ring-2 ring-[var(--color-surface)]">
            {render(item)}
          </span>
        ))}
      </span>
      {items.length > shown.length ? <span className="ml-1.5 text-[11px] font-semibold text-[var(--color-faint)]">+{items.length - shown.length}</span> : null}
    </span>
  );
}

function ProductTab({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition",
        active ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white shadow-[0_8px_20px_-12px_rgba(28,27,25,.8)]" : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:-translate-y-px hover:border-[var(--color-line-strong)]",
      )}
    >
      <Icon size={15} />
      {label}
      <span className={cn("rounded-full px-1.5 text-[11px] tabular", active ? "bg-white/20" : "bg-[var(--color-canvas)] text-[var(--color-faint)]")}>{count}</span>
    </button>
  );
}

function LogoChip({ active, onClick, count, label, logo }: { active: boolean; onClick: () => void; count: number; label: string; logo?: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5 text-[12.5px] font-medium transition",
        !logo && "pl-2.5",
        active ? "border-[var(--color-orange)] bg-[var(--color-lavender)] text-[var(--color-orange-deep)]" : "border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]",
      )}
    >
      {logo}
      <span className="capitalize">{label}</span>
      <span className="tabular text-[10.5px] text-[var(--color-faint)]">{count}</span>
    </button>
  );
}

function FacetGroup({ title, expanded, onToggle, total, children }: { title: string; expanded: boolean; onToggle: () => void; total: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--color-faint)]">{title}</span>
      <div className="flex flex-wrap gap-1.5">
        {children}
        {total > COLLAPSED ? (
          <button type="button" onClick={onToggle} className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-[var(--color-orange-deep)] hover:bg-[var(--color-lavender)]">
            {expanded ? "Show fewer" : `+${total - COLLAPSED} more`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
