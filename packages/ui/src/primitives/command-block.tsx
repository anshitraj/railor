"use client";

import { useEffect, useState } from "react";
import { cn } from "../cn.js";

/**
 * A single runnable command, presented the way a terminal presents it: a
 * prompt marker, monospaced text that never wraps mid-token, and one
 * unmistakable copy affordance on the right.
 *
 * The copied state is owned here and self-clears, so callers never have to
 * hold timer state for a purely visual acknowledgement.
 */
export function CommandBlock({
  command,
  prompt = "$",
  label,
  className,
}: {
  command: string;
  prompt?: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // Clipboard is permission-gated; if it's refused we simply don't claim
      // the copy happened rather than showing a false confirmation.
      setCopied(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label ? (
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--color-orange-deep)]">
          {label}
        </span>
      ) : null}
      <div className="group flex items-center gap-3 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-sand)]/60 pl-4 pr-2 transition focus-within:border-[var(--color-orange)] hover:border-[var(--color-line-strong)]">
        <span aria-hidden className="shrink-0 font-[family-name:var(--font-mono)] text-[13px] font-semibold text-[var(--color-orange)]">
          {prompt}
        </span>
        <code className="flex-1 overflow-x-auto whitespace-nowrap py-3.5 font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-ink)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy command: ${command}`}
          className={cn(
            "shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition active:translate-y-px",
            copied
              ? "bg-[var(--color-ok)] text-white"
              : "text-[var(--color-muted)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]",
          )}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
