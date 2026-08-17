"use client";

import { cn } from "../cn.js";
import { Button } from "./base.js";

/**
 * Empty states must name the gap and the fix. "Nothing here yet" is a bug:
 * every one of these takes a `what`, a `why` and a single `action`.
 */
export function EmptyState({
  what,
  why,
  actionLabel,
  onAction,
  href,
  icon,
  className,
}: {
  what: string;
  why: string;
  actionLabel: string;
  onAction?: () => void;
  href?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] bg-white p-6",
        className,
      )}
    >
      {icon ? (
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-[var(--color-lavender)] text-[var(--color-purple)]">
          {icon}
        </span>
      ) : null}
      <h3 className="text-[15px] font-semibold text-[var(--color-ink)]">{what}</h3>
      <p className="max-w-lg text-[13px] leading-relaxed text-[var(--color-muted)]">{why}</p>
      {href ? (
        <a href={href}>
          <Button size="sm">{actionLabel}</Button>
        </a>
      ) : (
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
