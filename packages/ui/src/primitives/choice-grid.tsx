"use client";

import { useRef } from "react";
import { cn } from "../cn.js";

export interface Choice {
  value: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
}

/**
 * Large selectable tiles. The whole product must be completable with a
 * pointer, so any question with a knowable answer set becomes one of these
 * rather than a text input.
 */
export function ChoiceGrid({
  options,
  value,
  onChange,
  multiple = false,
  columns = 3,
  notSureLabel,
  className,
  name,
}: {
  options: Choice[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  columns?: 2 | 3 | 4;
  /** Renders an explicit escape hatch, recorded as an assumption upstream. */
  notSureLabel?: string;
  className?: string;
  name?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const toggle = (v: string) => {
    if (!multiple) {
      onChange([v]);
      return;
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta =
      e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? columns : e.key === "ArrowUp" ? -columns : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(refs.current.length - 1, index + delta));
    refs.current[next]?.focus();
  };

  const all: Choice[] = notSureLabel
    ? [...options, { value: "__unsure__", label: notSureLabel, hint: "Railor will pick a sensible default and show it to you." }]
    : options;

  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={name}
      className={cn(
        "grid gap-3",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {all.map((option, i) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={selected}
            onClick={() => toggle(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "group relative flex min-h-[92px] flex-col items-start gap-1.5 rounded-[var(--radius-card)] border p-4 text-left transition duration-200",
              selected
                ? "border-[var(--color-purple)] bg-[var(--color-lavender)] shadow-[0_10px_30px_-18px_rgb(91_46_255/0.9)]"
                : "border-[var(--color-line)] bg-white hover:-translate-y-[3px] hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-lift)]",
            )}
          >
            {option.icon ? (
              <span
                className={cn(
                  "mb-1 inline-flex size-8 items-center justify-center rounded-xl transition",
                  selected
                    ? "bg-[var(--color-purple)] text-white"
                    : "bg-[var(--color-lavender)] text-[var(--color-purple)] group-hover:scale-105",
                )}
              >
                {option.icon}
              </span>
            ) : null}
            <span className="text-[15px] font-medium text-[var(--color-ink)]">{option.label}</span>
            {option.hint ? (
              <span className="text-[12px] leading-snug text-[var(--color-muted)]">{option.hint}</span>
            ) : null}
            {selected ? (
              <span className="absolute right-3 top-3 text-[var(--color-purple)]" aria-hidden>
                ✓
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
