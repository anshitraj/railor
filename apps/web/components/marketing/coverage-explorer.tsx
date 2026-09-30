"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { Card, cn } from "@railor/ui";

export interface CoverageRow {
  code: string;
  name: string;
  region: string;
  /** Providers that can pay out into this market. */
  payoutProviders: number;
  /** Providers that can onboard a company incorporated in this market. */
  onboardingProviders: number;
  currencies: string[];
}

type Depth = "deep" | "thin" | "none";
type DepthFilter = Depth | "all";

/** Three or more providers is a real choice, one or two is thin, none is a gap. */
function depthOf(payoutProviders: number): Depth {
  if (payoutProviders >= 3) return "deep";
  return payoutProviders > 0 ? "thin" : "none";
}

/** Depth is always written out, never carried by colour alone. */
const DEPTH: Record<Depth, { label: string; chip: string; bar: string; count: string }> = {
  deep: { label: "Well served", chip: "bg-[#e9f6ed] text-[#20713d]", bar: "bg-[var(--color-ok)]", count: "text-[#20713d]" },
  thin: { label: "Thin", chip: "bg-[#fcf3dd] text-[#90611c]", bar: "bg-[var(--color-warn)]", count: "text-[#90611c]" },
  none: { label: "None mapped", chip: "bg-[#f2eee7] text-[#625e58]", bar: "bg-transparent", count: "text-[var(--color-muted)]" },
};

const TILES: Array<{ key: DepthFilter; label: string; tone: string }> = [
  { key: "all", label: "All markets", tone: "text-[var(--color-ink)]" },
  { key: "deep", label: "Well served", tone: "text-[#20713d]" },
  { key: "thin", label: "Thin", tone: "text-[#90611c]" },
  { key: "none", label: "None mapped", tone: "text-[var(--color-muted)]" },
];

interface Filters {
  region: string | null;
  depth: DepthFilter;
  /** Lower-cased and trimmed. */
  query: string;
}

function matches(row: CoverageRow, { region, depth, query }: Filters): boolean {
  if (region && row.region !== region) return false;
  if (depth !== "all" && depthOf(row.payoutProviders) !== depth) return false;
  if (query && !`${row.name} ${row.code} ${row.region} ${row.currencies.join(" ")}`.toLowerCase().includes(query)) return false;
  return true;
}

const TH =
  "sticky top-16 z-10 border-b border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)] md:px-4";
const TD = "border-b border-[var(--color-line)] px-3 py-3 align-middle md:px-4";

/**
 * The coverage table with its filters. Every filter is a single click; the search box is an
 * accelerator, never a requirement. Counts on each control reflect the other active filters, so a
 * click never lands on an empty result by surprise.
 */
