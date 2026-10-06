"use client";

import { useEffect, useRef, useState } from "react";
import { fallbackFill } from "../marketing/logo-fallback";

/**
 * A provider's own logo (resolved from its website by /api/logos), on a white
 * tile so marks of every colour read the same. If there is no logo — or it
 * fails to load — a stable-coloured monogram takes its place, never a broken
 * image.
 */
export function ProviderLogo({
  slug,
  name,
  src,
  size = 28,
  className = "",
}: {
  slug: string;
  name: string;
  /** Only for providers outside Railor's registry (the market feed): an allowlisted logo URL. */
  src?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A cached logo can finish while streamed HTML is still hydrating. Keep the
  // first render deterministic, then attach image-load handlers after mounting.
  useEffect(() => setReady(true), []);
  // An image that settled before hydration never fires onLoad/onError; check it once mounted.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth < 2) setFailed(true);
  }, [ready, slug, src]);
  const key = slug.replace(/^market:/, "").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64) || "provider";
  const url = `/api/logos/${key}${src ? `?src=${encodeURIComponent(src)}` : ""}`;
  const box = { width: size, height: size };
  if (!ready || failed) {
    return (
      <span
        aria-hidden
        style={{ ...box, background: fallbackFill(key), fontSize: Math.round(size * 0.44) }}
        className={`inline-flex shrink-0 items-center justify-center rounded-[28%] font-bold uppercase text-white ${className}`}
      >
        {name.trim().charAt(0) || "?"}
      </span>
    );
  }
  return (
    <span style={box} className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] bg-white ring-1 ring-[var(--color-line)] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- same-origin, already optimized, and must fall back on error */}
      <img
        ref={img}
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        // "No logo" arrives as a 1×1 transparent pixel rather than an error.
        onLoad={(e) => e.currentTarget.naturalWidth < 2 && setFailed(true)}
        className="h-[76%] w-[76%] object-contain"
      />
    </span>
  );
}
