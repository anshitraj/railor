import { fallbackFill } from "./logo-fallback";

export type NetworkSlug =
  | "base"
  | "ethereum"
  | "polygon"
  | "arbitrum"
  | "solana"
  | "tron"
  | "avalanche"
  | "optimism"
  | "bnb-chain"
  | "celo"
  | "stellar"
  | "ton"
  | "arc"
  | "plasma"
  | "tempo"
  | (string & {});

/**
 * One brand mark per blockchains.slug (see packages/database/src/schema.ts).
 * Every colour below is verified against the network's own brand/press page
 * or a reputable brand-colour reference — not guessed. Marks are inline SVG,
 * same rationale as CurrencyLogo/RailsStrip: no image host to allowlist,
 * nothing that can 404 into a broken tile.
 *
 * A few networks (arc, plasma) are new enough that no official icon
 * geometry could be verified — those get a plain monogram in their real,
 * verified brand colour rather than a fabricated icon shape. Anything with
 * no verified colour either (e.g. a brand-new chain added to the dataset
 * before its branding is public) falls through to the same stable
 * pseudo-random monogram CurrencyLogo uses for unmapped symbols.
 */
export function NetworkLogo({ slug, size = 22 }: { slug: NetworkSlug; size?: number }) {
  const s = (extra?: React.SVGProps<SVGSVGElement>) => ({
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    "aria-label": slug,
    role: "img" as const,
    ...extra,
  });

  switch (slug) {
    case "base":
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#0052FF" />
          <path d="M16 25.5c5.2 0 9.5-4.3 9.5-9.5S21.2 6.5 16 6.5c-4.9 0-9 3.8-9.5 8.6h12.6v1.8H6.5c.5 4.8 4.6 8.6 9.5 8.6Z" fill="white" />
        </svg>
      );

    case "ethereum":
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#627EEA" />
          <path d="M16 6.5v7.1l6 2.7L16 6.5Z" fill="white" fillOpacity=".6" />
          <path d="M16 6.5 10 16.3l6-2.7V6.5Z" fill="white" />
          <path d="M16 21.5v4l6-8.3-6 4.3Z" fill="white" fillOpacity=".6" />
          <path d="M16 25.5v-4l-6-4.3 6 8.3Z" fill="white" />
          <path d="m16 20.4 6-4.3-6-2.7v7Z" fill="white" fillOpacity=".2" />
          <path d="m10 16.1 6 4.3v-7l-6 2.7Z" fill="white" fillOpacity=".6" />
        </svg>
      );

    case "solana":
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#111014" />
          <path d="M10.2 19.6c.1-.1.3-.2.5-.2h11.6c.3 0 .5.4.3.6l-2.3 2.3c-.1.1-.3.2-.5.2H8.2c-.3 0-.5-.4-.3-.6l2.3-2.3Z" fill="#14F195" />
          <path d="M10.2 9.7c.1-.1.3-.2.5-.2h11.6c.3 0 .5.4.3.6l-2.3 2.3c-.1.1-.3.2-.5.2H8.2c-.3 0-.5-.4-.3-.6l2.3-2.3Z" fill="#14F195" />
          <path d="M20.3 14.6c-.1-.1-.3-.2-.5-.2H8.2c-.3 0-.5.4-.3.6l2.3 2.3c.1.1.3.2.5.2h11.6c.3 0 .5-.4.3-.6l-2.3-2.3Z" fill="#9945FF" />
        </svg>
      );

    case "polygon":
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#7B3FE4" />
          <path
            d="M20.6 13.4c-.3-.2-.7-.2-1 0l-2.4 1.4-1.6.9-2.4 1.4c-.3.2-.7.2-1 0l-1.9-1.1a1 1 0 0 1-.5-.9v-2.1c0-.4.2-.7.5-.9l1.9-1.1c.3-.2.7-.2 1 0l1.9 1.1c.3.2.5.5.5.9v1.4l1.6-1v-1.4c0-.4-.2-.7-.5-.9l-3.5-2a1 1 0 0 0-1 0l-3.5 2c-.3.2-.5.5-.5.9v4c0 .4.2.7.5.9l3.5 2c.3.2.7.2 1 0l2.4-1.4 1.6-.9 2.4-1.4c.3-.2.7-.2 1 0l1.9 1.1c.3.2.5.5.5.9v2.1c0 .4-.2.7-.5.9l-1.9 1.1c-.3.2-.7.2-1 0l-1.9-1.1a1 1 0 0 1-.5-.9v-1.4l-1.6 1v1.4c0 .4.2.7.5.9l3.5 2c.3.2.7.2 1 0l3.5-2c.3-.2.5-.5.5-.9v-4c0-.4-.2-.7-.5-.9l-3.5-2Z"
            fill="white"
          />
        </svg>
      );

    case "arbitrum":
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#213147" />
          <path d="m16 7 7 12.2-2.6 1.5L16 12.9l-4.4 7.8L9 19.2 16 7Z" fill="#12AAFF" />
          <path d="m18.2 21.9-2.2-3.8-2.2 3.8 2.2 3 2.2-3Z" fill="#9DCCED" />
        </svg>
      );

    case "tron": // verified brand red #EB0029; angular triangle motif approximating TRON's geometric emblem
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#EB0029" />
          <path d="M9 10h10.5l4.5 3.4-9 12.1L9 10Z" fill="white" fillOpacity=".55" />
          <path d="M9 10h10.5l-4 3.6L9 10Z" fill="white" />
          <path d="M15.5 13.6 9 10l6 15.5 4.5-12.1-4-3.8Z" fill="white" fillOpacity=".85" />
        </svg>
      );

    case "avalanche": // verified brand red #E84142; the mountain-triangle-with-notch mark
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#E84142" />
          <path d="M16 6.5 8 24.5h6.2l1.8-4 1.8 4H24L16 6.5Z" fill="white" />
          <path d="M13 24.5h6l-3-4-3 4Z" fill="#E84142" />
        </svg>
      );

    case "optimism": // verified brand red #FF0420; the "O" roundel
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#FF0420" />
          <circle cx="16" cy="16" r="7" fill="none" stroke="white" strokeWidth="3.4" />
        </svg>
      );

    case "bnb-chain": // verified brand yellow #F0B90B; the four-diamond cluster
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#F0B90B" />
          <path d="m16 8 2.6 2.6L16 13.2l-2.6-2.6L16 8Z" fill="white" />
          <path d="m16 18.8 2.6 2.6L16 24l-2.6-2.6L16 18.8Z" fill="white" />
          <path d="m8.6 13.4 2.6 2.6-2.6 2.6L6 16l2.6-2.6Z" fill="white" />
          <path d="m23.4 13.4 2.6 2.6-2.6 2.6-2.6-2.6 2.6-2.6Z" fill="white" />
          <path d="m16 13.4 2.6 2.6-2.6 2.6-2.6-2.6 2.6-2.6Z" fill="white" />
        </svg>
      );

    case "celo": // verified brand colours: yellow #FBCC5C and green #35D07F — two overlapping rings
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="white" />
          <circle cx="12.5" cy="16" r="7" fill="none" stroke="#FBCC5C" strokeWidth="3.2" />
          <circle cx="19.5" cy="16" r="7" fill="none" stroke="#35D07F" strokeWidth="3.2" />
        </svg>
      );

    case "stellar": // verified brand black #000000; the four-point star roundel
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#000000" />
          <path d="M16 8.5 17.8 14.2 23.5 16 17.8 17.8 16 23.5 14.2 17.8 8.5 16 14.2 14.2 16 8.5Z" fill="white" />
        </svg>
      );

    case "ton": // verified brand blue #30A1F5; rounded diamond
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#30A1F5" />
          <rect x="10.5" y="10.5" width="11" height="11" rx="3" fill="white" transform="rotate(45 16 16)" />
        </svg>
      );

    case "arc": // Circle's stablecoin-native L1 — no published icon geometry yet; verified brand lineage colour (Circle blue) with a plain monogram
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#2775CA" />
          <text x="16" y="20.5" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif">
            ARC
          </text>
        </svg>
      );

    case "plasma": // stablecoin-focused L1 — no published icon geometry yet; verified brand palette colour with a plain monogram
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill="#295B4F" />
          <text x="16" y="21" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui, sans-serif">
            PL
          </text>
        </svg>
      );

    default: {
      /** No verified brand colour or mark yet — a stable-coloured monogram instead of a guessed one. */
      const label = slug.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
      return (
        <svg {...s()}>
          <circle cx="16" cy="16" r="16" fill={fallbackFill(slug, 7)} />
          <text x="16" y="21" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui, sans-serif">
            {label}
          </text>
        </svg>
      );
    }
  }
}
