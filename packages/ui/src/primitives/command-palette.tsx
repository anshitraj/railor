"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Search, X, ArrowUpRight } from "lucide-react";
import { cn } from "../cn.js";
import { useModalFocus } from "./use-modal-focus.js";

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
  placeholder = "Search Railor…",
  recent = [],
}: {
  items: CommandItem[];
  placeholder?: string;
  recent?: CommandItem[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useModalFocus<HTMLDivElement>(open, () => setOpen(false));
  const resultsId = useId();
  const reduceMotion = useReducedMotion();
  // Show the shortcut people actually press on their platform.
  const [shortcut, setShortcut] = useState("⌘K");
  useEffect(() => {
    setMounted(true);
    if (typeof navigator !== "undefined" && !/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) setShortcut("Ctrl K");
  }, []);

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
    if (!open) setQuery("");
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recent.length ? recent : items.slice(0, 8);
    return items
      .filter((i) => `${i.label} ${i.group} ${i.keywords ?? ""}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, items, recent]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    if (open) document.getElementById(`${resultsId}-${cursor}`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, open, resultsId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.max(0, Math.min(results.length - 1, c + 1)));
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
        aria-label="Open search"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-10 min-w-0 items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px] text-[var(--color-muted)] transition hover:border-[var(--color-line-strong)] sm:min-w-[220px] sm:px-3.5"
      >
        <Search size={17} className="shrink-0 opacity-70" aria-hidden />
        <span className="flex-1 truncate text-left sm:hidden">Search</span>
        <span className="hidden flex-1 truncate text-left sm:inline">{placeholder.replace(/…$/, "")}</span>
        <kbd className="hidden shrink-0 rounded-md border border-[var(--color-line)] px-1.5 py-0.5 text-[11px] font-medium sm:inline">{shortcut}</kbd>
      </button>

      {mounted ? createPortal(<AnimatePresence>{open ? (
          <motion.div
            className="fixed inset-0 z-[100] flex items-start justify-center bg-[var(--color-ink)]/40 p-4 pt-[10dvh] backdrop-blur-sm"
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
              ref={panelRef}
              tabIndex={-1}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.98, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-panel)]"
            >
              <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-2">
              <Search size={20} className="shrink-0 text-[var(--color-orange-deep)]" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                role="combobox"
                aria-label="Search Railor"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={resultsId}
                aria-activedescendant={results.length ? `${resultsId}-${cursor}` : undefined}
                className="min-w-0 flex-1 bg-transparent px-1 py-3 text-[15px] placeholder:text-[var(--color-faint)]"
              />
              <button type="button" aria-label="Close search" onClick={() => setOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-sand)]"><X size={17} /></button>
              </div>
              <ul id={resultsId} role="listbox" aria-label="Search results" className="max-h-[55dvh] overflow-auto p-2">
                {results.map((item, i) => (
                  <li key={item.id}>
                    <button
                      id={`${resultsId}-${i}`}
                      role="option"
                      aria-selected={i === cursor}
                      type="button"
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => {
                        item.run();
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left",
                        i === cursor ? "bg-[var(--color-lavender)] ring-1 ring-inset ring-[var(--color-orange)]/20" : "hover:bg-[var(--color-canvas)]",
                      )}
                    >
                      <span className="min-w-14 font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                        {item.group}
                      </span>
                      <span className="flex-1 text-[14px] text-[var(--color-ink)]">{item.label}</span>
                      {item.hint ? (
                        <span className="text-[12px] text-[var(--color-muted)]">{item.hint}</span>
                      ) : null}
                      <ArrowUpRight size={15} aria-hidden className="shrink-0 text-[var(--color-muted)]" />
                    </button>
                  </li>
                ))}
                {!results.length ? (
                  <li className="px-3 py-6 text-center text-[13px] text-[var(--color-muted)]">
                    Nothing matched “{query}”. Try a country, a provider or an asset.
                  </li>
                ) : null}
              </ul>
              <div className="flex gap-4 border-t border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-2.5 font-mono text-[10px] text-[var(--color-muted)]"><span>↑ ↓ Navigate</span><span>↵ Open</span><span className="ml-auto">Esc Close</span></div>
            </motion.div>
          </motion.div>
      ) : null}</AnimatePresence>, document.body) : null}
    </>
  );
}
