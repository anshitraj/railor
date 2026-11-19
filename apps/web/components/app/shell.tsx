"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Bot,
  ArrowLeftRight,
  Bookmark,
  Calculator,
  ChevronsLeft,
  ChevronsRight,
  Code2,
  FileCheck2,
  FileSearch,
  FileText,
  GitCompare,
  Globe2,
  History,
  LayoutDashboard,
  Link2,
  ListChecks,
  LogOut,
  Menu,
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
import { ProviderLogo } from "./provider-logo";
import { workspaceArea } from "../../lib/workspace-navigation";
import { isCompanyPath } from "../../lib/workspace-profile";
import { WorkspaceAreaNav } from "./workspace-area-nav";
import { UserAvatar } from "./user-avatar";
import mobileStyles from "./mobile-navigation.module.css";
import sidebarStyles from "./workspace-sidebar.module.css";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  stage?: "beta" | "soon";
  /** Only the exact path counts as active (the Overview root would otherwise match every page). */
  exact?: boolean;
}

/** Every workspace page, grouped by area — used by the command palette and the breadcrumb. */
export const NAV_GROUPS: Array<{ title: string | null; icon?: LucideIcon; items: NavItem[] }> = [
  { title: null, items: [
    { href: "/app", label: "Home", icon: LayoutDashboard, exact: true },
    { href: "/app/saved", label: "Saved", icon: Bookmark },
    { href: "/app/agent", label: "Agent", icon: Bot, stage: "beta" },
  ] },
  { title: "Transfer", icon: ArrowLeftRight, items: [
    { href: "/app/prices", label: "Compare & send", icon: ArrowLeftRight },
    { href: "/app/freelancer", label: "Get paid · invoices", icon: FileText, stage: "beta" },
  ] },
  { title: "Routes", icon: Route, items: [
    { href: "/app/search", label: "Find a route", icon: ScanSearch },
    { href: "/app/providers", label: "Providers", icon: Warehouse },
    { href: "/app/compare", label: "Compare providers", icon: GitCompare },
    { href: "/app/map", label: "Route map", icon: Globe2 },
  ] },
  { title: "Company", icon: Building2, items: [
    { href: "/app/audit", label: "Payment audit", icon: FileSearch },
    { href: "/app/payroll", label: "Payroll pricing", icon: Users },
    { href: "/app/policies", label: "Company rules", icon: ListChecks },
    { href: "/app/decisions", label: "Rule checks", icon: Scale },
    { href: "/app/approvals", label: "Team reviews", icon: BadgeCheck },
  ] },
  { title: "Activity", icon: Activity, items: [
    { href: "/app/payments", label: "Payments", icon: History },
    { href: "/app/changes", label: "Changes", icon: Activity },
    { href: "/app/monitoring", label: "Monitoring", icon: Radar },
    { href: "/app/evidence", label: "Evidence", icon: FileCheck2 },
    { href: "/app/routing", label: "Routing", icon: Shuffle },
  ] },
  { title: "Developers", icon: Code2, items: [
    { href: "/app/developers", label: "API & AI tools", icon: Code2 },
    { href: "/app/settings/connections", label: "Provider accounts", icon: Link2 },
  ] },
];

const PRIMARY_NAV: Array<{ title: string; items: NavItem[] }> = [
  { title: "Dashboard", items: [
    { href: "/app", label: "Home", icon: LayoutDashboard },
    { href: "/app/saved", label: "Saved", icon: Bookmark },
    { href: "/app/prices", label: "Transfer", icon: ArrowLeftRight },
    { href: "/app/search", label: "Routes", icon: Route },
    { href: "/app/agent", label: "Agent", icon: Bot, stage: "beta" },
  ] },
  { title: "Operations", items: [
    { href: "/app/audit", label: "Company", icon: Building2 },
    { href: "/app/payments", label: "Activity", icon: Activity },
    { href: "/app/developers", label: "Developers", icon: Code2 },
  ] },
];

