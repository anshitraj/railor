"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { CommandPalette, StageBadge, cn, type CommandItem } from "@railor/ui";
import { RailorMark } from "../marketing/nav";

const NAV: Array<{ href: string; label: string; icon: string; stage?: "beta" | "soon" }> = [
  { href: "/app", label: "Overview", icon: "▤" },
  { href: "/app/corridors", label: "Corridors", icon: "⇄" },
  { href: "/app/map", label: "Route map", icon: "◍" },
  { href: "/app/providers", label: "Providers", icon: "◎" },
  { href: "/app/compare", label: "Compare", icon: "≣" },
  { href: "/app/monitoring", label: "Monitoring", icon: "◔" },
  { href: "/app/changes", label: "Changes", icon: "↯" },
  { href: "/app/readiness", label: "Readiness", icon: "✓" },
  { href: "/app/developers", label: "Developers", icon: "⌨" },
];

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
  palette: Array<{ id: string; label: string; group: string; href: string; hint?: string }>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  const items: CommandItem[] = palette.map((p) => ({
    id: p.id,
    label: p.label,
    group: p.group,
    hint: p.hint,
    run: () => router.push(p.href),
  }));

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
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[240px] shrink-0 flex-col gap-1 border-r border-[var(--color-line)] bg-white px-3 py-4 transition-transform duration-200 ease-out md:sticky md:top-0 md:z-0 md:translate-x-0 md:transition-[width]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-[68px]" : "md:w-[212px]",
        )}
      >
        <div className="mb-3 flex items-center gap-2 px-2">
          <Link href="/app" className="flex flex-1 items-center gap-2">
            <RailorMark />
            {!collapsed ? <span className="text-[15px] font-semibold">Railor</span> : null}
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
          <div className="mb-3 rounded-xl bg-[var(--color-canvas)] px-3 py-2">
            <p className="truncate text-[13px] font-medium">{orgName}</p>
            <p className="truncate text-[11px] text-[var(--color-muted)]">{userEmail}</p>
          </div>
        ) : null}

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] transition",
                  active
                    ? "bg-[var(--color-lavender)] font-medium text-[var(--color-purple-deep)]"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)]",
                )}
              >
                <span className="w-4 text-center opacity-70" aria-hidden>
                  {item.icon}
                </span>
                {!collapsed ? (
                  <span className="flex flex-1 items-center gap-1.5">
                    {item.label}
                    {item.stage ? <StageBadge stage={item.stage} /> : null}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-0.5 border-t border-[var(--color-line)] pt-2">
          <Link
            href="/app/settings"
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)]"
          >
            <span className="w-4 text-center opacity-70" aria-hidden>
              ⚙
            </span>
            {!collapsed ? "Settings" : null}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] text-[var(--color-muted)] hover:bg-[var(--color-canvas)] md:flex"
          >
            <span className="w-4 text-center" aria-hidden>
              {collapsed ? "»" : "«"}
            </span>
            {!collapsed ? "Collapse" : null}
          </button>
          <form action="/api/auth/signout" method="post" className="md:hidden">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] text-[var(--color-muted)] hover:bg-[var(--color-canvas)]"
            >
              <span className="w-4 text-center opacity-70" aria-hidden>
                ⏻
              </span>
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] md:hidden"
          >
            <Menu size={19} />
          </button>
          <CommandPalette items={items} />
          <span className="flex-1" />
          <Link
            href="/app/corridors"
            className="rounded-full bg-[var(--color-purple)] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--color-purple-deep)] sm:px-3.5"
          >
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New corridor</span>
          </Link>
          <form action="/api/auth/signout" method="post" className="hidden md:block">
            <button
              type="submit"
              className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[13px] text-[var(--color-muted)] hover:border-[var(--color-line-strong)]"
            >
              Sign out
            </button>
          </form>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
