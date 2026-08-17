"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CommandPalette, StageBadge, cn, type CommandItem } from "@railor/ui";
import { RailorMark } from "../marketing/nav";

const NAV: Array<{ href: string; label: string; icon: string; stage?: "beta" | "soon" }> = [
  { href: "/app", label: "Overview", icon: "▤" },
  { href: "/app/corridors", label: "Corridors", icon: "⇄" },
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
  palette,
}: {
  children: React.ReactNode;
  orgName: string;
  userEmail: string;
  palette: Array<{ id: string; label: string; group: string; href: string; hint?: string }>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const items: CommandItem[] = palette.map((p) => ({
    id: p.id,
    label: p.label,
    group: p.group,
    hint: p.hint,
    run: () => router.push(p.href),
  }));

  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)]">
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col gap-1 border-r border-[var(--color-line)] bg-white px-3 py-4 transition-all",
          collapsed ? "w-[68px]" : "w-[212px]",
        )}
      >
        <Link href="/app" className="mb-3 flex items-center gap-2 px-2">
          <RailorMark />
          {!collapsed ? <span className="text-[15px] font-semibold">Railor</span> : null}
        </Link>

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
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] text-[var(--color-muted)] hover:bg-[var(--color-canvas)]"
          >
            <span className="w-4 text-center" aria-hidden>
              {collapsed ? "»" : "«"}
            </span>
            {!collapsed ? "Collapse" : null}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-canvas)]/85 px-6 py-3 backdrop-blur">
          <CommandPalette items={items} />
          <span className="flex-1" />
          <Link
            href="/app/corridors"
            className="rounded-full bg-[var(--color-purple)] px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--color-purple-deep)]"
          >
            New corridor
          </Link>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[13px] text-[var(--color-muted)] hover:border-[var(--color-line-strong)]"
            >
              Sign out
            </button>
          </form>
        </header>

        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
