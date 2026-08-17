"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "../cn.js";
import { Chip } from "./badges.js";

export interface PickerOption {
  value: string;
  label: string;
  sublabel?: string;
  emoji?: string;
  popularity?: number;
}

/**
 * The universal "pick a thing" control — countries, currencies, assets,
 * networks, providers.
 *
 * Ease rules it enforces:
 *  - the likeliest options are already on screen as one-click chips
 *  - an inferred value arrives pre-selected and visibly labelled "Detected"
 *  - typing is optional; pasting a list ("IN, AE, SG") is a supported input
 *  - nothing is ever a bare <select>
 */
export function SmartPicker({
  options,
  value,
  onChange,
  multiple = false,
  label,
  placeholder = "Search…",
  detected,
  suggestionCount = 6,
  className,
  allowPasteList = true,
}: {
  options: PickerOption[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  label?: string;
  placeholder?: string;
  /** Value Railor inferred (email domain, IP, previous answer). */
  detected?: string;
  suggestionCount?: number;
  className?: string;
  allowPasteList?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const byValue = useMemo(
    () => Object.fromEntries(options.map((o) => [o.value, o])),
    [options],
  );

  const suggestions = useMemo(() => {
    const pool = [...options].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const head = detected ? [byValue[detected]].filter(Boolean) : [];
    return [...head, ...pool.filter((o) => o.value !== detected)]
      .filter((o): o is PickerOption => Boolean(o))
      .filter((o) => !value.includes(o.value))
      .slice(0, suggestionCount);
  }, [options, detected, value, suggestionCount, byValue]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.value.toLowerCase().includes(q) ||
          o.sublabel?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, options]);

  const add = (v: string) => {
    if (multiple) {
      if (!value.includes(v)) onChange([...value, v]);
    } else {
      onChange([v]);
    }
    setQuery("");
    setOpen(false);
  };

  const remove = (v: string) => onChange(value.filter((x) => x !== v));

  /** "IN, AE, SG" or a pasted spreadsheet column becomes chips. */
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (!allowPasteList) return;
    const text = e.clipboardData.getData("text");
    if (!/[,\n\t;]/.test(text)) return;
    e.preventDefault();
    const parts = text
      .split(/[,\n\t;]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    const matched = options
      .filter((o) => parts.includes(o.value.toLowerCase()) || parts.includes(o.label.toLowerCase()))
      .map((o) => o.value);
    if (!matched.length) return;
    onChange(multiple ? [...new Set([...value, ...matched])] : [matched[0]!]);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label ? (
        <label className="text-[13px] font-medium text-[var(--color-ink-soft)]">{label}</label>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {value.map((v) => {
          const option = byValue[v];
          return (
            <Chip key={v} active onRemove={multiple ? () => remove(v) : undefined}>
              {option?.emoji ? <span aria-hidden>{option.emoji}</span> : null}
              {option?.label ?? v}
              {detected === v ? (
                <span className="ml-1 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-purple)]">
                  Detected
                </span>
              ) : null}
            </Chip>
          );
        })}

        <div className="relative">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onPaste={handlePaste}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder={value.length && !multiple ? "Change…" : placeholder}
            className="w-40 rounded-full border border-dashed border-[var(--color-line-strong)] bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-purple)]"
            aria-label={label ? `${label} search` : "Search options"}
          />
          {open && filtered.length ? (
            <ul className="absolute left-0 top-full z-30 mt-1 max-h-64 w-64 overflow-auto rounded-2xl border border-[var(--color-line)] bg-white p-1 shadow-[var(--shadow-lift)]">
              {filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(o.value)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--color-lavender)]"
                  >
                    {o.emoji ? <span aria-hidden>{o.emoji}</span> : null}
                    <span className="flex-1">{o.label}</span>
                    <span className="text-[11px] text-[var(--color-faint)]">{o.value}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {suggestions.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
            {detected ? "Suggested" : "Common"}
          </span>
          {suggestions.map((o) => (
            <Chip key={o.value} onClick={() => add(o.value)} className="py-1 text-[13px]">
              {o.emoji ? <span aria-hidden>{o.emoji}</span> : null}
              {o.label}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
