"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search } from "lucide-react";
import { cn } from "../cn.js";

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

/** ⌘K / Ctrl-K over providers, countries, corridors, changes, docs and actions. */
export function CommandPalette({
  items,
  placeholder = "Search providers, corridors, countries, changes…",
  recent = [],
}: {
  items: CommandItem[];
  placeholder?: string;
  recent?: CommandItem[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 20);
    else setQuery("");
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recent.length ? recent : items.slice(0, 8);
    return items
      .filter((i) => `${i.label} ${i.group} ${i.keywords ?? ""}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, items, recent]);

  useEffect(() => setCursor(0), [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[cursor];
      if (item) {
        item.run();
        setOpen(false);
      }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-[240px] items-center gap-2.5 rounded-full border border-[var(--color-line)] bg-white px-4 py-2.5 text-[14.5px] text-[var(--color-muted)] shadow-[var(--shadow-soft)] transition hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-panel)]"
      >
        <Search size={17} className="shrink-0 opacity-70" aria-hidden />
        <span className="flex-1 text-left">{placeholder.replace(/…$/, "")}</span>
        <kbd className="shrink-0 rounded-md border border-[var(--color-line)] px-1.5 py-0.5 text-[11px] font-medium">⌘K</kbd>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[100] flex items-start justify-center bg-[rgb(23_23_27/0.28)] p-4 pt-[12vh] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white shadow-[var(--shadow-panel)]"
            >
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                className="w-full border-b border-[var(--color-line)] px-4 py-3.5 text-[15px] outline-none placeholder:text-[var(--color-faint)]"
              />
              <ul className="max-h-[50vh] overflow-auto p-1.5">
                {results.map((item, i) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => {
                        item.run();
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left",
                        i === cursor ? "bg-[var(--color-lavender)]" : "hover:bg-[var(--color-canvas)]",
                      )}
                    >
                      <span className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                        {item.group}
                      </span>
                      <span className="flex-1 text-[14px] text-[var(--color-ink)]">{item.label}</span>
                      {item.hint ? (
                        <span className="text-[12px] text-[var(--color-muted)]">{item.hint}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
                {!results.length ? (
                  <li className="px-3 py-6 text-center text-[13px] text-[var(--color-muted)]">
                    Nothing matched “{query}”. Try a country, a provider or an asset.
                  </li>
                ) : null}
              </ul>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
