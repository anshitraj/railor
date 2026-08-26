"use client";

import { Stagger, StaggerItem } from "@railor/ui";
import { CurrencyLogo } from "./currency-logo";
import { NetworkLogo, type NetworkSlug } from "./network-logo";

/**
 * The coverage strip: every asset, network and rail Railor has structured
 * facts for, shown as a single dense row.
 *
 * Crypto marks come from the shared CurrencyLogo/NetworkLogo components (see
 * providers/[slug]/page.tsx for the other consumer of the same marks — one
 * source of truth for what a given symbol/slug looks like everywhere in the
 * app). Local-rail marks (SWIFT/SEPA/ACH/UPI) stay defined here — they're
 * payment-rail abbreviations, not blockchains.assets/blockchains rows, so
 * they don't belong in either shared component's lookup.
 *
 * All inline SVG on purpose, not remote logo files — no image host to
 * allowlist in next.config, nothing that can 404 into a broken tile.
 */

interface Tile {
  label: string;
  node: React.ReactNode;
}

const Ring = ({ fill, children }: { fill: string; children: React.ReactNode }) => (
  <svg viewBox="0 0 32 32" className="size-full" role="presentation">
    <circle cx="16" cy="16" r="16" fill={fill} />
    {children}
  </svg>
);

const ASSET_TILES: Tile[] = ["USDC", "USDT", "EURC"].map((symbol) => ({
  label: symbol,
  node: <CurrencyLogo symbol={symbol} size={32} />,
}));

const NETWORK_TILES: Tile[] = (["base", "ethereum", "solana", "polygon", "arbitrum"] as NetworkSlug[]).map((slug) => ({
  label: slug === "bnb-chain" ? "BNB Chain" : slug.charAt(0).toUpperCase() + slug.slice(1),
  node: <NetworkLogo slug={slug} size={32} />,
}));

const TILES: Tile[] = [
  ...ASSET_TILES,
  ...NETWORK_TILES,
  {
    label: "SWIFT",
    node: (
      <Ring fill="#1c1b19">
        <text
          x="16"
          y="20"
          textAnchor="middle"
          fill="white"
          fontSize="9"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          SWF
        </text>
      </Ring>
    ),
  },
  {
    label: "SEPA",
    node: (
      <Ring fill="#003399">
        <text
          x="16"
          y="20"
          textAnchor="middle"
          fill="#FFCC00"
          fontSize="9"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          SEP
        </text>
      </Ring>
    ),
  },
  {
    label: "ACH",
    node: (
      <Ring fill="#2f6f4e">
        <text
          x="16"
          y="20"
          textAnchor="middle"
          fill="white"
          fontSize="9"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          ACH
        </text>
      </Ring>
    ),
  },
  {
    label: "UPI",
    node: (
      <Ring fill="#ffffff">
        <path d="M13 8h3l-4 16H9l4-16Z" fill="#097939" />
        <path d="M17 8h3l-4 16h-3l4-16Z" fill="#ED752E" />
      </Ring>
    ),
  },
];

export function RailsStrip() {
  return (
    <div className="flex flex-col gap-4 border-y border-[var(--color-line)] py-6 sm:flex-row sm:items-center sm:gap-8">
      <div className="flex shrink-0 flex-col gap-0.5">
        <span className="section-kicker">Supported rails</span>
        <span className="text-[13px] text-[var(--color-muted)]">
          12 assets &amp; networks, plus local rails
        </span>
      </div>

      <Stagger className="flex flex-1 flex-wrap items-center gap-2" step={0.035} amount={0.3}>
        {TILES.map((tile) => (
          <StaggerItem key={tile.label}>
            <span
              title={tile.label}
              className="group flex size-10 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-1.5 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-soft)]"
            >
              <span className="size-full" aria-hidden>
                {tile.node}
              </span>
              <span className="sr-only">{tile.label}</span>
            </span>
          </StaggerItem>
        ))}
        <StaggerItem>
          <span className="flex h-10 items-center rounded-xl border border-dashed border-[var(--color-line-strong)] px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            + more
          </span>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
