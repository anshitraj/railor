"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import styles from "./hero.module.css";

/**
 * Full-bleed cinema hero background film with a frosted-glass pause/play control.
 * Posters paint immediately; video fades in smoothly once playing;
 * reduced motion and Save-Data respect the user and keep the still frame.
 */
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [canPlayVideo, setCanPlayVideo] = useState(false);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || saveData) return;

    setCanPlayVideo(true);
    setSrc(matchMedia("(max-width: 719px)").matches ? "/video/hero-film-m.mp4" : "/video/hero-film.mp4");

    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!element) return;
        if (entry?.isIntersecting) {
          if (!element.dataset.userPaused) element.play().catch(() => undefined);
        } else {
          element.pause();
        }
      },
      { threshold: 0.05 },
    );
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);

  const togglePlayback = () => {
    const el = videoRef.current;
    if (!el) return;
    if (userPaused || el.paused) {
      delete el.dataset.userPaused;
      setUserPaused(false);
      el.play().catch(() => undefined);
    } else {
      el.dataset.userPaused = "1";
      setUserPaused(true);
      el.pause();
    }
  };

  return (
    <>
      <div className={styles.media} aria-hidden="true">
        <picture>
          <source media="(max-width: 719px)" srcSet="/video/hero-film-m.jpg" />
          {/* eslint-disable-next-line @next/next/no-img-element -- first-frame hero film poster */}
          <img className={styles.poster} src="/video/hero-film.jpg" alt="" fetchPriority="high" decoding="async" />
        </picture>
        <video
          ref={videoRef}
          className={styles.video}
          src={src ?? undefined}
          data-playing={playing || undefined}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          onPlaying={() => setPlaying(true)}
        />
        <span className={styles.scrim} />
      </div>

      {canPlayVideo ? (
        <button
          type="button"
          className={styles.filmToggle}
          onClick={togglePlayback}
          aria-label={userPaused ? "Play background film" : "Pause background film"}
          aria-pressed={userPaused}
        >
          {userPaused ? <Play size={15} fill="currentColor" aria-hidden /> : <Pause size={15} fill="currentColor" aria-hidden />}
        </button>
      ) : null}
    </>
  );
}
