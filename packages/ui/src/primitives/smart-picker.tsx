"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn.js";
import { Chip } from "./badges.js";
import { Flag } from "./flag.js";

export interface PickerOption {
  value: string;
  label: string;
  sublabel?: string;
  /** A text glyph (a currency symbol). Never a flag emoji — use `flag`. */
  emoji?: string;
  /** ISO country code (or EU): rendered as a real flag image, which wins over `emoji`. */
  flag?: string;
  popularity?: number;
}

/** The little mark before an option: its flag if it has one, else its glyph. */
export function OptionMark({ option, render }: { option: PickerOption | undefined; render?: (option: PickerOption) => ReactNode }) {
  if (option && render) {
    const custom = render(option);
    if (custom) return <>{custom}</>;
  }
  if (option?.flag) return <Flag code={option.flag} size={14} />;
  return option?.emoji ? <span aria-hidden>{option.emoji}</span> : null;
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
  renderMark,
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
  /** Custom mark before an option (token and chain logos); falls back to its flag or glyph. */
  renderMark?: (option: PickerOption) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

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

  /** Arrow keys walk the matches, Enter picks, Escape closes, Backspace on empty removes the last chip. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && filtered.length) {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp" && filtered.length) {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && open && filtered[cursor]) {
      e.preventDefault();
      add(filtered[cursor]!.value);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    } else if (e.key === "Backspace" && !query && multiple && value.length) {
      remove(value[value.length - 1]!);
    }
  };

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
              <OptionMark option={option} render={renderMark} />
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
              setCursor(0);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            role="combobox"
            aria-expanded={open && filtered.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && filtered[cursor] ? `${listId}-${cursor}` : undefined}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder={value.length && !multiple ? "Change…" : placeholder}
            className="w-40 rounded-full border border-dashed border-[var(--color-line-strong)] bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-purple)]"
            aria-label={label ? `${label} search` : "Search options"}
          />
          {open && filtered.length ? (
            <ul
              id={listId}
              role="listbox"
              className="railor-pop absolute left-0 top-full z-30 mt-1 max-h-64 w-64 overflow-auto rounded-2xl border border-[var(--color-line)] bg-white p-1 shadow-[var(--shadow-lift)]"
            >
              {filtered.map((o, i) => (
                <li key={o.value} id={`${listId}-${i}`} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => add(o.value)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm",
                      i === cursor ? "bg-[var(--color-lavender)]" : "hover:bg-[var(--color-lavender)]",
                    )}
                  >
                    <OptionMark option={o} render={renderMark} />
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
              <OptionMark option={o} render={renderMark} />
              {o.label}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
