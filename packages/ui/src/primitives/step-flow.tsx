"use client";

import { motion, AnimatePresence } from "motion/react";
import { cn } from "../cn.js";
import { Button } from "./base.js";

/**
 * One decision per view. Progress is explicit, Back is always live, Skip is
 * honest (it records an assumption instead of silently choosing), and the
 * caller autosaves per step so a reload never costs the user their answers.
 */
export function StepFlow({
  step,
  total,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  onSkip,
  nextLabel = "Continue",
  nextDisabled,
  skipLabel = "Skip — I'll decide later",
  footnote,
  className,
}: {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  skipLabel?: string;
  footnote?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-8", className)}>
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition",
                i < step
                  ? "bg-[var(--color-purple)]"
                  : i === step
                    ? "bg-[var(--color-violet)]"
                    : "bg-[var(--color-line)]",
              )}
            />
          ))}
        </div>
        <span className="tabular text-[12px] text-[var(--color-muted)]">
          {step + 1} of {total}
        </span>
      </div>

      {/* Keyed enter-only animation, deliberately without AnimatePresence: an
          exit transition that never completes (throttled compositor, hidden
          tab, reduced motion) would leave the previous question on screen
          while the progress bar had already advanced. Content must never lag
          the step counter. */}
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] font-semibold leading-tight text-[var(--color-ink)]">
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-xl text-[15px] leading-relaxed text-[var(--color-muted)]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {children}
      </motion.div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-line)] pt-5">
        {onBack ? (
          <Button variant="ghost" onClick={onBack} size="sm">
            ← Back
          </Button>
        ) : null}
        <div className="flex-1" />
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="text-[13px] text-[var(--color-muted)] underline-offset-4 hover:underline"
          >
            {skipLabel}
          </button>
        ) : null}
        <Button onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </Button>
      </div>

      {footnote ? (
        <p className="text-[12px] text-[var(--color-faint)]">{footnote}</p>
      ) : null}
    </div>
  );
}
