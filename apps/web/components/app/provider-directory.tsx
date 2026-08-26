"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Card, Chip, cn, EmptyState, Freshness, SectionLabel } from "@railor/ui";

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

const PRODUCT_LABELS: Record<string, string> = {
  off_ramp: "Off-ramp",
  on_ramp: "On-ramp",
  payout: "Payouts",
  collection: "Collections",
  virtual_account: "Virtual accounts",
  card_issuing: "Card issuing",
  card_funding: "Card funding",
  wallet: "Wallets",
  treasury: "Treasury",
  kyc_kyb: "KYC / KYB",
};

/** Filters are chips, not a form: every facet is one click, none is required. */
export function ProviderDirectory({
  providers,
  basePath = "/app/providers",
}: {
  providers: DirectoryProvider[];
  basePath?: string;
}) {
  const [product, setProduct] = useState<string | null>(null);
  const [asset, setAsset] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<string | null>(null);
  const [apiOnly, setApiOnly] = useState(false);
  const [sandboxOnly, setSandboxOnly] = useState(false);
  const [query, setQuery] = useState("");

  const facets = useMemo(
    () => ({
      products: [...new Set(providers.flatMap((p) => p.products))],
      assets: [...new Set(providers.flatMap((p) => p.assets))],
      networks: [...new Set(providers.flatMap((p) => p.networks))],
    }),
    [providers],
  );

  /**
   * How many providers each option matches, against the full dataset — shown
   * on every chip so picking one is an informed choice, not a guess. Counted
   * against the unfiltered set (not "remaining after other filters") so a
   * number never shifts under a chip the user didn't touch.
   */
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
      apiOnly: providers.filter((p) => p.hasApi).length,
      sandboxOnly: providers.filter((p) => p.hasSandbox).length,
    };
  }, [providers]);

  const activeFilterCount = [product, asset, network, customerType].filter(Boolean).length + (apiOnly ? 1 : 0) + (sandboxOnly ? 1 : 0);
  const clearFilters = () => {
    setProduct(null);
    setAsset(null);
    setNetwork(null);
    setCustomerType(null);
    setApiOnly(false);
    setSandboxOnly(false);
  };

  const filtered = providers.filter((p) => {
    if (product && !p.products.includes(product)) return false;
    if (asset && !p.assets.includes(asset)) return false;
    if (network && !p.networks.includes(network)) return false;
    if (customerType && !p.customerTypes.includes(customerType)) return false;
    if (apiOnly && !p.hasApi) return false;
    if (sandboxOnly && !p.hasSandbox) return false;
    if (query && !`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(query.toLowerCase()))
      return false;
    return true;
  });

  const toggle = <T,>(current: T | null, value: T, set: (v: T | null) => void) =>
    set(current === value ? null : value);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-semibold tracking-tight">Provider directory</h1>
          <p className="text-[14px] text-[var(--color-muted)]">
            {providers.length} providers mapped in this dataset. Filter by what you actually need.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          className="rounded-full border border-[var(--color-line)] bg-white px-4 py-2 text-[13.5px] outline-none focus:border-[var(--color-violet)]"
          aria-label="Filter providers by name"
        />
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <FilterRow label="Product">
          {facets.products.map((p) => (
            <FacetChip key={p} active={product === p} count={counts.products[p]} onClick={() => toggle(product, p, setProduct)}>
              {PRODUCT_LABELS[p] ?? p}
            </FacetChip>
          ))}
        </FilterRow>
        <div className="h-px bg-[var(--color-line)]" />
        <FilterRow label="Asset">
          {facets.assets.map((a) => (
            <FacetChip key={a} active={asset === a} count={counts.assets[a]} onClick={() => toggle(asset, a, setAsset)}>
              {a}
            </FacetChip>
          ))}
        </FilterRow>
        <FilterRow label="Network">
          {facets.networks.map((n) => (
            <FacetChip key={n} active={network === n} count={counts.networks[n]} onClick={() => toggle(network, n, setNetwork)}>
              {n}
            </FacetChip>
          ))}
        </FilterRow>
        <div className="h-px bg-[var(--color-line)]" />
        <FilterRow label="Serves">
          {["business", "individual"].map((c) => (
            <FacetChip
              key={c}
              active={customerType === c}
              count={counts.customerTypes[c]}
              onClick={() => toggle(customerType, c, setCustomerType)}
            >
              {c === "business" ? "Businesses" : "Individuals"}
            </FacetChip>
          ))}
          <FacetChip active={apiOnly} count={counts.apiOnly} onClick={() => setApiOnly(!apiOnly)}>
            Has API
          </FacetChip>
          <FacetChip active={sandboxOnly} count={counts.sandboxOnly} onClick={() => setSandboxOnly(!sandboxOnly)}>
            Has sandbox
          </FacetChip>
        </FilterRow>

        {activeFilterCount > 0 ? (
          <div className="flex items-center gap-2 border-t border-[var(--color-line)] pt-3 text-[12.5px]">
            <span className="text-[var(--color-muted)]">
              {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active · {filtered.length} of {providers.length} providers match
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 font-medium text-[var(--color-purple)] hover:bg-[var(--color-lavender)]"
            >
              <X className="size-3.5" />
              Clear all
            </button>
          </div>
        ) : null}
      </Card>

      {filtered.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <Link key={p.slug} href={`${basePath}/${p.slug}`}>
              <Card interactive className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-[15px] font-medium">{p.name}</span>
                    <span className="text-[12px] text-[var(--color-muted)]">{p.category}</span>
                  </div>
                  <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-lavender)] text-[12px] font-semibold text-[var(--color-purple)]">
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>

                <p className="line-clamp-2 text-[12.5px] leading-snug text-[var(--color-muted)]">
                  {p.description}
                </p>

                <dl className="grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <dt className="text-[var(--color-faint)]">Countries</dt>
                    <dd className="tabular">{p.countryCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-faint)]">Currencies</dt>
                    <dd className="tabular">{p.currencyCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-faint)]">Assets</dt>
                    <dd>{p.assets.join(" / ") || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-faint)]">Serves</dt>
                    <dd>{p.customerTypes.join(" + ") || "—"}</dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-1.5">
                  {p.products.slice(0, 4).map((product) => (
                    <span
                      key={product}
                      className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[11px] text-[var(--color-ink-soft)]"
                    >
                      {PRODUCT_LABELS[product] ?? product}
                    </span>
                  ))}
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-[var(--color-line)] pt-2">
                  <Freshness date={p.lastVerifiedAt} />
                  <span className="text-[12.5px] font-medium text-[var(--color-purple)]">
                    View provider →
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          what="No provider matches those filters"
          why="Nothing in the mapped dataset satisfies every filter at once. Clearing the narrowest one usually brings results back."
          actionLabel="Clear filters"
          onAction={() => {
            clearFilters();
            setQuery("");
          }}
        />
      )}
    </div>
  );
}

/**
 * A filter chip that shows the option's match count and a checkmark when
 * selected — so picking one is an informed choice (how many results it
 * leaves) and the selected state reads at a glance, not just by border colour.
 */
function FacetChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Chip active={active} onClick={onClick} className="text-[13px]">
      {active ? <Check className="size-3.5 shrink-0" strokeWidth={2.5} /> : null}
      {children}
      {count !== undefined ? (
        <span
          className={cn(
            "tabular rounded-full px-1.5 py-px text-[10.5px] font-semibold",
            active ? "bg-white/70 text-[var(--color-purple-deep)]" : "bg-[var(--color-canvas)] text-[var(--color-faint)]",
          )}
        >
          {count}
        </span>
      ) : null}
    </Chip>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SectionLabel className="w-[70px] shrink-0">{label}</SectionLabel>
      {children}
    </div>
  );
}
