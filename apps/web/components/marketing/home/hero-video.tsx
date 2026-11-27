"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./hero.module.css";

/**
 * The hero's moving background: money travelling across a dotted globe,
 * rendered by lib/media/generate-videos.py. The poster is drawn first so
 * nothing jumps; the video fades in over it once it is actually playing.
 * Reduced motion and data saver keep the still. Off screen, it pauses.
 */
export function HeroVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || saveData) return;
    setSrc(matchMedia("(max-width: 719px)").matches ? "/video/hero-globe-m.mp4" : "/video/hero-globe.mp4");
    const watcher = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) element.play().catch(() => undefined);
      else element.pause();
    });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);

  return (
    <div className={styles.media} aria-hidden="true">
      <picture>
        <source media="(max-width: 719px)" srcSet="/video/hero-globe-m.jpg" />
        {/* eslint-disable-next-line @next/next/no-img-element -- the poster of a decorative background video */}
        <img className={styles.poster} src="/video/hero-globe.jpg" alt="" fetchPriority="high" decoding="async" />
      </picture>
      <video
        ref={video}
        className={styles.video}
        src={src ?? undefined}
        data-playing={playing || undefined}
        muted
        loop
        playsInline
        autoPlay
        preload="none"
        onPlaying={() => setPlaying(true)}
      />
      <span className={styles.wash} />
    </div>
  );
}
