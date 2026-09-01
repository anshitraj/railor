"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Code2,
  GitCompare,
  Globe,
  History,
  Info,
  Map as MapIcon,
  Menu,
  Package,
  Plug,
  Radar,
  Radio,
  Route,
  Search,
  ShieldCheck,
  Terminal,
  Warehouse,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { StageBadge, cn, type Stage } from "@railor/ui";

interface MenuItem {
  label: string;
  href: string;
  hint: string;
  stage: Stage;
  icon: LucideIcon;
}

const MENUS: Record<string, { items: MenuItem[]; panel: { title: string; body: string; href: string } }> = {
  Product: {
    items: [
      { label: "Search", href: "/#search", hint: "Ask in plain language, get structured filters", stage: "live", icon: Search },
      { label: "Corridor Explorer", href: "/app/corridors", hint: "Every provider for a route, with reasons", stage: "live", icon: Route },
      { label: "Provider Intelligence", href: "/providers", hint: "Coverage, requirements, limits, sources", stage: "live", icon: Warehouse },
      { label: "Change Monitoring", href: "/app/monitoring", hint: "Know before your integration breaks", stage: "live", icon: Radar },
      { label: "Comparisons", href: "/app/compare", hint: "2–4 providers, differences only", stage: "live", icon: GitCompare },
      { label: "Connections", href: "/company/roadmap", hint: "Connect the providers you already use", stage: "soon", icon: Plug },
    ],
    panel: {
      title: "One question, one answer",
      body: "“Indian company sending USDC to a UAE supplier who receives AED” resolves to 15 providers checked, each with a verdict, a reason and a source.",
      href: "/#search",
    },
  },
  Developers: {
    items: [
      { label: "API", href: "/docs/api", hint: "REST with evidence on every claim", stage: "beta", icon: Code2 },
      { label: "Documentation", href: "/docs", hint: "Runnable snippets, your own test key", stage: "live", icon: BookOpen },
      { label: "MCP", href: "/docs/mcp", hint: "Let coding agents query verified data", stage: "beta", icon: Zap },
      { label: "SDKs", href: "/docs/sdks", hint: "TypeScript and Python", stage: "beta", icon: Package },
      { label: "CLI", href: "/docs/cli", hint: "railor corridors search", stage: "soon", icon: Terminal },
      { label: "Changelog", href: "/docs/changelog", hint: "What shipped", stage: "live", icon: History },
    ],
    panel: {
      title: "Built API-first",
      body: "Every screen in Railor is a thin client over the same endpoints you get. Signed in, the docs render with your key and your last corridor.",
      href: "/docs",
    },
  },
  Resources: {
    items: [
      { label: "Provider Directory", href: "/providers", hint: "Filter by market, product, rail", stage: "live", icon: Warehouse },
      { label: "Market Coverage", href: "/coverage", hint: "Which corridors are well served", stage: "live", icon: Globe },
      { label: "Change Feed", href: "/changes", hint: "Everything Railor detected", stage: "live", icon: Radio },
      { label: "Guides", href: "/docs/guides", hint: "How to evaluate a rail", stage: "soon", icon: BookOpen },
    ],
    panel: {
      title: "Evidence, not vibes",
      body: "Each claim carries its source, the time it was retrieved, the time it was last verified, and a confidence score that decays with age.",
      href: "/changes",
    },
  },
  Company: {
    items: [
      { label: "About", href: "/company", hint: "Why Railor exists", stage: "live", icon: Info },
      { label: "Roadmap", href: "/company/roadmap", hint: "Intelligence → orchestration", stage: "live", icon: MapIcon },
      { label: "Trust", href: "/company/trust", hint: "How we handle data and claims", stage: "live", icon: ShieldCheck },
    ],
    panel: {
      title: "Say unknown, not wrong",
      body: "Railor would rather return “unknown” than a confident answer it cannot evidence. That principle outranks every other product decision.",
      href: "/company/trust",
    },
  },
};

