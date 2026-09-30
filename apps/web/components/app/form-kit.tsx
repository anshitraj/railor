"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@railor/ui";

/**
 * Pointer-first form controls for the control-plane screens. Every value a
 * user must supply here can be chosen with a click; typing stays available as
 * an accelerator (number inputs keep their field, pickers keep search).
 */

export function FieldBlock({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span className="text-[12px] font-bold text-[var(--color-ink-soft)]">{label}</span>
      {children}
      {hint ? <span className="text-[11.5px] leading-snug text-[var(--color-muted)]">{hint}</span> : null}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** A radio group drawn as one pill with a sliding selection. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
}: {
  label: string;
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (next: T) => void;
  size?: "sm" | "md";
}) {
  const group = useId();
  const reduced = useReducedMotion();
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = options[(index + delta + options.length) % options.length]!;
    onChange(next.value);
    const buttons = (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button[role=radio]") ?? []) as NodeListOf<HTMLButtonElement>;
    buttons[(index + delta + options.length) % options.length]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex w-full max-w-full flex-wrap gap-1 rounded-[14px] border border-[var(--color-line)] bg-[var(--color-canvas)] p-1"
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-start rounded-[10px] text-left transition-colors",
              size === "sm" ? "px-3 py-1.5" : "px-3.5 py-2.5",
              selected ? "text-[var(--color-ink)]" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`segment-${group}`}
                className="absolute inset-0 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_6px_18px_-12px_rgb(28_27_25/0.5)]"
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                aria-hidden
              />
            ) : null}
            <span className={cn("relative font-semibold", size === "sm" ? "text-[12.5px]" : "text-[13.5px]")}>{option.label}</span>
            {option.hint && size === "md" ? (
              <span className="relative text-[11.5px] leading-snug text-[var(--color-muted)]">{option.hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** A number field whose common values are one click away. `null` = rule off. */
export function NumberWithPresets({
  label,
  value,
  onChange,
  presets,
  suffix,
  offLabel,
  min = 0,
  step = "any",
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  presets: Array<{ value: number; label: string }>;
  suffix?: string;
  /** When set, renders an explicit "no limit" chip that clears the value. */
  offLabel?: string;
  min?: number;
  step?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-[12px] font-bold text-[var(--color-ink-soft)]">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value === undefined ? "" : String(value)}
          onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
          placeholder={offLabel ?? "—"}
          className="product-field !mt-0 min-w-0 flex-1"
        />
        {suffix ? <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted)]">{suffix}</span> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {offLabel ? (
          <PresetChip active={value === undefined} onClick={() => onChange(undefined)}>
            {offLabel}
          </PresetChip>
        ) : null}
        {presets.map((preset) => (
          <PresetChip key={preset.value} active={value === preset.value} onClick={() => onChange(preset.value)}>
            {preset.label}
          </PresetChip>
        ))}
      </div>
    </div>
  );
}

export function PresetChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[12px] font-semibold transition",
        active
          ? "border-[var(--color-orange)] bg-[var(--color-lavender)] text-[var(--color-orange-deep)]"
          : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:-translate-y-px hover:border-[var(--color-line-strong)]",
      )}
    >
      {children}
    </button>
  );
}

/** A real checkbox (so labels and assistive tech work) drawn as a switch. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors",
        checked ? "border-[var(--color-orange)]/40 bg-[var(--color-lavender)]/60" : "border-[var(--color-line)] bg-[var(--color-paper)]",
      )}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className={cn(
            "flex h-[20px] w-[34px] items-center rounded-full p-[2px] transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-orange)]",
            checked ? "bg-[var(--color-orange)]" : "bg-[var(--color-line-strong)]",
          )}
        >
          <span
            className={cn(
              "size-4 rounded-full bg-white shadow-sm transition-transform duration-200",
              checked ? "translate-x-[14px]" : "translate-x-0",
            )}
          />
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-[13px] font-semibold text-[var(--color-ink)]">
          {label}
        </label>
        {hint ? (
          <span id={`${id}-hint`} className="text-[11.5px] font-normal leading-snug text-[var(--color-muted)]">
            {hint}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** A result block for server responses: readable summary first, raw data folded away. */
export function ResultNotice({
  tone,
  title,
  children,
  raw,
}: {
  tone: "good" | "warn" | "bad" | "neutral";
  title: string;
  children?: React.ReactNode;
  raw?: unknown;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      aria-live="polite"
      className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="product-badge" data-tone={tone}>
          {tone === "good" ? "ok" : tone === "bad" ? "failed" : tone === "warn" ? "review" : "info"}
        </span>
        <p className="text-[13.5px] font-semibold">{title}</p>
      </div>
      {children ? <div className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">{children}</div> : null}
      {raw !== undefined ? (
        <details className="mt-3 border-t border-[var(--color-line)] pt-2">
          <summary className="cursor-pointer text-[11.5px] font-semibold text-[var(--color-muted)]">Raw response</summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[11px]">{JSON.stringify(raw, null, 2)}</pre>
        </details>
      ) : null}
    </motion.div>
  );
}
