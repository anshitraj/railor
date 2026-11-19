"use client";

import { useEffect, useRef, useState } from "react";
import { fallbackFill } from "../marketing/logo-fallback";

const LOCAL_LOGOS: Record<string, string> = {
  coindcx: "coindcx.png", wazirx: "wazirx.png", xflow: "xflow.svg", circle: "circle.svg",
  tether: "tether.png", uniswap: "uniswap.png", titan: "titan.ico", wise: "wise.png",
  remitly: "remitly.png", xoom: "xoom.png", worldremit: "worldremit.svg", "world-remit": "worldremit.svg", instarem: "instarem.png",
  payzoll: "payzoll.png", revolut: "revolut.svg", skydo: "skydo.png",
  koinly: "koinly.ico", cleartax: "cleartax.svg", incometax: "incometax.ico",
  "state-bank-of-india": "state-bank-of-india.png", "hdfc-bank": "hdfc-bank.png",
  "idfc-first-bank": "idfc-first-bank.png", "canara-bank": "canara-bank.png",
  lemfi: "lemfi.png", sendwave: "sendwave.png", nala: "nala.png",
  koinbx: "koinbx.png", ledgerpe: "ledgerpe.png",
};

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
  const [ready, setReady] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const key = slug.replace(/^market:/, "").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64) || "provider";
  const local = LOCAL_LOGOS[key];
  const url = local ? `/brand/providers/${local}` : localOnly ? null : `/api/logos/${key}${src ? `?src=${encodeURIComponent(src)}` : ""}`;
  // A cached logo can finish while streamed HTML is still hydrating. Keep the
  // first render deterministic, then attach image-load handlers after mounting.
  useEffect(() => setReady(true), []);
  // An image that settled before hydration never fires onLoad/onError; check it once mounted.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth < 2) setFailedUrl(url);
  }, [ready, url]);
  const box = { width: size, height: size };
  if (!ready || !url || failedUrl === url) {
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
