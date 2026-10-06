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
  ChevronDown,
  ClipboardCheck,
  Code2,
  FileCheck2,
  FileText,
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
import { CommandPalette, StageBadge, cn, useModalFocus, type CommandItem } from "@railor/ui";
import { RailorMark } from "../marketing/nav";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  stage?: "beta" | "soon";
  /** Only the exact path counts as active (the Overview root would otherwise match every page). */
  exact?: boolean;
}

export const NAV_GROUPS: Array<{ title: string | null; icon?: LucideIcon; items: NavItem[] }> = [
  { title: null, items: [
    { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/app/prices", label: "Price check", icon: Calculator },
    { href: "/app/freelancer", label: "Freelancer", icon: FileText, stage: "beta" },
    { href: "/app/search", label: "Search & compare", icon: ScanSearch },
    { href: "/app/corridors", label: "Corridors", icon: Route },
    { href: "/app/payments", label: "Payments", icon: Banknote, stage: "beta" },
    { href: "/app/agent", label: "Agent", icon: Bot, stage: "beta" },
  ] },
  {
    title: "Infrastructure",
    icon: Globe2,
    items: [
      { href: "/app/map", label: "Route map", icon: Globe2 },
      { href: "/app/providers", label: "Providers", icon: Warehouse },
      { href: "/app/compare", label: "Compare", icon: GitCompare },
    ],
  },
  {
    title: "Move money",
    icon: Banknote,
    items: [
      { href: "/app/beneficiaries", label: "Beneficiaries", icon: Users },
      { href: "/app/routing", label: "Routing", icon: Shuffle },
      { href: "/app/settings/connections", label: "Connections", icon: Link2 },
    ],
  },
  {
    title: "Controls",
    icon: ListChecks,
    items: [
      { href: "/app/decisions", label: "Decisions", icon: Scale },
      { href: "/app/approvals", label: "Approvals", icon: BadgeCheck },
      { href: "/app/policies", label: "Policies", icon: ListChecks },
    ],
  },
  {
    title: "Monitor",
    icon: Radar,
    items: [
      { href: "/app/monitoring", label: "Monitoring", icon: Radar },
      { href: "/app/changes", label: "Changes", icon: Activity },
      { href: "/app/evidence", label: "Evidence", icon: FileCheck2 },
      { href: "/app/discovery", label: "Discovery review", icon: ScanSearch },
    ],
  },
  {
    title: "Build",
    icon: Code2,
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
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const drawerRef = useModalFocus<HTMLElement>(mobileOpen, () => setMobileOpen(false));
  const currentGroup = NAV_GROUPS.find((group) => group.items.some((item) => isActive(pathname, item)));
  const currentPage = currentGroup?.items.find((item) => isActive(pathname, item))?.label ?? "Settings";

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    const title = NAV_GROUPS.find((group) => group.title && group.items.some((item) => isActive(pathname, item)))?.title;
    if (title) setOpenGroups((groups) => groups.includes(title) ? groups : [...groups, title]);
  }, [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

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
    <div className="workspace-frame flex min-h-screen bg-[var(--color-canvas)]">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-[rgb(23_23_27/0.32)] backdrop-blur-[1px] md:hidden"
        />
      ) : null}

      <aside
        ref={drawerRef}
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen || undefined}
        aria-label="Workspace menu"
        tabIndex={-1}
        className={cn(
          "workspace-sidebar fixed inset-y-0 left-0 z-50 flex h-dvh w-[272px] shrink-0 flex-col gap-1 border-r border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-5 transition-[transform,visibility] duration-200 ease-out md:sticky md:top-0 md:z-0 md:visible md:translate-x-0",
          mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full",
          collapsed ? "md:w-[72px]" : "md:w-[244px]",
        )}
      >
        <div className="mb-3 flex items-center gap-2 px-2">
          <Link href="/app" aria-label="Railor overview" className="flex flex-1 items-center gap-2.5">
            <RailorMark size={28} />
            {!collapsed ? (
              <span className="font-display text-[21px] font-bold tracking-[-0.05em]">Railor</span>
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

        <nav aria-label="Workspace" className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-1 pb-2 [scrollbar-width:thin]">
          {NAV_GROUPS.map((group) => {
            const open = !group.title || openGroups.includes(group.title);
            const groupId = `nav-${group.title?.toLowerCase().replaceAll(" ", "-") ?? "main"}`;
            return <div key={group.title ?? "root"} className={cn("flex flex-col gap-0.5", !group.title && "mb-4")}>
              {group.title ? (
                <button type="button" title={collapsed ? group.title : undefined} aria-label={collapsed ? group.title : undefined} aria-expanded={!collapsed && open} aria-controls={groupId}
                  onClick={() => {
                    if (collapsed) { setCollapsed(false); setOpenGroups((groups) => groups.includes(group.title!) ? groups : [...groups, group.title!]); }
                    else setOpenGroups((groups) => groups.includes(group.title!) ? groups.filter((title) => title !== group.title) : [...groups, group.title!]);
                  }}
                  className={cn("sidebar-group-toggle flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-canvas)]", collapsed && "justify-center")}>
                  {group.icon ? <group.icon size={17} aria-hidden /> : null}
                  {!collapsed ? <><span className="flex-1 text-left">{group.title}</span><ChevronDown size={14} aria-hidden className={cn("transition-transform duration-200", open && "rotate-180")} /></> : null}
                </button>
              ) : null}
              <div id={groupId} hidden={Boolean(group.title && (collapsed || !open))} className={cn(group.title && "sidebar-subnav")}>
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-11 items-center gap-3 rounded-xl px-2.5 py-2.5 text-[13px] transition-colors",
                      active
                        ? "font-semibold text-white"
                        : "text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]",
                      collapsed && "justify-center",
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-xl bg-[var(--color-ink)] shadow-[var(--shadow-soft)]"
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
                        aria-hidden
                      />
                    ) : null}
                    <item.icon size={19} strokeWidth={active ? 2.25 : 1.9} className={cn("relative shrink-0", active && "text-[var(--color-accent-light)]")} aria-hidden />
                    {!collapsed ? (
                      <span className="relative flex flex-1 items-center gap-1.5">
                        {item.label}
                        {item.stage ? <span className={cn("ml-auto", active && "[&>span]:border-white/20 [&>span]:bg-white/10 [&>span]:text-white/80")}><StageBadge stage={item.stage} /></span> : null}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
              </div>
            </div>;
          })}
        </nav>

        <div className="flex flex-col gap-0.5 border-t border-[var(--color-line)] pt-2">
          <Link
            href="/app/settings"
            title={collapsed ? "Settings" : undefined}
            aria-label={collapsed ? "Settings" : undefined}
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
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-[var(--color-action)] px-4 py-1.5 text-center text-[12.5px] font-medium text-white">
            <span>Demo workspace · shared and reset on each demo visit.</span>
            <Link href="/login" className="underline decoration-white/50 underline-offset-2 hover:decoration-white">
              Create a workspace →
            </Link>
          </div>
        ) : null}
        <header className="workspace-topbar sticky top-0 z-30 flex min-h-[72px] items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-paper)]/95 px-3 py-3 backdrop-blur sm:gap-3 sm:px-7">
          <button
            type="button"
            onClick={() => {
              setCollapsed(false);
              setMobileOpen(true);
            }}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)] md:hidden"
          >
            <Menu size={19} />
          </button>
          <Link href="/app" aria-label="Railor overview" className="mr-1 shrink-0 md:hidden"><RailorMark size={23} /></Link>
          <div className="mr-auto hidden min-w-0 items-center gap-2 text-[12px] lg:flex"><span className="text-[var(--color-muted)]">{currentGroup?.title ?? "Workspace"}</span><span aria-hidden className="text-[var(--color-faint)]">/</span><span className="truncate font-semibold">{currentPage}</span></div>
          <CommandPalette items={items} recent={recent} />
          <span className="flex-1 lg:hidden" />
          <Link
            href="/app/prices"
            aria-label="Check a price"
            className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-[var(--color-action)] px-3 text-[12px] font-semibold text-white transition hover:bg-[var(--color-orange-deep)] sm:px-3.5"
          >
            <Calculator size={16} aria-hidden className="mr-2" />
            <span className="sm:hidden">Price</span>
            <span className="hidden sm:inline">Check a price</span>
          </Link>
          <form action="/api/auth/signout" method="post" className="hidden md:block">
            <button
              type="submit"
              className="min-h-10 rounded-xl px-3 text-[12px] text-[var(--color-muted)] transition hover:bg-[var(--color-sand)] hover:text-[var(--color-ink)]"
            >
              Sign out
            </button>
          </form>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-7 sm:py-8">
          {/* Keyed by path so each workspace page lands with the same short rise (CSS; reduced-motion aware). */}
          <div key={pathname} className="railor-page-in mx-auto max-w-[1320px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
