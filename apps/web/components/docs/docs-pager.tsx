"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@railor/ui";
import { DOCS_PAGES, type DocsLink } from "./docs-nav";

/** Previous / next in reading order, so no docs page is a dead end. */
export function DocsPager() {
  const pathname = usePathname();
  const index = DOCS_PAGES.findIndex((page) => page.href === pathname);
  if (index === -1) return null;

  const prev = DOCS_PAGES[index - 1];
  const next = DOCS_PAGES[index + 1];
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="More documentation"
      className="grid gap-3 border-t border-[var(--color-line)] pt-7 sm:grid-cols-2"
    >
      {prev ? <PagerLink page={prev} direction="prev" /> : null}
      {next ? <PagerLink page={next} direction="next" /> : null}
    </nav>
  );
}

function PagerLink({ page, direction }: { page: DocsLink; direction: "prev" | "next" }) {
  const isNext = direction === "next";
  return (
    <Link
      href={page.href}
      className={cn(
        "group flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-lift)]",
        isNext && "sm:col-start-2 sm:flex-row-reverse sm:text-right",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-sand)] text-[var(--color-orange-deep)] transition-colors group-hover:bg-[var(--color-orange)] group-hover:text-white">
        {isNext ? <ArrowRight size={16} aria-hidden /> : <ArrowLeft size={16} aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
          {isNext ? "Next" : "Previous"}
        </span>
        <span className="truncate font-display text-[16px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          {page.label}
        </span>
      </span>
    </Link>
  );
}
