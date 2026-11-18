import {
  BookOpen,
  CircleDollarSign,
  Code2,
  Compass,
  History,
  Package,
  Plug,
  ShieldCheck,
  Terminal,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface DocsLink {
  label: string;
  href: string;
  icon: LucideIcon;
  /** One line under the label, and what the docs search matches. */
  hint: string;
  keywords?: string;
}

export interface DocsGroup {
  label: string;
  links: DocsLink[];
}

/** Single source of truth for the docs sidebar and the prev/next pager. */
export const DOCS_NAV: DocsGroup[] = [
  {
    label: "Getting started",
    links: [
      { label: "Overview", href: "/docs", icon: BookOpen, hint: "First answer in 60 seconds", keywords: "quickstart start key curl" },
      { label: "Guides", href: "/docs/guides", icon: Compass, hint: "Step-by-step recipes", keywords: "tutorial how to recipe" },
      { label: "Pricing & sources", href: "/docs/pricing", icon: CircleDollarSign, hint: "What every number means", keywords: "fees fx bps mid-market benchmark source estimate quote" },
      { label: "Payments", href: "/docs/payments", icon: Plug, hint: "Pay via connected providers", keywords: "payout transfer execute beneficiary" },
    ],
  },
  {
    label: "Reference",
    links: [
      { label: "API", href: "/docs/api", icon: Code2, hint: "Endpoints, auth and errors", keywords: "rest http endpoint authentication errors rate limit" },
      { label: "SDKs", href: "/docs/sdks", icon: Package, hint: "TypeScript and Python", keywords: "typescript python npm pip client library" },
      { label: "CLI", href: "/docs/cli", icon: Terminal, hint: "Railor from your terminal", keywords: "command line shell terminal" },
      { label: "MCP", href: "/docs/mcp", icon: Zap, hint: "Let AI agents use Railor", keywords: "claude cursor codex agent ai tools" },
    ],
  },
  {
    label: "Product",
    links: [
      { label: "Changelog", href: "/docs/changelog", icon: History, hint: "What shipped recently", keywords: "release updates new" },
      { label: "Trust", href: "/company/trust", icon: ShieldCheck, hint: "How sources are checked", keywords: "security verification evidence" },
    ],
  },
];

/** Reading order for the pager: only pages that live under /docs. */
export const DOCS_PAGES: DocsLink[] = DOCS_NAV.flatMap((group) => group.links).filter((link) =>
  link.href.startsWith("/docs"),
);
