"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../cn.js";
import { Freshness, VerdictPill, ConfidenceDot, type Verdict } from "./badges.js";

export interface ResultFact {
  label: string;
  value: string;
}

/**
 * A provider result. Rich row, not a table cell: the "why" opens *in place*,
 * so understanding a verdict never costs a navigation.
 */
export function ResultRow({
  name,
  category,
  verdict,
  confidence,
  facts,
  lastVerifiedAt,
  actions,
  children,
  defaultOpen = false,
  blurred = false,
  onUnlock,
}: {
  name: string;
  category: string;
  verdict: Verdict;
  confidence: number;
  facts: ResultFact[];
  lastVerifiedAt: string | Date | null;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  defaultOpen?: boolean;
  /** Public preview: name/verdict stay real, deeper detail is locked. */
  blurred?: boolean;
  /** Where the lock affordance sends an anonymous visitor. */
  onUnlock?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border bg-white transition",
        open ? "border-[var(--color-line-strong)] shadow-[var(--shadow-soft)]" : "border-[var(--color-line)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <button
          type="button"
          onClick={() => !blurred && setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-[200px] flex-1 items-center gap-3 text-left"
        >
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--color-lavender)] text-[13px] font-semibold text-[var(--color-purple)]",
            )}
            aria-hidden
          >
            {name.slice(0, 2).toUpperCase()}
          </span>
          <span className="flex flex-col">
            <span className="text-[15px] font-medium text-[var(--color-ink)]">{name}</span>
            <span className="text-[12px] text-[var(--color-muted)]">{category}</span>
          </span>
        </button>

        <VerdictPill verdict={verdict} />

        {blurred ? (
          <button
            type="button"
            onClick={onUnlock}
            className="group relative flex min-w-[230px] flex-1 items-center gap-2 overflow-hidden rounded-xl px-2 py-1.5 text-left"
          >
            <div aria-hidden className="flex flex-1 flex-wrap gap-x-6 gap-y-1 blur-[6px] select-none">
              {facts.length ? (
                facts.map((f) => (
                  <span key={f.label} className="flex min-w-[110px] flex-col">
                    <span className="text-[10px] uppercase tracking-wide text-[var(--color-faint)]">
                      {f.label}
                    </span>
                    <span className="tabular text-[13px] text-[var(--color-ink-soft)]">{f.value}</span>
                  </span>
                ))
              ) : (
                <span className="flex min-w-[110px] flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--color-faint)]">Fees</span>
                  <span className="tabular text-[13px] text-[var(--color-ink-soft)]">0.00% · 000</span>
                </span>
              )}
            </div>
            <span className="absolute inset-0 flex items-center gap-1.5 whitespace-nowrap bg-white/55 pl-2 text-[12px] font-medium text-[var(--color-purple)] backdrop-blur-[1px] transition group-hover:bg-white/70">
              <span aria-hidden>🔒</span>
              Sign in to see fees, limits &amp; evidence
            </span>
          </button>
        ) : (
          <div className="flex flex-1 flex-wrap gap-x-6 gap-y-1">
            {facts.map((f) => (
              <span key={f.label} className="flex min-w-[110px] flex-col">
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-faint)]">
                  {f.label}
                </span>
                <span className="tabular text-[13px] text-[var(--color-ink-soft)]">{f.value}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <ConfidenceDot confidence={confidence} showValue />
          <Freshness date={lastVerifiedAt} />
          {actions}
          {!blurred ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Collapse details" : "Expand details"}
              className="rounded-full border border-[var(--color-line)] px-2 py-1 text-[12px] text-[var(--color-muted)] hover:border-[var(--color-line-strong)]"
            >
              {open ? "Hide why" : "Why?"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onUnlock}
              className="flex items-center gap-1 rounded-full border border-dashed border-[var(--color-line-strong)] px-2 py-1 text-[12px] text-[var(--color-muted)] hover:border-[var(--color-purple)] hover:text-[var(--color-purple)]"
            >
              <span aria-hidden>🔒</span> Why?
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && children ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-[var(--color-line)] bg-[var(--color-canvas)]"
          >
            <div className="p-5">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
