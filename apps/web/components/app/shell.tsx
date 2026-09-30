"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Activity,
  Banknote,
  BadgeCheck,
  Bot,
  Calculator,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  Code2,
  FileCheck2,
  GitCompare,
  Globe2,
  LayoutDashboard,
  Link2,
  ListChecks,
  LogOut,
  Menu,
  Plug,
  Radar,
  Route,
  ScanSearch,
  Scale,
  Settings,
  Shuffle,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { CommandPalette, StageBadge, cn, type CommandItem } from "@railor/ui";
import { RailorMark } from "../marketing/nav";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  stage?: "beta" | "soon";
  /** Only the exact path counts as active (the Overview root would otherwise match every page). */
  exact?: boolean;
}

export const NAV_GROUPS: Array<{ title: string | null; items: NavItem[] }> = [
  { title: null, items: [{ href: "/app", label: "Overview", icon: LayoutDashboard, exact: true }] },
  {
    title: "Explore",
    items: [
      { href: "/app/corridors", label: "Corridors", icon: Route },
      { href: "/app/map", label: "Route map", icon: Globe2 },
      { href: "/app/providers", label: "Providers", icon: Warehouse },
      { href: "/app/compare", label: "Compare", icon: GitCompare },
    ],
  },
  {
    title: "Move money",
    items: [
      { href: "/app/payments", label: "Payments", icon: Banknote, stage: "beta" },
      { href: "/app/prices", label: "Price check", icon: Calculator },
      { href: "/app/beneficiaries", label: "Beneficiaries", icon: Users },
      { href: "/app/routing", label: "Routing", icon: Shuffle },
      { href: "/app/settings/connections", label: "Connections", icon: Link2 },
    ],
  },
  {
    title: "Decide",
    items: [
      { href: "/app/decisions", label: "Decisions", icon: Scale },
      { href: "/app/approvals", label: "Approvals", icon: BadgeCheck },
      { href: "/app/policies", label: "Policies", icon: ListChecks },
      { href: "/app/agent", label: "Agent", icon: Bot, stage: "beta" },
    ],
  },
  {
    title: "Monitor",
    items: [
      { href: "/app/monitoring", label: "Monitoring", icon: Radar },
      { href: "/app/changes", label: "Changes", icon: Activity },
      { href: "/app/evidence", label: "Evidence", icon: FileCheck2 },
      { href: "/app/discovery", label: "Discovery review", icon: ScanSearch },
    ],
  },
  {
    title: "Build",
    items: [
      { href: "/app/readiness", label: "Readiness", icon: ClipboardCheck },
      { href: "/app/connectors", label: "Connectors", icon: Plug, stage: "beta" },
      { href: "/app/developers", label: "Developers", icon: Code2 },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppShell({
  children,
  orgName,
  userEmail,
  isDemo = false,
  palette,
}: {
  children: React.ReactNode;
  orgName: string;
  userEmail: string;
  isDemo?: boolean;
  palette: Array<{ id: string; label: string; group: string; href: string; hint?: string; keywords?: string }>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  // Collapsing is a per-viewer convenience; storage can be unavailable (private windows).
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("railor.sidebar") === "collapsed");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((v) => {
      try {
        window.localStorage.setItem("railor.sidebar", v ? "open" : "collapsed");
      } catch {
        /* ignore */
      }
      return !v;
    });

  const pageItems: typeof palette = NAV_GROUPS.flatMap((g) => g.items).map((item) => ({
    id: `page:${item.href}`,
    label: item.label,
    group: "Go to",
    href: item.href,
  }));
  const items: CommandItem[] = [...pageItems, ...palette, { id: "page:/app/settings", label: "Settings", group: "Go to", href: "/app/settings" }].map((p) => ({
    id: p.id,
    label: p.label,
    group: p.group,
    hint: p.hint,
    keywords: p.keywords,
    run: () => router.push(p.href),
  }));
  const recent = items.filter((i) => i.group === "Corridor" || i.group === "Action").slice(0, 8);

  const settingsActive = pathname.startsWith("/app/settings") && !pathname.startsWith("/app/settings/connections");

  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)]">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-[rgb(23_23_27/0.32)] backdrop-blur-[1px] md:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[248px] shrink-0 flex-col gap-1 border-r border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-4 transition-[transform,width] duration-200 ease-out md:sticky md:top-0 md:z-0 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-[68px]" : "md:w-[224px]",
        )}
      >
        <div className="mb-3 flex items-center gap-2 px-2">
          <Link href="/app" className="flex flex-1 items-center gap-2">
            <RailorMark />
            {!collapsed ? (
              <span className="font-display text-[17px] font-bold tracking-[-0.05em]">Railor</span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-canvas)] md:hidden"
          >
            <X size={17} />
          </button>
        </div>

        {!collapsed ? (
          <Link
            href="/app/settings"
            className="mb-2 flex items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-2 transition hover:border-[var(--color-line-strong)]"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-ink)] text-[12px] font-bold uppercase text-white">
              {orgName.trim().charAt(0) || "R"}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{orgName}</span>
              <span className="block truncate text-[11px] text-[var(--color-muted)]">{userEmail}</span>
            </span>
          </Link>
        ) : null}

        <nav aria-label="Workspace" className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-2 [scrollbar-width:thin]">
          {NAV_GROUPS.map((group) => (
            <div key={group.title ?? "root"} className="flex flex-col gap-0.5">
              {group.title && !collapsed ? (
                <p className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-faint)]">
                  {group.title}
                </p>
              ) : group.title ? (
                <span className="mx-3 my-1 h-px bg-[var(--color-line)]" aria-hidden />
              ) : null}
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-[13.5px] transition-colors",
                      active
                        ? "font-semibold text-[var(--color-orange-deep)]"
                        : "text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]",
                      collapsed && "justify-center",
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-xl bg-[var(--color-lavender)]"
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
                        aria-hidden
                      />
                    ) : null}
                    <item.icon size={16} strokeWidth={active ? 2.25 : 1.9} className="relative shrink-0" aria-hidden />
                    {!collapsed ? (
                      <span className="relative flex flex-1 items-center gap-1.5">
                        {item.label}
                        {item.stage ? <StageBadge stage={item.stage} /> : null}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-0.5 border-t border-[var(--color-line)] pt-2">
          <Link
            href="/app/settings"
            title={collapsed ? "Settings" : undefined}
            aria-current={settingsActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] transition-colors",
              settingsActive
                ? "bg-[var(--color-lavender)] font-semibold text-[var(--color-orange-deep)]"
                : "text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)]",
              collapsed && "justify-center",
            )}
          >
            <Settings size={16} strokeWidth={1.9} aria-hidden />
            {!collapsed ? "Settings" : null}
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] text-[var(--color-muted)] hover:bg-[var(--color-canvas)] md:flex",
              collapsed && "justify-center",
            )}
          >
            {collapsed ? <ChevronsRight size={16} aria-hidden /> : <ChevronsLeft size={16} aria-hidden />}
            {!collapsed ? "Collapse" : null}
          </button>
          <form action="/api/auth/signout" method="post" className="md:hidden">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] text-[var(--color-muted)] hover:bg-[var(--color-canvas)]"
            >
              <LogOut size={16} aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo ? (
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-[var(--color-orange)] px-4 py-1.5 text-center text-[12.5px] font-medium text-white">
            <span>You&apos;re viewing the shared demo — it resets every time someone clicks &quot;View demo&quot;.</span>
            <Link href="/login" className="underline decoration-white/50 underline-offset-2 hover:decoration-white">
              Create your own free workspace →
            </Link>
          </div>
        ) : null}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-canvas)]/85 px-3 py-2.5 backdrop-blur sm:gap-3 sm:px-6 sm:py-3">
          <button
            type="button"
            onClick={() => {
              setCollapsed(false);
              setMobileOpen(true);
            }}
            aria-label="Open menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)] md:hidden"
          >
            <Menu size={19} />
          </button>
          <CommandPalette items={items} recent={recent} />
          <span className="flex-1" />
          <Link
            href="/app/corridors"
            className="rounded-full bg-[var(--color-purple)] px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--color-purple-deep)] sm:px-3.5"
          >
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New corridor</span>
          </Link>
          <form action="/api/auth/signout" method="post" className="hidden md:block">
            <button
              type="submit"
              className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[13px] text-[var(--color-muted)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]"
            >
              Sign out
            </button>
          </form>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {/* Keyed by path so each workspace page lands with the same short rise (CSS; reduced-motion aware). */}
          <div key={pathname} className="railor-page-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
