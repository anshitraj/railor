"use client";

import { useEffect, useRef, useState } from "react";
import logoManifest from "../../lib/provider-logo-manifest.json";
import { fallbackFill } from "../marketing/logo-fallback";

const localLogos: Readonly<Record<string, string>> = logoManifest;

/**
 * A bundled brand mark or the provider's same-origin logo endpoint.
 * A monogram fills the tile if the image is unavailable.
 */
export function ProviderLogo({
  slug,
  name,
  src,
  size = 28,
  className = "",
  loading = "lazy",
  localOnly = false,
}: {
  slug: string;
  name: string;
  /** Only for providers outside Railor's registry (the market feed): an allowlisted logo URL. */
  src?: string;
  size?: number;
  className?: string;
  /** Visible disclosure summaries need eager loading even while their details are closed. */
  loading?: "lazy" | "eager";
  /** Large pickers can show local marks and monograms without requesting every logo. */
  localOnly?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const key = slug.replace(/^market:/, "").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64) || "provider";
  const local = Object.hasOwn(localLogos, key) ? localLogos[key] : undefined;
  const url = local ? `/brand/providers/${local}` : localOnly ? null : `/api/logos/${key}${src ? `?src=${encodeURIComponent(src)}` : ""}`;
  // An image that settled before hydration never fires onLoad/onError; check it once mounted.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth < 2) setFailedUrl(url);
  }, [url]);
  const box = { width: size, height: size };
  if (!url || failedUrl === url) {
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
        key={url}
        ref={img}
        src={url}
        alt=""
        width={size}
        height={size}
        loading={loading}
        decoding="async"
        onError={() => setFailedUrl(url)}
        // "No logo" arrives as a 1×1 transparent pixel rather than an error.
        onLoad={(e) => e.currentTarget.naturalWidth < 2 && setFailedUrl(url)}
        className="h-[76%] w-[76%] object-contain"
      />
    </span>
  );
}
