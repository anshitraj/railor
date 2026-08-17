"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Chip, EmptyState, Freshness, SectionLabel } from "@railor/ui";

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
            <Chip key={p} active={product === p} onClick={() => toggle(product, p, setProduct)} className="text-[13px]">
              {PRODUCT_LABELS[p] ?? p}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Asset">
          {facets.assets.map((a) => (
            <Chip key={a} active={asset === a} onClick={() => toggle(asset, a, setAsset)} className="text-[13px]">
              {a}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Network">
          {facets.networks.map((n) => (
            <Chip key={n} active={network === n} onClick={() => toggle(network, n, setNetwork)} className="text-[13px]">
              {n}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Serves">
          {["business", "individual"].map((c) => (
            <Chip
              key={c}
              active={customerType === c}
              onClick={() => toggle(customerType, c, setCustomerType)}
              className="text-[13px]"
            >
              {c === "business" ? "Businesses" : "Individuals"}
            </Chip>
          ))}
          <Chip active={apiOnly} onClick={() => setApiOnly(!apiOnly)} className="text-[13px]">
            Has API
          </Chip>
          <Chip active={sandboxOnly} onClick={() => setSandboxOnly(!sandboxOnly)} className="text-[13px]">
            Has sandbox
          </Chip>
        </FilterRow>
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
            setProduct(null);
            setAsset(null);
            setNetwork(null);
            setCustomerType(null);
            setApiOnly(false);
            setSandboxOnly(false);
            setQuery("");
          }}
        />
      )}
    </div>
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
