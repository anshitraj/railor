"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Search, X, ArrowUpRight, ArrowDown, ArrowUp, CornerDownLeft, Route, Building2, BookOpen, Code2, Zap, Compass } from "lucide-react";
import { cn } from "../cn.js";
import { useModalFocus } from "./use-modal-focus.js";

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keywords?: string;
  icon?: ReactNode;
  run: () => void;
}

/** ⌘K / Ctrl-K over providers, countries, corridors, changes, docs and actions. */
export function CommandPalette({
  items,
  placeholder = "Search Railor…",
  recent = [],
  brand,
}: {
  items: CommandItem[];
  placeholder?: string;
  recent?: CommandItem[];
  brand?: ReactNode;
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

  useEffect(() => setCursor(0), [query, open]);
  useEffect(() => {
    if (open) document.getElementById(`${resultsId}-${cursor}`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, open, resultsId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
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
            className="command-backdrop fixed inset-0 z-[100] flex items-start justify-center p-3 pt-[8dvh] sm:p-4 sm:pt-[12dvh]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
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
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="command-panel w-full max-w-[540px] overflow-hidden"
            >
              <div className="command-search">
              <span className="command-brand" aria-hidden>{brand ?? <Search size={20} />}</span>
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
                className="command-input"
              />
              {query ? <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="command-clear"><X size={14} aria-hidden /></button> : null}
              <button type="button" aria-label="Close search" onClick={() => setOpen(false)} className="command-close"><X size={16} aria-hidden /></button>
              </div>
              <ul id={resultsId} role="listbox" aria-label="Search results" className="command-results">
                {results.map((item, i) => (
                  <motion.li key={item.id} role="presentation" initial={reduceMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18, delay: reduceMotion ? 0 : Math.min(i * 0.018, 0.1) }}>
                    {i === 0 || results[i - 1]?.group !== item.group ? <div className="command-section" aria-hidden>{groupLabel(item.group)}</div> : null}
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
                        "command-result",
                        i === cursor && "is-selected",
                      )}
                    >
                      <span className="command-icon" aria-hidden>{item.icon ?? <GroupIcon group={item.group} />}</span>
                      <span className="command-copy"><span className="command-label">{item.label}</span>{item.hint ? <span className="command-hint">{item.hint}</span> : null}</span>
                      {i === cursor ? <CornerDownLeft size={15} aria-hidden className="command-open" /> : <ArrowUpRight size={14} aria-hidden className="command-open" />}
                    </button>
                  </motion.li>
                ))}
                {!results.length ? (
                  <li role="presentation" className="command-empty">
                    <span className="command-empty-icon"><Search size={22} aria-hidden /></span>
                    <strong>Nothing matched “{query}”</strong>
                    <span>Try a page, provider, or payment action.</span>
                  </li>
                ) : null}
              </ul>
              <div className="command-footer"><span className="command-footer-brand"><Search size={12} aria-hidden /> Railor search</span><span className="command-key-help"><kbd><ArrowUp size={10} aria-hidden /></kbd><kbd><ArrowDown size={10} aria-hidden /></kbd><span>Navigate</span></span><span className="command-key-help"><kbd><CornerDownLeft size={11} aria-hidden /></kbd><span>Open</span></span><span className="command-key-help"><kbd>esc</kbd><span>Close</span></span></div>
            </motion.div>
          </motion.div>
      ) : null}</AnimatePresence>, document.body) : null}
    </>
  );
}

function groupLabel(group: string) {
  return ({ Action: "Quick actions", Corridor: "Saved corridors", Provider: "Providers", "Go to": "Pages", Docs: "Documentation", Developer: "Developer tools" } as Record<string, string>)[group] ?? group;
}

function GroupIcon({ group }: { group: string }) {
  const Icon = ({ Action: Zap, Corridor: Route, Provider: Building2, "Go to": Compass, Docs: BookOpen, Developer: Code2 } as Record<string, typeof Search>)[group] ?? Search;
  return <Icon size={17} />;
}
