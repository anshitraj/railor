import {
  BookOpen,
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
      { label: "Overview", href: "/docs", icon: BookOpen },
      { label: "Guides", href: "/docs/guides", icon: Compass },
      { label: "Payments", href: "/docs/payments", icon: Plug },
    ],
  },
  {
    label: "Reference",
    links: [
      { label: "API", href: "/docs/api", icon: Code2 },
      { label: "SDKs", href: "/docs/sdks", icon: Package },
      { label: "CLI", href: "/docs/cli", icon: Terminal },
      { label: "MCP", href: "/docs/mcp", icon: Zap },
    ],
  },
  {
    label: "Product",
    links: [
      { label: "Changelog", href: "/docs/changelog", icon: History },
      { label: "Trust", href: "/company/trust", icon: ShieldCheck },
    ],
  },
];

/** Reading order for the pager: only pages that live under /docs. */
export const DOCS_PAGES: DocsLink[] = DOCS_NAV.flatMap((group) => group.links).filter((link) =>
  link.href.startsWith("/docs"),
);
