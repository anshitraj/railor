"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Banknote, Building2, ClipboardCheck, FileClock, Globe2, KeyRound, LayoutDashboard, Menu, Plug, Radar, ScrollText, X, type LucideIcon } from "lucide-react";
import { cn, useModalFocus } from "@railor/ui";
import { RailorMark } from "../marketing/nav";

const NAV: Array<{ href: string; label: string; icon: LucideIcon; exact?: boolean }> = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/payments", label: "Payments ops", icon: Banknote },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/providers", label: "Providers", icon: Plug },
  { href: "/admin/review", label: "Review queue", icon: ClipboardCheck },
  { href: "/admin/discovery", label: "Web discovery", icon: Radar },
  { href: "/admin/research", label: "Country research", icon: Globe2 },
  { href: "/admin/usage", label: "Usage & demand", icon: Activity },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/access", label: "Founding access", icon: KeyRound },
];

export function AdminShell({ email, alerts, children }: { email: string; alerts: { unknownPayments: number; pendingReview: number; paused: boolean }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useModalFocus<HTMLElement>(open, () => setOpen(false));
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const badge: Record<string, number> = { "/admin/payments": alerts.unknownPayments, "/admin/review": alerts.pendingReview };
  return (
    <div className="admin-frame flex min-h-screen bg-[var(--color-canvas)]">
      {open ? <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/30 md:hidden" /> : null}
      <aside
        ref={drawerRef}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label="Operations menu"
        tabIndex={-1}
        className={cn(
          "workspace-sidebar fixed inset-y-0 left-0 z-50 flex h-dvh w-[244px] flex-col gap-1 bg-[var(--color-ink)] px-3 py-5 text-white transition-[transform,visibility] md:sticky md:top-0 md:visible md:translate-x-0",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="mb-4 flex items-center gap-2 px-2">
          <Link href="/admin" aria-label="Railor operations overview" className="flex items-center gap-2.5"><RailorMark size={28} />
          <span className="font-display text-[21px] font-bold tracking-[-0.05em]">Railor</span></Link>
          <span className="rounded-md bg-white/10 px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-[var(--color-accent-light)]">Ops</span>
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="ml-auto md:hidden">
            <X size={17} />
          </button>
        </div>
        {alerts.paused ? (
          <div className="mb-3 rounded-lg bg-[var(--color-bad)] px-3 py-2 text-[11.5px] font-semibold">Payments paused platform-wide</div>
        ) : null}
        <nav aria-label="Operations" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors", active ? "bg-white/12 font-semibold text-white" : "text-white/70 hover:bg-white/8 hover:text-white")}
              >
                <item.icon size={16} aria-hidden className={active ? "text-[var(--color-accent-light)]" : undefined} />
                <span className="flex-1">{item.label}</span>
                {badge[item.href] ? <span className="rounded-full bg-[var(--color-orange)] px-1.5 text-[11px] font-bold tabular">{badge[item.href]}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-3 border-t border-white/10 pt-3 text-[11.5px] text-white/65">
          <p className="truncate">{email}</p>
          <Link href="/app" className="mt-1 inline-flex items-center gap-1 text-white/70 hover:text-white">
            <FileClock size={12} /> Back to workspace
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="workspace-topbar sticky top-0 z-30 flex min-h-[72px] items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-paper)]/95 px-4 py-3 backdrop-blur sm:px-8">
          <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-lg hover:bg-[var(--color-sand)] md:hidden">
            <Menu size={19} />
          </button>
          <Link href="/admin" aria-label="Railor operations overview" className="shrink-0 md:hidden"><RailorMark size={23} /></Link>
          <span className="min-w-0 truncate text-[12px] text-[var(--color-muted)]"><span className="hidden sm:inline">Operations <span aria-hidden className="mx-2">/</span></span><span className="font-semibold text-[var(--color-ink)]">{NAV.find((item) => item.exact ? pathname === item.href : pathname.startsWith(item.href))?.label ?? "Overview"}</span></span>
          <Link href="/app" className="ml-auto shrink-0 rounded-xl border border-[var(--color-line)] px-3 py-2 text-[12px] font-semibold hover:bg-[var(--color-surface)]">Workspace →</Link>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div key={pathname} className="railor-page-in mx-auto flex max-w-[1240px] flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function AdminHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-line-strong)] pb-5">
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-orange-deep)]">Railor operations</p>
        <h1 className="mt-2 font-display text-[clamp(1.8rem,3.5vw,2.6rem)] font-semibold leading-none tracking-[-0.045em]">{title}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-muted)]">{description}</p>
      </div>
      {action}
    </header>
  );
}
