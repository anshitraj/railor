"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import styles from "./why-story.module.css";

export interface StoryChapter {
  id: string;
  label: string;
  title: string;
  lead: string;
  cta: { label: string; href: string };
  visual: React.ReactNode;
}

/**
 * Why Railor as a pinned story (Opendue's "Use Due to collect / hold / pay"):
 * on a wide screen the section holds still while you scroll, the chapter list
 * on the left lights up one word at a time and the picture on the right changes
 * with it. On a phone each chapter is its own card, in order.
 */
export function WhyStory({ chapters }: { chapters: StoryChapter[] }) {
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      if (travel <= 0) return;
      const progress = Math.min(0.999, Math.max(0, -box.top / travel));
      setActive(Math.floor(progress * chapters.length));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    paint();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [chapters.length]);

  const chapter = chapters[active]!;
  return (
    <>
      <div ref={track} className={styles.track} style={{ "--chapters": chapters.length } as React.CSSProperties}>
        <div className={styles.stage}>
          <div className={styles.copy}>
            <ol className={styles.words} aria-label="What Railor does">
              {chapters.map((item, index) => (
                <li key={item.id} data-active={index === active || undefined} data-past={index < active || undefined}>{item.label}</li>
              ))}
            </ol>
            <div className={styles.detail} key={chapter.id}>
              <h3>{chapter.title}</h3>
              <p>{chapter.lead}</p>
              <Link href={chapter.cta.href} className={`${styles.cta} press`}>{chapter.cta.label}<ArrowRight size={16} aria-hidden /></Link>
            </div>
          </div>
          <div className={styles.pictures}>
            {chapters.map((item, index) => (
              <div key={item.id} className={styles.picture} data-active={index === active || undefined} aria-hidden={index !== active}>{item.visual}</div>
            ))}
          </div>
          <div className={styles.progress} aria-hidden>
            {chapters.map((item, index) => <span key={item.id} data-on={index <= active || undefined} />)}
          </div>
        </div>
      </div>

      <div className={styles.cards}>
        {chapters.map((item) => (
          <article key={item.id} className={styles.card} aria-labelledby={`why-${item.id}`} data-home-reveal>
            <p className={styles.cardLabel}>{item.label}</p>
            <h3 id={`why-${item.id}`}>{item.title}</h3>
            <p className={styles.cardLead}>{item.lead}</p>
            <div className={styles.cardPicture}>{item.visual}</div>
            <Link href={item.cta.href} className={`${styles.cta} press`}>{item.cta.label}<ArrowRight size={16} aria-hidden /></Link>
          </article>
        ))}
      </div>
    </>
  );
}