/** Phones get the four most-used places plus a way to everything else. */
const MOBILE_NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/app/prices", label: "Transfer", icon: ArrowLeftRight },
  { href: "/app/search", label: "Routes", icon: Route },
  { href: "/app/payments", label: "Activity", icon: Activity },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppShell({
  children,
  orgName,
  userEmail,
  userName = null,
  userAvatar = null,
  isDemo = false,
  company = true,
  palette,
}: {
  children: React.ReactNode;
  orgName: string;
  userEmail: string;
  userName?: string | null;
  /** Google or GitHub profile photo. */
  userAvatar?: string | null;
  isDemo?: boolean;
  /** Company tools (rules, reviews, audit, payroll) show only in company workspaces. */
  company?: boolean;
  palette: Array<{ id: string; label: string; group: string; href: string; hint?: string; keywords?: string }>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [keyboard, setKeyboard] = useState({ open: false, height: 0 });
  const drawerRef = useModalFocus<HTMLElement>(mobileOpen, () => setMobileOpen(false));
  const currentGroup = NAV_GROUPS.find((group) => group.items.some((item) => isActive(pathname, item)));
  const groups = company ? NAV_GROUPS : NAV_GROUPS.filter((group) => !group.items.every((item) => isCompanyPath(item.href)));
  const primary = company ? PRIMARY_NAV : PRIMARY_NAV.map((group) => ({ ...group, items: group.items.filter((item) => !isCompanyPath(item.href)) }));
  const currentPage = currentGroup?.items.find((item) => isActive(pathname, item))?.label ?? "Settings";
  const compact = collapsed && !mobileOpen;

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let baselineHeight = window.innerHeight;
    let baselineWidth = window.innerWidth;
    const fit = () => {
      if (Math.abs(window.innerWidth - baselineWidth) > 80) { baselineHeight = window.innerHeight; baselineWidth = window.innerWidth; }
      const element = document.activeElement;
      const editing = element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "file", "range", "color", "hidden", "reset", "image"].includes(element.type)) || (element instanceof HTMLElement && element.isContentEditable);
      if (!editing) baselineHeight = window.innerHeight;
      const open = window.innerWidth < 768 && editing && Math.max(window.innerHeight, baselineHeight) - viewport.height > 120;
      setKeyboard(current => current.open === open && current.height === Math.round(viewport.height) ? current : { open, height: Math.round(viewport.height) });
    };
    fit(); viewport.addEventListener("resize", fit); window.addEventListener("resize", fit); document.addEventListener("focusin", fit); document.addEventListener("focusout", fit);
    return () => { viewport.removeEventListener("resize", fit); window.removeEventListener("resize", fit); document.removeEventListener("focusin", fit); document.removeEventListener("focusout", fit); };
  }, []);
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

  const pageItems: typeof palette = groups.flatMap((g) => g.items).map((item) => ({
    id: `page:${item.href}`,
    label: item.label,
    group: "Go to",
    href: item.href,
  }));
  const navItems = NAV_GROUPS.flatMap((group) => group.items);
  const items: CommandItem[] = [...pageItems, ...palette, { id: "page:/app/settings", label: "Settings", group: "Go to", href: "/app/settings" }].map((p) => {
    const Icon = p.id === "action:invite" ? Users : navItems.find((item) => item.href === p.href || (!item.exact && p.href.startsWith(`${item.href}/`)))?.icon;
    return {
      id: p.id,
      label: p.label,
      group: p.group,
      hint: p.hint,
      keywords: p.keywords,
      icon: p.group === "Provider"
        ? <ProviderLogo slug={p.id.replace(/^provider:/, "")} name={p.label} size={30} />
        : Icon ? <Icon size={17} /> : undefined,
      run: () => router.push(p.href),
    };
  });
  const providerItems = items.filter((i) => i.group === "Provider");
  const featuredProviders = ["wise", "circle", "bridge"].flatMap((slug) => providerItems.find((i) => i.id === `provider:${slug}`) ?? []);
  const recent = [
    ...items.filter((i) => i.group === "Corridor").slice(0, 2),
    ...items.filter((i) => i.group === "Action").slice(0, 4),
    ...[...featuredProviders, ...providerItems.filter((i) => !featuredProviders.includes(i))].slice(0, 3),
  ];

  const area = workspaceArea(pathname);
  const settingsActive = area === "Settings";

  return (
    <div className={cn("workspace-frame flex min-h-screen bg-[var(--color-canvas)]", mobileStyles.frame)} style={{ ...(keyboard.open ? { "--workspace-mobile-nav-height": "0px", "--workspace-viewport-height": `${keyboard.height}px` } : {}) } as CSSProperties}>
      {mobileOpen ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className={sidebarStyles.scrim}
        />
      ) : null}

      <aside
        id="workspace-navigation"
        ref={drawerRef}
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen || undefined}
        aria-label="Workspace menu"
        tabIndex={-1}
        className={cn("workspace-sidebar", sidebarStyles.sidebar)}
        data-open={mobileOpen}
        data-compact={compact}
      >
        <div className={sidebarStyles.brandRow}>
          <Link href="/app" aria-label="Railor overview" className={sidebarStyles.brand} onClick={() => setMobileOpen(false)}>
            <span className={sidebarStyles.mark}><RailorMark size={24} /></span>
            {!compact && <span>Railor</span>}
          </Link>
          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className={cn(sidebarStyles.control, sidebarStyles.close)}>
            <X size={19} aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            title={compact ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(sidebarStyles.control, sidebarStyles.collapse)}
          >
            {compact ? <ChevronsRight size={16} aria-hidden /> : <ChevronsLeft size={16} aria-hidden />}
          </button>
        </div>

        <nav aria-label="Dashboard" className={sidebarStyles.nav}>
          {primary.map(({ title, items }) => (
            <div key={title} className={sidebarStyles.group}>
              {!compact && <p aria-hidden="true" className={sidebarStyles.groupTitle}>{title}</p>}
              <ul aria-label={title}>
                {items.map((item) => {
                  const active = area === item.label;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={compact ? item.label : undefined}
                        aria-label={compact ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={sidebarStyles.link}
                        onClick={() => setMobileOpen(false)}
                      >
                        {active && (
                          <motion.span
                            layoutId="sidebar-active"
                            className={sidebarStyles.activePlate}
                            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 470, damping: 38 }}
                            aria-hidden
                          />
                        )}
                        <span className={sidebarStyles.linkIcon}><item.icon size={17} strokeWidth={active ? 2.15 : 1.8} aria-hidden /></span>
                        {!compact && <>
                          <span className={sidebarStyles.linkLabel}>{item.label}</span>
                          {item.stage && <span className={sidebarStyles.stageBadge}><StageBadge stage={item.stage} /></span>}
                          {active && !item.stage && <ArrowUpRight className={sidebarStyles.currentArrow} size={14} aria-hidden />}
                        </>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={sidebarStyles.footer}>
          <Link
            href="/app/settings"
            title={compact ? "Settings" : undefined}
            aria-label={compact ? "Settings" : undefined}
            aria-current={settingsActive ? "page" : undefined}
            className={cn(sidebarStyles.link, sidebarStyles.settings)}
            onClick={() => setMobileOpen(false)}
          >
            <span className={sidebarStyles.linkIcon}><Settings size={17} strokeWidth={1.8} aria-hidden /></span>
            {!compact && <span className={sidebarStyles.linkLabel}>Settings</span>}
          </Link>
          {!compact && (
            <Link href="/app/settings" className={sidebarStyles.account} onClick={() => setMobileOpen(false)} aria-label="Your profile and settings">
              <UserAvatar src={userAvatar} name={userName} email={userEmail} size={32} />
              <span className={sidebarStyles.accountText}>
                <strong title={userName ?? orgName}>{userName ?? orgName}</strong>
                <small title={userEmail}>{userEmail}</small>
              </span>
            </Link>
          )}
          <form action="/api/auth/signout" method="post" className="md:hidden">
            <button type="submit" className={sidebarStyles.link}>
              <span className={sidebarStyles.linkIcon}><LogOut size={17} aria-hidden /></span>
              <span className={sidebarStyles.linkLabel}>Sign out</span>
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
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="workspace-navigation"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)] md:hidden"
          >
            <Menu size={19} />
          </button>
          <Link href="/app" aria-label="Railor overview" className="mr-1 shrink-0 md:hidden"><RailorMark size={23} /></Link>
          <div className="mr-auto hidden min-w-0 items-center gap-2 text-[12px] lg:flex"><span className="text-[var(--color-muted)]">{workspaceArea(pathname) === currentPage ? "Dashboard" : workspaceArea(pathname)}</span><span aria-hidden className="text-[var(--color-faint)]">/</span><span className="truncate font-semibold">{currentPage}</span></div>
          <CommandPalette items={items} recent={recent} brand={<RailorMark size={22} />} />
          <span className="flex-1 lg:hidden" />
          <Link
            href="/app/prices"
            aria-label="New transfer"
            className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-[var(--color-action)] px-3 text-[12px] font-semibold text-white transition hover:bg-[var(--color-orange-deep)] sm:px-3.5"
          >
            <ArrowLeftRight size={16} aria-hidden className="mr-2" />
            <span className="sm:hidden">Transfer</span>
            <span className="hidden sm:inline">New transfer</span>
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

        <main id="main" className={cn("min-w-0 flex-1 px-4 py-6 sm:px-7 sm:py-8", mobileStyles.main)}>
          {/* Keyed by path so each workspace page lands with the same short rise (CSS; reduced-motion aware). */}
          <div key={pathname} className="railor-page-in mx-auto max-w-[1320px]">
            <WorkspaceAreaNav />
            {children}
          </div>
        </main>
      </div>
      <nav aria-label="Mobile navigation" hidden={mobileOpen || keyboard.open} className={mobileStyles.bottomNav}>
        {MOBILE_NAV.map(item => {
          const active = area === item.label;
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={mobileStyles.item}>
            <span className={mobileStyles.icon}>
              {active && <motion.span layoutId="mobile-current-icon" aria-hidden className={mobileStyles.pill} transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 36 }} />}
              <item.icon size={20} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
            </span>
            <span>{item.label}</span>
          </Link>;
        })}
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="More workspace destinations" aria-expanded={mobileOpen} aria-controls="workspace-navigation" className={mobileStyles.item}>
          <span className={mobileStyles.icon}><Menu size={20} strokeWidth={1.8} aria-hidden /></span>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
