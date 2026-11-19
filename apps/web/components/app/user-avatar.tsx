"use client";

import { useState } from "react";
import { fallbackFill } from "../marketing/logo-fallback";

function initials(name: string | null | undefined, email: string) {
  const source = (name?.trim() || email.split("@")[0] || "R").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "R") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}

/**
 * The person's own photo from Google or GitHub when they signed in with it,
 * otherwise their initials on a colour that stays the same for them.
 * A photo that fails to load falls back to the initials, never a broken image.
 */
export function UserAvatar({ src, name, email, size = 32, className = "" }: { src?: string | null; name?: string | null; email: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- provider-hosted photo; next/image would need every host configured.
      <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setFailed(true)}
        className={className} style={{ ...style, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
    );
  }
  return (
    <span aria-hidden className={className} style={{ ...style, display: "inline-grid", placeItems: "center", flex: "none", borderRadius: "50%", background: fallbackFill(email, 3), color: "#fff", fontWeight: 700, letterSpacing: "-.02em" }}>
      {initials(name, email)}
    </span>
  );
}
