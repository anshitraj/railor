"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

/**
 * A small, dependency-free toast system. Call `toast.success("Copied")` or
 * `toast.error("Couldn’t save", "Try again in a minute.")` from any client
 * component; the single <Toaster /> in the root layout renders them.
 *
 * Toasts enter from below with a short transition (interruptible, so rapid
 * toasts retarget instead of restarting), pause while hovered or while the tab
 * is hidden, and exit faster than they arrived.
 */

type ToastKind = "success" | "error" | "info";
interface ToastItem { id: number; kind: ToastKind; title: string; description?: string; closing?: boolean }

const EVENT = "railor:toast";
const DURATION = { success: 3200, info: 4200, error: 6500 } as const;
let sequence = 0;

function emit(kind: ToastKind, title: string, description?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, { detail: { id: ++sequence, kind, title, description } }));
}

export const toast = Object.assign((title: string, description?: string) => emit("info", title, description), {
  success: (title: string, description?: string) => emit("success", title, description),
  error: (title: string, description?: string) => emit("error", title, description),
  info: (title: string, description?: string) => emit("info", title, description),
});

const ICON = { success: CircleCheck, error: CircleAlert, info: Info } as const;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, closing: true } : item)));
    window.setTimeout(() => setItems((list) => list.filter((item) => item.id !== id)), 160);
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const item = (event as CustomEvent<ToastItem>).detail;
      // Keep the stack short: the newest three are all anyone reads.
      setItems((list) => [...list.filter((existing) => !existing.closing).slice(-2), item]);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <section aria-label="Notifications" className="railor-toaster">
      <ol>
        {items.map((item) => <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />)}
      </ol>
    </section>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [hovered, setHovered] = useState(false);
  const remaining = useRef<number>(DURATION[item.kind]);
  const Icon = ICON[item.kind];

  useEffect(() => {
    if (hovered || item.closing) return;
    let started = Date.now();
    let timer = 0;
    const schedule = () => { started = Date.now(); timer = window.setTimeout(onDismiss, remaining.current); };
    const pause = () => { window.clearTimeout(timer); remaining.current = Math.max(600, remaining.current - (Date.now() - started)); };
    const onVisibility = () => (document.hidden ? pause() : schedule());
    if (!document.hidden) schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { pause(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [hovered, item.closing, onDismiss]);

  return (
    <li
      role={item.kind === "error" ? "alert" : "status"}
      data-kind={item.kind}
      data-closing={item.closing || undefined}
      className="railor-toast"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Icon size={18} aria-hidden className="railor-toast-icon" />
      <div className="min-w-0 flex-1">
        <p className="railor-toast-title">{item.title}</p>
        {item.description ? <p className="railor-toast-description">{item.description}</p> : null}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="railor-toast-close">
        <X size={14} aria-hidden />
      </button>
    </li>
  );
}
