"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A quiet looping video behind a dark band (lib/media/generate-videos.py).
 * The poster shows first and stays for reduced motion or data saver; the video
 * only loads once the band is near the screen and pauses when it leaves.
 */
export function BandVideo({ name, className, opacity = 1 }: { name: string; className?: string; opacity?: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || saveData) return;
    const watcher = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setLoad(true);
        element.play().catch(() => undefined);
      } else element.pause();
    }, { rootMargin: "200px 0px" });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);

  const fill: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
  return (
    <div className={className} aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none", opacity }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the poster of a decorative background video */}
      <img src={`/video/${name}.jpg`} alt="" loading="lazy" decoding="async" style={fill} />
      <video
        ref={video}
        src={load ? `/video/${name}.mp4` : undefined}
        muted
        loop
        playsInline
        preload="none"
        onPlaying={() => setPlaying(true)}
        style={{ ...fill, opacity: playing ? 1 : 0, transition: "opacity 1s ease" }}
      />
    </div>
  );
}
