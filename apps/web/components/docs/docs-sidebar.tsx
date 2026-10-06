"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn, TechnologyLogo, TechnologyLogoStack } from "@railor/ui";
import { DOCS_NAV } from "./docs-nav";

/**
 * One list, two layouts. From `lg` up it is a sticky rail with grouped links;
 * below that the same links become a swipeable chip strip, so a phone never
 * has to scroll past nine links to reach the page.
 */
export function DocsSidebar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const strip = useRef<HTMLDivElement>(null);

  // On the chip strip, keep the current page centred after navigating. Scrolls
  // the strip only (never the page), and is a no-op on the desktop rail.
  useEffect(() => {
    const el = strip.current;
    const link = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !link || el.scrollWidth <= el.clientWidth) return;
    const rail = el.getBoundingClientRect();
    const chip = link.getBoundingClientRect();
    el.scrollLeft += chip.left - rail.left - (rail.width - chip.width) / 2;
  }, [pathname]);

  return (
    <nav
      aria-label="Documentation"
      className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6.5rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:-mx-1 lg:px-1 lg:pb-1"
    >
      <div
        ref={strip}
        className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {DOCS_NAV.map((group) => (
          <div key={group.label} className="flex shrink-0 gap-1.5 lg:flex-col lg:gap-0.5">
            <p className="hidden px-2.5 pb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)] lg:block">
              {group.label}
            </p>
            {group.links.map((link) => {
              const active = pathname === link.href;
              const leavesDocs = !link.href.startsWith("/docs");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
                    "lg:gap-2.5 lg:rounded-xl lg:px-2.5 lg:py-1.5 lg:text-[13.5px]",
                    active
                      ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white lg:shadow-[var(--shadow-soft)]"
                      : "border-[var(--color-line)] bg-white text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)] lg:border-transparent lg:bg-transparent lg:hover:border-transparent lg:hover:bg-[var(--color-sand)] lg:hover:text-[var(--color-ink)]",
                  )}
                >
                  {link.href === "/docs/mcp" ? <TechnologyLogo name="MCP" size={19} /> : link.href === "/docs/sdks" ? <TechnologyLogoStack names={["TypeScript", "Python"]} size={17} /> : <link.icon
                    size={15}
                    strokeWidth={2}
                    aria-hidden
                    className={cn(
                      "shrink-0 transition-colors duration-150",
                      active
                        ? "text-[var(--color-accent-light)]"
                        : "text-[var(--color-faint)] group-hover:text-[var(--color-orange-deep)]",
                    )}
                  />}
                  {link.label}
                  {leavesDocs ? (
                    <ArrowUpRight
                      size={13}
                      aria-hidden
                      className="text-[var(--color-faint)] transition-transform duration-150 group-hover:-translate-y-px group-hover:translate-x-px"
                    />
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {children ? <div className="mt-5 hidden lg:block">{children}</div> : null}
    </nav>
  );
}
