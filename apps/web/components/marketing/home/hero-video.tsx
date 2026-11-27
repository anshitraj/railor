"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Bell, Check, Pause, Play, ShieldCheck } from "lucide-react";
import styles from "./hero.module.css";

interface ScenePill {
  id: string;
  headline: string;
  subline: string;
  tone: "coral" | "green" | "gold" | "ink";
  icon: "swap" | "check" | "bell" | "shield";
}

const SCENE_PILLS: ScenePill[] = [
  {
    id: "rate",
    headline: "₹91,526.74",
    subline: "Best rate via Wise · saved $18.40 vs bank",
    tone: "green",
    icon: "swap",
  },
  {
    id: "cost",
    headline: "0.62% real cost",
    subline: "Fee + FX markup vs mid-market · upfront",
    tone: "coral",
    icon: "shield",
  },
  {
    id: "invoice",
    headline: "+$2,450.00",
    subline: "Invoice matched · GBP → INR best route",
    tone: "green",
    icon: "check",
  },
  {
    id: "alert",
    headline: "1 GBP = 109.40 INR",
    subline: "Rate alert triggered · 400+ providers live",
    tone: "gold",
    icon: "bell",
  },
];

function PillIcon({ kind }: { kind: ScenePill["icon"] }) {
  if (kind === "swap") return <ArrowLeftRight size={19} strokeWidth={2.4} aria-hidden />;
  if (kind === "check") return <Check size={19} strokeWidth={2.8} aria-hidden />;
  if (kind === "bell") return <Bell size={18} strokeWidth={2.4} aria-hidden />;
  return <ShieldCheck size={19} strokeWidth={2.3} aria-hidden />;
}

/**
 * Full-bleed cinema hero background film with GetOn-style floating glass
 * notification pills synchronized to each scene, plus a bottom-right pause/play
 * control. Posters paint immediately; video fades in smoothly once playing;
 * reduced motion and Save-Data respect the user and keep the still frame.
 */
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);
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

  // Fallback timer so pills still cycle gracefully if video is paused by reduced-motion / still mode.
  useEffect(() => {
    if (playing && !userPaused) return;
    if (userPaused) return;
    const reduced = typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const id = window.setInterval(() => {
      setSceneIndex((current) => (current + 1) % SCENE_PILLS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, [playing, userPaused]);

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || !el.duration || !Number.isFinite(el.duration)) return;
    const segment = el.duration / SCENE_PILLS.length;
    const next = Math.min(SCENE_PILLS.length - 1, Math.floor(el.currentTime / segment));
    if (next !== sceneIndex) setSceneIndex(next);
  };

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

  const activePill = SCENE_PILLS[sceneIndex]!;

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
          onTimeUpdate={handleTimeUpdate}
        />
        <span className={styles.scrim} />
      </div>

      {/* Synchronized frosted-glass notification pill (GetOn-inspired, DOM-crisp on every viewport) */}
      <div className={styles.pillStage} aria-hidden="true">
        <div key={activePill.id} className={styles.glassPill}>
          <span className={styles.pillIcon} data-tone={activePill.tone}>
            <PillIcon kind={activePill.icon} />
          </span>
          <span className={styles.pillBody}>
            <strong>{activePill.headline}</strong>
            <small>{activePill.subline}</small>
          </span>
        </div>
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