export function CoverageExplorer({ rows }: { rows: CoverageRow[] }) {
  const [depth, setDepth] = useState<DepthFilter>("all");
  const [region, setRegion] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const current: Filters = { region, depth, query };

  const regionCounts = new Map<string, number>();
  for (const row of rows) regionCounts.set(row.region, (regionCounts.get(row.region) ?? 0) + 1);
  const regions = [...regionCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);

  const maxPayout = Math.max(1, ...rows.map((row) => row.payoutProviders));
  const visible = rows.filter((row) => matches(row, current));
  const countFor = (overrides: Partial<Filters>) => rows.filter((row) => matches(row, { ...current, ...overrides })).length;
  const filtered = depth !== "all" || region !== null || query !== "";
  const clear = () => {
    setDepth("all");
    setRegion(null);
    setSearch("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Filter by depth of coverage" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TILES.map((tile) => {
          const active = depth === tile.key;
          const count = countFor({ depth: tile.key });
          return (
            <button
              key={tile.key}
              type="button"
              aria-pressed={active}
              disabled={!active && count === 0}
              onClick={() => setDepth(active ? "all" : tile.key)}
              className={cn(
                "flex flex-col gap-1.5 rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                active
                  ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] enabled:hover:-translate-y-px enabled:hover:border-[var(--color-line-strong)]",
              )}
            >
              <span className={cn("text-[10.5px] font-semibold uppercase tracking-[0.12em]", active ? "text-white/65" : "text-[var(--color-muted)]")}>
                {tile.label}
              </span>
              <span className={cn("font-display text-[28px] font-semibold leading-none tabular", active ? "text-white" : tile.tone)}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Filter by region"
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        >
          <RegionChip active={region === null} label="All regions" count={countFor({ region: null })} onClick={() => setRegion(null)} />
          {regions.map((name) => (
            <RegionChip
              key={name}
              active={region === name}
              label={name}
              count={countFor({ region: name })}
              onClick={() => setRegion(region === name ? null : name)}
            />
          ))}
        </div>

        <label className="relative block w-full shrink-0 lg:w-72">
          <span className="sr-only">Find a market</span>
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a market or currency"
            autoComplete="off"
            enterKeyHint="search"
            className="h-10 w-full rounded-full border border-[var(--color-line-strong)] bg-white pl-10 pr-9 text-[13px] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-orange)] focus-visible:ring-2 focus-visible:ring-[var(--color-orange)]/25"
          />
          {search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-sand)] hover:text-[var(--color-ink)]"
            >
              <X size={14} />
            </button>
          ) : null}
        </label>
      </div>

      <p aria-live="polite" className="flex items-center gap-3 text-[12.5px] text-[var(--color-muted)]">
        <span className="tabular">
          Showing {visible.length} of {rows.length} markets
        </span>
        {filtered ? (
          <button type="button" onClick={clear} className="font-semibold text-[var(--color-orange-deep)] underline underline-offset-4 transition hover:text-[var(--color-ink)]">
            Clear filters
          </button>
        ) : null}
      </p>

      <Card className="overflow-clip p-0">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-[14px] font-semibold">No markets match these filters.</p>
            <button
              type="button"
              onClick={clear}
              className="rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-1.5 text-[12.5px] font-semibold transition hover:border-[var(--color-orange)] hover:text-[var(--color-orange-deep)]"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th scope="col" className={cn(TH, "w-[46%] md:w-[28%]")}>
                  Market
                </th>
                <th scope="col" className={cn(TH, "hidden md:table-cell md:w-[15%]")}>
                  Region
                </th>
                <th scope="col" className={cn(TH, "w-[34%] md:w-[27%]")}>
                  Can pay into
                </th>
                <th
                  scope="col"
                  title="Providers that can onboard a company incorporated in this market"
                  className={cn(TH, "w-[20%] md:w-[14%]")}
                >
                  <span className="lg:hidden">Onboard</span>
                  <span className="hidden lg:inline">Can onboard entities from</span>
                </th>
                <th scope="col" className={cn(TH, "hidden md:table-cell md:w-[16%]")}>
                  Currencies
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {visible.map((row) => {
                const level = DEPTH[depthOf(row.payoutProviders)];
                return (
                  <tr key={row.code} className="transition hover:bg-[var(--color-paper)]">
                    <td className={TD}>
                      <Link
                        href={`/login?intent=start&q=${encodeURIComponent(`USDC payouts to ${row.name}`)}`}
                        title={`Search USDC payouts to ${row.name}`}
                        className="group/market flex items-center gap-3 font-medium transition hover:text-[var(--color-orange-deep)]"
                      >
                        <span
                          aria-hidden
                          className="grid h-6 w-8 shrink-0 place-items-center rounded-md bg-[var(--color-sand)] font-mono text-[10.5px] font-semibold text-[var(--color-ink-soft)]"
                        >
                          {row.code}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="leading-snug">{row.name}</span>
                          <span className="text-[11.5px] font-normal text-[var(--color-muted)] md:hidden">{row.region}</span>
                        </span>
                        <ArrowUpRight
                          size={13}
                          aria-hidden
                          className="hidden shrink-0 -translate-x-1 opacity-0 transition group-hover/market:translate-x-0 group-hover/market:opacity-100 group-focus-visible/market:translate-x-0 group-focus-visible/market:opacity-100 md:block"
                        />
                      </Link>
                    </td>
                    <td className={cn(TD, "hidden text-[var(--color-muted)] md:table-cell")}>{row.region}</td>
                    <td className={TD}>
                      <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                        <span className={cn("tabular w-4 text-[15px] font-semibold sm:text-right", level.count)}>{row.payoutProviders}</span>
                        <span aria-hidden className="relative hidden h-1.5 w-full max-w-20 overflow-hidden rounded-full bg-[var(--color-line)] lg:block">
                          {row.payoutProviders > 0 ? (
                            <span
                              className={cn("railor-grow absolute inset-y-0 left-0 rounded-full", level.bar)}
                              style={{ width: `${Math.max(10, (row.payoutProviders / maxPayout) * 100)}%` }}
                            />
                          ) : null}
                        </span>
                        <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", level.chip)}>
                          {level.label}
                        </span>
                      </div>
                    </td>
                    <td className={cn(TD, "tabular text-[14px]", row.onboardingProviders === 0 ? "text-[var(--color-muted)]" : "font-semibold")}>
                      {row.onboardingProviders}
                    </td>
                    <td className={cn(TD, "hidden md:table-cell")}>
                      {row.currencies.length ? (
                        <span className="flex flex-wrap gap-1">
                          {row.currencies.map((currency) => (
                            <span
                              key={currency}
                              className="rounded-md bg-[var(--color-canvas)] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[var(--color-ink-soft)]"
                            >
                              {currency}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function RegionChip({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={!active && count === 0}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
          : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] enabled:hover:-translate-y-px enabled:hover:border-[var(--color-line-strong)]",
      )}
    >
      {label}
      <span className={cn("rounded-full px-1.5 text-[10.5px] tabular", active ? "bg-white/20" : "bg-[var(--color-canvas)] text-[var(--color-muted)]")}>{count}</span>
    </button>
  );
}
