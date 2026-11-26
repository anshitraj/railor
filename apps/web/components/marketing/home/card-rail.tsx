"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./one-place.module.css";

/**
 * A row of feature cards you swipe (or arrow) through, with dots that follow
 * the card in view. Native scroll-snap does the moving; this only reports it.
 */
export function CardRail({ children, labels }: { children: React.ReactNode; labels: string[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const cards = [...element.children] as HTMLElement[];
      const left = element.scrollLeft;
      let best = 0;
      cards.forEach((card, i) => { if (Math.abs(card.offsetLeft - element.offsetLeft - left) < Math.abs(cards[best]!.offsetLeft - element.offsetLeft - left)) best = i; });
      setIndex(best);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => { element.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);

  const go = (to: number) => {
    const element = track.current;
    const card = element?.children[Math.max(0, Math.min(labels.length - 1, to))] as HTMLElement | undefined;
    if (element && card) element.scrollTo({ left: card.offsetLeft - element.offsetLeft, behavior: "smooth" });
  };

  return (
    <div className={styles.rail}>
      <div ref={track} className={styles.track} data-smooth-ignore>{children}</div>
      <div className={styles.controls}>
        <div className={styles.dots} role="tablist" aria-label="Cards">
          {labels.map((label, i) => <button key={label} type="button" role="tab" aria-selected={i === index} aria-label={label} onClick={() => go(i)} />)}
        </div>
        <div className={styles.arrows}>
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous card"><ArrowLeft size={18} aria-hidden /></button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === labels.length - 1} aria-label="Next card"><ArrowRight size={18} aria-hidden /></button>
        </div>
      </div>
    </div>
  );
}
