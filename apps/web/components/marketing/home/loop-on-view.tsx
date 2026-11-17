"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Plays a demo loop only while it is on screen. Off screen (or with reduced
 * motion) the CSS animations stay paused, so a long page never runs a dozen
 * loops nobody is looking at.
 */
export function LoopOnView({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(([entry]) => setPlaying(Boolean(entry?.isIntersecting)), { threshold: 0.35 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={className} data-playing={playing || undefined}>{children}</div>;
}
