"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Flag, type PickerOption } from "@railor/ui";
import { fallbackFill } from "../marketing/logo-fallback";
import styles from "./price.module.css";

const POPULAR = ["USD", "EUR", "GBP", "INR", "AED", "CAD", "AUD", "SGD", "PHP", "NGN"];

export function CurrencyMark({ option, code, size = 24 }: { option?: PickerOption; code: string; size?: number }) {
  if (option?.flag) return <span className={styles.mark} style={{ width: size, height: size }}><Flag code={option.flag} size={size} round /></span>;
  const glyph = (option?.emoji || code.charAt(0)).slice(0, 3);
  return (
    <span aria-hidden className={styles.markFallback} style={{ width: size, height: size, background: fallbackFill(code, 3), fontSize: size * (glyph.length > 1 ? 0.34 : 0.5) }}>
      {glyph}
    </span>
  );
}

/**
 * A currency pill that opens a searchable list. Popular currencies sit on
 * top so most people never type; on phones the list rises as a sheet.
 */
export function CurrencyPicker({ label, value, options, onChange, align = "end" }: {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (code: string) => void;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return options.filter((option) => `${option.value} ${option.label}`.toLowerCase().includes(q)).slice(0, 60);
    const popular = POPULAR.flatMap((code) => options.find((option) => option.value === code) ?? []);
    return [...popular, ...options.filter((option) => !POPULAR.includes(option.value))];
  }, [options, query]);
  const popularCount = query.trim() ? 0 : POPULAR.filter((code) => options.some((option) => option.value === code)).length;

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, list.findIndex((option) => option.value === value)));
    const frame = window.requestAnimationFrame(() => search.current?.focus({ preventScroll: true }));
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener("pointerdown", away); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
    trigger.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(list.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    else if (event.key === "Enter" && list[active]) { event.preventDefault(); choose(list[active]!.value); }
  };

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);

  return (
    <div ref={root} className={styles.picker} onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={trigger}
        type="button"
        className={`${styles.pickerTrigger} press`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value}. Change currency`}
        onClick={() => setOpen((current) => !current)}
      >
        <CurrencyMark option={selected} code={value} size={24} />
        <span>{value}</span>
        <ChevronDown size={16} aria-hidden className={styles.pickerChevron} data-open={open || undefined} />
      </button>
      {open ? (
        <>
          <button type="button" className={styles.pickerScrim} aria-label="Close currency list" onClick={() => setOpen(false)} />
          <div className={styles.pickerPanel} data-align={align} role="dialog" aria-label={label}>
            <label className={styles.pickerSearch}>
              <Search size={16} aria-hidden />
              <input
                ref={search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search currency or country"
                aria-label="Search currency or country"
                aria-controls={listId}
                aria-activedescendant={list[active] ? `${listId}-${active}` : undefined}
                role="combobox"
                aria-expanded="true"
                autoComplete="off"
              />
            </label>
            <ul id={listId} role="listbox" aria-label={label} className={styles.pickerList}>
              {list.map((option, index) => (
                <li key={option.value} role="presentation">
                  {index === 0 && popularCount ? <p className={styles.pickerGroup}>Popular</p> : null}
                  {index === popularCount && popularCount ? <p className={styles.pickerGroup}>All currencies</p> : null}
                  <button
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    data-active={index === active || undefined}
                    className={styles.pickerOption}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(option.value)}
                  >
                    <CurrencyMark option={option} code={option.value} size={26} />
                    <span className={styles.pickerCode}>{option.value}</span>
                    <span className={styles.pickerName}>{option.label.split(" — ")[1] ?? option.label}</span>
                    {option.value === value ? <Check size={16} aria-hidden className={styles.pickerCheck} /> : null}
                  </button>
                </li>
              ))}
              {!list.length ? <li className={styles.pickerEmpty}>No currency matches “{query}”.</li> : null}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
