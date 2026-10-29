"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import type { PickerOption } from "@railor/ui";
import styles from "./route-option-picker.module.css";

/** Image-capable picker: native option menus cannot render country or currency marks. */
export function RouteOptionPicker({ label, options, value, onChange, placeholder, renderMark }: {
  label: string; options: PickerOption[]; value: string; onChange: (value: string) => void;
  placeholder: string; renderMark: (value: string) => ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const selected = options.find(option => option.value === value);
  const choices = [...(query.trim() ? [] : [{ value: "", label: placeholder }]), ...options.filter(option => `${option.label} ${option.value}`.toLowerCase().includes(query.trim().toLowerCase()))];
  const active = choices[Math.min(cursor, choices.length - 1)];
  function close(focus = false) { setPosition(null); if (focus) trigger.current?.focus(); }
  function choose(next: string) { onChange(next); close(true); }
  function open() {
    const rect = trigger.current!.getBoundingClientRect();
    const height = Math.min(350, window.innerHeight - 24);
    const below = window.innerHeight - rect.bottom - 12;
    const top = below >= Math.min(height, 220) ? rect.bottom + 6 : Math.max(12, rect.top - height - 6);
    setQuery(""); setCursor(Math.max(0, options.findIndex(option => option.value === value) + 1));
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(rect.width, window.innerWidth - 24) - 12)), top, width: Math.min(rect.width, window.innerWidth - 24), height: Math.min(height, window.innerHeight - top - 12) });
  }
  useEffect(() => {
    if (!position) return;
    input.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(); };
    const scroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) close(); };
    const resize = () => close();
    document.addEventListener("pointerdown", outside); document.addEventListener("wheel", scroll, { passive: true }); document.addEventListener("touchmove", scroll, { passive: true }); window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("wheel", scroll); document.removeEventListener("touchmove", scroll); window.removeEventListener("resize", resize); };
  }, [Boolean(position)]);
  useEffect(() => {
    const option = position ? document.getElementById(`${id}-option-${cursor}`) : null;
    const list = option?.parentElement;
    if (!option || !list) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }, [cursor, position, id]);
  return <>
    <button ref={trigger} id={`${id}-trigger`} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={Boolean(position)} aria-controls={position ? `${id}-list` : undefined} className={styles.trigger} onClick={() => position ? close() : open()} onKeyDown={event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); open(); } }}>
      {value && renderMark(value)}<span>{selected?.label ?? (value || placeholder)}</span><ChevronDown size={15} aria-hidden />
    </button>
    {position && createPortal(<div ref={panel} className={styles.panel} style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.height }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) close(); }}>
      <div className={styles.search}><Search size={15} aria-hidden /><input ref={input} role="combobox" aria-label={`Search ${label.toLowerCase()}`} aria-expanded aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={active ? `${id}-option-${Math.min(cursor, choices.length - 1)}` : undefined} placeholder="Search by name or code" value={query} onChange={event => { setQuery(event.target.value); setCursor(0); }} onKeyDown={event => {
        if (event.key === "ArrowDown") { event.preventDefault(); setCursor(index => Math.min(index + 1, choices.length - 1)); }
        if (event.key === "ArrowUp") { event.preventDefault(); setCursor(index => Math.max(index - 1, 0)); }
        if (event.key === "Enter") { event.preventDefault(); if (active) choose(active.value); }
        if (event.key === "Escape") { event.preventDefault(); close(true); }
      }} /></div>
      <ul id={`${id}-list`} role="listbox" aria-label={label} className={styles.options}>{choices.map((option, index) => <li key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={value === option.value} data-active={cursor === index} onMouseEnter={() => setCursor(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.value)}>
        {option.value && renderMark(option.value)}<span>{option.label}</span>{option.value && <small>{option.value}</small>}{value === option.value && <Check size={14} aria-hidden />}
      </li>)}{!choices.length && query && <li className={styles.empty}>No matches. Try another name or code.</li>}</ul>
    </div>, document.body)}
  </>;
}
