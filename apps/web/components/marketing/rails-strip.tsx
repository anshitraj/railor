"use client";

import { Stagger, StaggerItem } from "@railor/ui";

/**
 * The coverage strip: every asset, network and rail Railor has structured
 * facts for, shown as a single dense row.
 *
 * These are inline SVG rather than remote logo files on purpose — no image
 * host to allowlist in next.config, nothing that can 404 into a broken tile,
 * and the marks inherit the page's own ink colour where they're monochrome.
 */

interface Tile {
  label: string;
  node: React.ReactNode;
  /** Tile background; brand marks keep their own colour, glyphs use ink. */
  bg?: string;
}

const Ring = ({ fill, children }: { fill: string; children: React.ReactNode }) => (
  <svg viewBox="0 0 32 32" className="size-full" role="presentation">
    <circle cx="16" cy="16" r="16" fill={fill} />
    {children}
  </svg>
);

const TILES: Tile[] = [
  {
    label: "USDC",
    node: (
      <Ring fill="#2775CA">
        <text
          x="16"
          y="21"
          textAnchor="middle"
          fill="white"
          fontSize="12"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          $
        </text>
      </Ring>
    ),
  },
  {
    label: "USDT",
    node: (
      <Ring fill="#26A17B">
        <path
          d="M17.9 17.4v0c-.1 0-.7 0-1.9 0s-1.6 0-1.9 0v0c-3.7-.2-6.5-.8-6.5-1.6s2.8-1.4 6.5-1.6v2.5c.3 0 .9.1 1.9.1s1.7 0 1.9-.1v-2.5c3.7.2 6.5.8 6.5 1.6s-2.8 1.4-6.5 1.6Zm0-3.5v-2.2h5.2V8.2H9v3.5h5.1v2.2c-4.2.2-7.4 1-7.4 2s3.2 1.8 7.4 2v7.1h3.8v-7.1c4.2-.2 7.4-1 7.4-2s-3.2-1.8-7.4-2Z"
          fill="white"
        />
      </Ring>
    ),
  },
  {
    label: "EURC",
    node: (
      <Ring fill="#6F5DD9">
        <text
          x="16"
          y="21"
          textAnchor="middle"
          fill="white"
          fontSize="13"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          €
        </text>
      </Ring>
    ),
  },
  {
    label: "Base",
    node: (
      <Ring fill="#0052FF">
        <path
          d="M16 25.5c5.2 0 9.5-4.3 9.5-9.5S21.2 6.5 16 6.5c-4.9 0-9 3.8-9.5 8.6h12.6v1.8H6.5c.5 4.8 4.6 8.6 9.5 8.6Z"
          fill="white"
        />
      </Ring>
    ),
  },
  {
    label: "Ethereum",
    node: (
      <Ring fill="#627EEA">
        <path d="M16 6.5v7.1l6 2.7L16 6.5Z" fill="white" fillOpacity=".6" />
        <path d="M16 6.5 10 16.3l6-2.7V6.5Z" fill="white" />
        <path d="M16 21.5v4l6-8.3-6 4.3Z" fill="white" fillOpacity=".6" />
        <path d="M16 25.5v-4l-6-4.3 6 8.3Z" fill="white" />
        <path d="m16 20.4 6-4.3-6-2.7v7Z" fill="white" fillOpacity=".2" />
        <path d="m10 16.1 6 4.3v-7l-6 2.7Z" fill="white" fillOpacity=".6" />
      </Ring>
    ),
  },
  {
    label: "Solana",
    node: (
      <Ring fill="#111014">
        <path d="M10.2 19.6c.1-.1.3-.2.5-.2h11.6c.3 0 .5.4.3.6l-2.3 2.3c-.1.1-.3.2-.5.2H8.2c-.3 0-.5-.4-.3-.6l2.3-2.3Z" fill="#14F195" />
        <path d="M10.2 9.7c.1-.1.3-.2.5-.2h11.6c.3 0 .5.4.3.6l-2.3 2.3c-.1.1-.3.2-.5.2H8.2c-.3 0-.5-.4-.3-.6l2.3-2.3Z" fill="#14F195" />
        <path d="M20.3 14.6c-.1-.1-.3-.2-.5-.2H8.2c-.3 0-.5.4-.3.6l2.3 2.3c.1.1.3.2.5.2h11.6c.3 0 .5-.4.3-.6l-2.3-2.3Z" fill="#9945FF" />
      </Ring>
    ),
  },
  {
    label: "Polygon",
    node: (
      <Ring fill="#7B3FE4">
        <path
          d="M20.6 13.4c-.3-.2-.7-.2-1 0l-2.4 1.4-1.6.9-2.4 1.4c-.3.2-.7.2-1 0l-1.9-1.1a1 1 0 0 1-.5-.9v-2.1c0-.4.2-.7.5-.9l1.9-1.1c.3-.2.7-.2 1 0l1.9 1.1c.3.2.5.5.5.9v1.4l1.6-1v-1.4c0-.4-.2-.7-.5-.9l-3.5-2a1 1 0 0 0-1 0l-3.5 2c-.3.2-.5.5-.5.9v4c0 .4.2.7.5.9l3.5 2c.3.2.7.2 1 0l2.4-1.4 1.6-.9 2.4-1.4c.3-.2.7-.2 1 0l1.9 1.1c.3.2.5.5.5.9v2.1c0 .4-.2.7-.5.9l-1.9 1.1c-.3.2-.7.2-1 0l-1.9-1.1a1 1 0 0 1-.5-.9v-1.4l-1.6 1v1.4c0 .4.2.7.5.9l3.5 2c.3.2.7.2 1 0l3.5-2c.3-.2.5-.5.5-.9v-4c0-.4-.2-.7-.5-.9l-3.5-2Z"
          fill="white"
        />
      </Ring>
    ),
  },
  {
    label: "Arbitrum",
    node: (
      <Ring fill="#213147">
        <path d="m16 7 7 12.2-2.6 1.5L16 12.9l-4.4 7.8L9 19.2 16 7Z" fill="#12AAFF" />
        <path d="m18.2 21.9-2.2-3.8-2.2 3.8 2.2 3 2.2-3Z" fill="#9DCCED" />
      </Ring>
    ),
  },
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
