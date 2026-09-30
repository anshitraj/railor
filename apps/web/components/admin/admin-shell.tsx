"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, Banknote, Building2, ClipboardCheck, FileClock, Globe2, KeyRound, LayoutDashboard, Menu, Plug, Radar, ScrollText, X, type LucideIcon } from "lucide-react";
import { cn } from "@railor/ui";
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
  const badge: Record<string, number> = { "/admin/payments": alerts.unknownPayments, "/admin/review": alerts.pendingReview };
  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)]">
      {open ? <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/30 md:hidden" /> : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[236px] flex-col gap-1 bg-[var(--color-ink)] px-3 py-4 text-white transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-4 flex items-center gap-2 px-2">
          <RailorMark />
          <span className="font-display text-[17px] font-bold tracking-[-0.05em]">Railor</span>
          <span className="rounded-full bg-[var(--color-orange)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide">Ops</span>
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="ml-auto md:hidden">
            <X size={17} />
          </button>
        </div>
        {alerts.paused ? (
          <div className="mb-3 rounded-lg bg-[var(--color-bad)] px-3 py-2 text-[11.5px] font-semibold">Payments paused platform-wide</div>
        ) : null}
        <nav aria-label="Operations" className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors", active ? "bg-white/12 font-semibold text-white" : "text-white/65 hover:bg-white/8 hover:text-white")}
              >
                <item.icon size={16} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {badge[item.href] ? <span className="rounded-full bg-[var(--color-orange)] px-1.5 text-[11px] font-bold tabular">{badge[item.href]}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 pt-3 text-[11.5px] text-white/50">
          <p className="truncate">{email}</p>
          <Link href="/app" className="mt-1 inline-flex items-center gap-1 text-white/70 hover:text-white">
            <FileClock size={12} /> Back to workspace
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-canvas)]/90 px-4 py-3 backdrop-blur md:hidden">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={19} />
          </button>
          <span className="text-[14px] font-semibold">Operations</span>
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
