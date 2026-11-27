"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Check, ChevronDown, CreditCard, Globe2, Landmark, type LucideIcon } from "lucide-react";
import type { CustomerContext } from "@railor/core";
import styles from "./price.module.css";

export type PayMethod = NonNullable<CustomerContext["paymentMethod"]>;

export const PAY_METHODS: Array<{ value: PayMethod; label: string; hint: string }> = [
  { value: "local_bank", label: "Local bank transfer", hint: "e.g. a US ACH transfer into your receiving account" },
  { value: "wire", label: "International wire (SWIFT)", hint: "Intermediary banks may deduct extra" },
  { value: "card", label: "Card", hint: "Card fees are usually different" },
  { value: "transfer_service", label: "Transfer app (Wise, Remitly…)", hint: "Your client sends with their own app" },
];

/** Icon and tint per method, so each option reads at a glance. */
const METHOD_LOOK: Record<PayMethod, { icon: LucideIcon; tint: string; ink: string; rails: string[] }> = {
  local_bank: { icon: Landmark, tint: "#fff1ea", ink: "#b83d1c", rails: ["ACH", "SEPA", "FPS"] },
  wire: { icon: Globe2, tint: "#eaf0fb", ink: "#2c5597", rails: ["SWIFT"] },
  card: { icon: CreditCard, tint: "#fdf5e4", ink: "#8a5c17", rails: ["Visa", "Mastercard"] },
  transfer_service: { icon: ArrowLeftRight, tint: "#ecf8f0", ink: "#1d6f3b", rails: ["Wise", "Remitly"] },
};

function MethodMark({ method, size }: { method: PayMethod; size: "sm" | "lg" }) {
  const look = METHOD_LOOK[method];
  const Icon = look.icon;
  return (
    <span className={styles.methodMark} data-size={size} style={{ "--mark-tint": look.tint, "--mark-ink": look.ink } as CSSProperties} aria-hidden>
      <Icon size={size === "lg" ? 17 : 13} strokeWidth={2.1} />
    </span>
  );
}

/** How the payer funds it — prices are only compared within one method. */
export function PayMethodSelect({ value, onChange, label = "Client pays by", cardComingSoon = false }: { value: PayMethod; onChange: (value: PayMethod) => void; label?: string; cardComingSoon?: boolean }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; above: boolean } | null>(null);
  const [cursor, setCursor] = useState(0);
  const currentIndex = Math.max(0, PAY_METHODS.findIndex((option) => option.value === value));
  const current = PAY_METHODS[currentIndex]!;
  const currentLabel = cardComingSoon && value === "card" ? "Card · Coming soon" : current.label;

  function close(focus = false) { setPosition(null); if (focus) trigger.current?.focus(); }
  function choose(next: PayMethod) { if (next !== value) onChange(next); close(true); }
  function open() {
    const rect = trigger.current!.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 24);
    const height = Math.min(4 * 84 + 40, vh - 24);
    const above = vh - rect.bottom < height + 16 && rect.top > height + 16;
    const rawTop = above ? rect.top - height - 6 : rect.bottom + 6;
    setCursor(currentIndex);
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: Math.max(12, Math.min(rawTop, vh - height - 12)), width, above });
  }

  useEffect(() => {
    if (!position) return;
    const openWidth = window.innerWidth;
    panel.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(); };
    const scroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) close(); };
    const resize = () => { if (Math.abs(window.innerWidth - openWidth) > 40) close(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, { passive: true, capture: true });
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, { capture: true });
      window.removeEventListener("resize", resize);
    };
  }, [Boolean(position)]);

  return <>
    <button
      ref={trigger}
      type="button"
      className={styles.payMethod}
      title={currentLabel === current.label ? current.hint : "Card pricing is coming soon"}
      aria-haspopup="listbox"
      aria-expanded={Boolean(position)}
      aria-controls={position ? `${id}-list` : undefined}
      aria-label={`${label}: ${currentLabel}`}
      data-open={Boolean(position) || undefined}
      onClick={() => position ? close() : open()}
      onKeyDown={(event) => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); open(); } }}
    >
      <MethodMark method={current.value} size="sm" />
      <span className={styles.payMethodLabel}>{label}</span>
      <span className={styles.payMethodValue}>{currentLabel}</span>
      <ChevronDown size={14} aria-hidden className={styles.payMethodChevron} />
    </button>
    {position && createPortal(
      <div
        ref={panel}
        id={`${id}-list`}
        role="listbox"
        tabIndex={-1}
        aria-label={label}
        aria-activedescendant={`${id}-opt-${cursor}`}
        className={styles.methodPanel}
        data-above={position.above || undefined}
        style={{ left: position.left, top: position.top, width: position.width }}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) close(); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setCursor((index) => (index + 1) % PAY_METHODS.length); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setCursor((index) => (index - 1 + PAY_METHODS.length) % PAY_METHODS.length); }
          else if (event.key === "Home") { event.preventDefault(); setCursor(0); }
          else if (event.key === "End") { event.preventDefault(); setCursor(PAY_METHODS.length - 1); }
          else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(PAY_METHODS[cursor]!.value); }
          else if (event.key === "Escape") { event.preventDefault(); close(true); }
          else if (event.key === "Tab") close();
        }}
      >
        <p className={styles.methodPanelHead}>{label}</p>
        {PAY_METHODS.map((option, index) => (
          <div
            key={option.value}
            id={`${id}-opt-${index}`}
            role="option"
            aria-selected={option.value === value}
            data-active={cursor === index || undefined}
            className={styles.methodOption}
            onMouseEnter={() => setCursor(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option.value)}
          >
            <MethodMark method={option.value} size="lg" />
            <span className={styles.methodText}>
              <strong>{cardComingSoon && option.value === "card" ? "Card · Coming soon" : option.label.replace(/\s*\(.*\)$/, "")}</strong>
              <small>{cardComingSoon && option.value === "card" ? "Card price comparisons are in development." : option.hint}</small>
              <span className={styles.methodRails} aria-hidden>
                {METHOD_LOOK[option.value].rails.map((rail) => <span key={rail}>{rail}</span>)}
              </span>
            </span>
            <span className={styles.methodCheck} aria-hidden>{option.value === value ? <Check size={14} strokeWidth={2.6} /> : null}</span>
          </div>
        ))}
      </div>,
      document.body,
    )}
  </>;
}

export function CardPricingComingSoon({ onCompare, personal }: { onCompare: () => void; personal: boolean }) {
  const alternative = personal ? "transfer apps" : "local bank transfers";
  return <section className={styles.cardComingSoon} aria-label="Card pricing">
    <MethodMark method="card" size="lg" />
    <div role="status"><h2>Card pricing is coming soon</h2><p>You can compare {alternative} for this route today.</p></div>
    <button type="button" onClick={onCompare}>{personal ? "Compare transfer apps" : "Compare bank transfers"}</button>
  </section>;
}
