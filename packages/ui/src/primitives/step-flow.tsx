"use client";

import { cn } from "../cn.js";
import { Button } from "./base.js";
import { useEffect, useRef } from "react";

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
  const heading = useRef<HTMLHeadingElement>(null);
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) { initial.current = false; return; }
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [step]);
  return (
    <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-8", className)}>
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-label="Account setup" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${total}`}>
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
        <span aria-live="polite" className="tabular text-[12px] text-[var(--color-muted)]">
          {step + 1} of {total}
        </span>
      </div>

      {/* CSS keeps server and client markup identical and honors reduced motion. */}
      <div
        key={step}
        className="railor-step-in flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <h1 ref={heading} tabIndex={-1} className="outline-none text-[28px] font-semibold leading-tight text-[var(--color-ink)]">
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-xl text-[15px] leading-relaxed text-[var(--color-muted)]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {children}
      </div>

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
