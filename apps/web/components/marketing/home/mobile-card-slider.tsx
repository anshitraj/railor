"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./home.module.css";

export function MobileCardSlider({ children, labels, mode, label }: { children: ReactNode; labels: readonly string[]; mode: "steps" | "profiles"; label: string }) {
  const id = useId();
  const list = useRef<HTMLOListElement | HTMLUListElement | null>(null);
  const [current, setCurrent] = useState(0);
  const isSteps = mode === "steps";
  const List = isSteps ? "ol" : "ul";
  const moveTo = (index: number) => {
    const container = list.current;
    const card = container?.children[index];
    if (!(card instanceof HTMLElement) || !container) return;
    container.scrollTo({ left: card.offsetLeft, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return <>
    {!isSteps && <div className={styles.profileControls} role="group" aria-label="Choose a transfer profile">
      {labels.map((name, index) => <button key={name} type="button" aria-controls={id} aria-pressed={current === index} onClick={() => moveTo(index)}>{name}</button>)}
    </div>}
    <List id={id} ref={node => { list.current = node; }} className={isSteps ? styles.steps : styles.audiences} aria-label={label} onScroll={event => {
      const track = event.currentTarget;
      const slide = track.firstElementChild;
      if (slide instanceof HTMLElement && slide.nextElementSibling instanceof HTMLElement) {
        const stride = slide.nextElementSibling.offsetLeft - slide.offsetLeft;
        if (stride > 0) setCurrent(Math.min(labels.length - 1, Math.max(0, Math.round(track.scrollLeft / stride))));
      }
    }}>{children}</List>
    {isSteps && <div className={styles.stepControls}>
      <button type="button" aria-label="Previous step" disabled={current === 0} onClick={() => moveTo(current - 1)}><ChevronLeft size={18} /></button>
      <div className={styles.stepDots} role="group" aria-label="Jump to a step">
        {labels.map((label, index) => <button key={label} type="button" aria-label={label} aria-current={current === index ? "step" : undefined} onClick={() => moveTo(index)}><span /></button>)}
      </div>
      <button type="button" aria-label="Next step" disabled={current === labels.length - 1} onClick={() => moveTo(current + 1)}><ChevronRight size={18} /></button>
    </div>}
  </>;
}