export function MarketingNav() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50 mx-auto w-full border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-paper)_88%,transparent)] backdrop-blur-xl"
      onMouseLeave={() => setOpen(null)}
    >
      <nav className="mx-auto flex w-[min(1360px,calc(100%-2rem))] items-center gap-1 py-3">
        <Link href="/" className="flex items-center gap-2.5 pr-5 py-1">
          <RailorMark size={30} />
          <span className="font-display text-[21px] font-bold tracking-[-0.055em]">Railor</span>
        </Link>

        <div className="hidden items-center gap-0.5 md:flex">
          {Object.keys(MENUS).map((key) => (
            <button
              key={key}
              type="button"
              onMouseEnter={() => setOpen(key)}
              onFocus={() => setOpen(key)}
              onClick={() => setOpen(open === key ? null : key)}
              aria-expanded={open === key}
              className={cn(
                "rounded-full px-3 py-1.5 text-[13px] font-semibold transition",
                open === key
                  ? "bg-[var(--color-ink)] text-white"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)]",
              )}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <Link
          href="/#search"
          className="hidden rounded-full px-3 py-1.5 text-[13px] font-semibold text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)] sm:block"
        >
          Search rails
        </Link>
        <Link
          href="/login"
          className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)]"
        >
          Sign in
        </Link>
        <Link
          href="/login?intent=start"
          className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-[13px] font-bold text-white transition hover:bg-[var(--color-orange-deep)]"
        >
          Get started
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] transition hover:bg-[var(--color-sand)] md:hidden"
        >
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-full hidden w-[min(980px,calc(100%-2rem))] -translate-x-1/2 pt-3 md:block"
            onMouseEnter={() => setOpen(open)}
          >
            <div className="grid gap-6 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-paper)] p-6 shadow-[var(--shadow-panel)] lg:grid-cols-[1.5fr_1fr]">
              <ul className="grid gap-1 sm:grid-cols-2">
                {MENUS[open]!.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="flex items-start gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-[var(--color-canvas)]"
                      onClick={() => setOpen(null)}
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-sand)] text-[var(--color-orange-deep)]">
                        <item.icon size={16} strokeWidth={2} />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2 text-[14px] font-medium text-[var(--color-ink)]">
                          {item.label}
                          {item.stage !== "live" ? <StageBadge stage={item.stage} /> : null}
                        </span>
                        <span className="text-[12.5px] leading-snug text-[var(--color-muted)]">
                          {item.hint}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <Link
                href={MENUS[open]!.panel.href}
                onClick={() => setOpen(null)}
                className="flex flex-col justify-between gap-4 rounded-[var(--radius-card)] bg-[var(--color-ink)] p-5 text-white transition hover:bg-[var(--color-orange-deep)]"
              >
                <div className="flex flex-col gap-2">
                  <p className="text-[15px] font-semibold text-white">
                    {MENUS[open]!.panel.title}
                  </p>
                  <p className="text-[13px] leading-relaxed text-white/65">
                    {MENUS[open]!.panel.body}
                  </p>
                </div>
                <span className="text-[13px] font-medium text-[var(--color-orange)]">Open →</span>
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-[var(--color-line)] md:hidden"
          >
            <div className="max-h-[75vh] overflow-y-auto px-4 py-3">
              <Link
                href="/#search"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2.5 text-[14px] font-semibold text-[var(--color-ink)] hover:bg-[var(--color-sand)]"
              >
                Search rails
              </Link>
              {Object.entries(MENUS).map(([key, menu]) => (
                <div key={key} className="mt-3 border-t border-[var(--color-line)] pt-3 first:mt-0 first:border-0 first:pt-0">
                  <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-faint)]">
                    {key}
                  </p>
                  <ul className="flex flex-col">
                    {menu.items.map((item) => (
                      <li key={item.label}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-sand)]"
                        >
                          <item.icon size={16} strokeWidth={2} className="text-[var(--color-orange-deep)]" />
                          {item.label}
                          {item.stage !== "live" ? <StageBadge stage={item.stage} /> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

export function RailorMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d="M5 6h19.2C35 6 42 12.8 42 22.2c0 6.05-3.35 10.6-8.8 13.05L43 43H27.6l-11-9.7H15v9.7H5V6Zm10 9.3v9.05h9.15c4.7 0 7.6-1.52 7.6-4.62 0-2.95-2.75-4.4-7.6-4.4H15Z" fill="var(--color-orange)" />
      <rect x="16.4" y="16.1" width="13.1" height="7" rx="3.5" fill="var(--color-paper)" />
      <circle cx="20.2" cy="19.6" r="1.55" fill="var(--color-ink)" />
      <circle cx="25.7" cy="19.6" r="1.55" fill="var(--color-ink)" />
    </svg>
  );
}
