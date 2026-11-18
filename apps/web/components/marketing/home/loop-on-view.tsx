"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Starts a scene on first view, or pauses and resumes a repeating demo as it
 * leaves and re-enters the viewport.
 */
export function LoopOnView({ className, children, once = false }: { className?: string; children: React.ReactNode; once?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (once) element.dataset.sceneReady = "";
    const observer = new IntersectionObserver(([entry]) => {
      const inView = Boolean(entry && entry.intersectionRatio >= 0.35);
      setPlaying(inView);
      if (inView && once) observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(element);
    return () => {
      observer.disconnect();
      delete element.dataset.sceneReady;
    };
  }, [once]);
  return <div ref={ref} className={className} data-playing={playing || undefined}>{children}</div>;
}
