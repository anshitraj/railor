/** Pure URL validation shared by redirects and tests. */
export function safeReturnPath(value: unknown, fallback = "/welcome"): string {
  if (typeof value !== "string" || value.length > 1500 || !value.startsWith("/") ||
      value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    const url = new URL(value, "https://railor.invalid");
    return url.origin === "https://railor.invalid" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}

/** Keep setup completion local and avoid redirecting into another auth flow. */
export function onboardingFinishPath(value: unknown): string {
  const path = safeReturnPath(value, "/app");
  const pathname = new URL(path, "https://railor.invalid").pathname;
  return /^\/(welcome|login|auth|api)(\/|$)/.test(pathname) ? "/app" : path;
}

/** First sign-in starts setup; completed users and invitations keep their destination. */
export function signInDestination(value: unknown, onboardingComplete: boolean): string {
  const path = safeReturnPath(value);
  const url = new URL(path, "https://railor.invalid");
  if (url.pathname.startsWith("/invite/")) return path;
  if (url.pathname === "/welcome") {
    if (!onboardingComplete) return path;
    if (url.searchParams.has("next")) return onboardingFinishPath(url.searchParams.get("next"));
    const query = url.searchParams.get("q");
    return query ? `/app/search?q=${encodeURIComponent(query)}` : "/app";
  }
  return onboardingComplete ? onboardingFinishPath(path) : `/welcome?next=${encodeURIComponent(onboardingFinishPath(path))}`;
}

/** Platform hosts come from Vercel's environment, never from a caller's request. */
function platformOrigin(): string | null {
  const host = (process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL)?.trim();
  return host && /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `https://${host}` : null;
}

export function appOrigin(): string {
  const raw = process.env.APP_ORIGIN?.trim() || platformOrigin() || (process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000" : "");
  const url = new URL(raw);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (process.env.NODE_ENV === "production" ? url.protocol !== "https:" : !["https:", "http:"].includes(url.protocol))) {
    throw new Error("APP_ORIGIN must be a canonical origin (HTTPS in production)");
  }
  return url.origin;
}

/** Where Enterprise "Contact us" goes; null when CONTACT_EMAIL is unset or malformed. */
export function contactEmail(): string | null {
  const value = process.env.CONTACT_EMAIL?.trim();
  return value && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(value) ? value : null;
}

/**
 * Checkout link for a plan: PLUS_PAYMENT_LINK, PRO_PAYMENT_LINK or
 * BUSINESS_PAYMENT_LINK. Business falls back to the original
 * FOUNDING_PAYMENT_LINK, which was the same $29 a month.
 */
export function paymentLink(plan: "plus" | "pro" | "business" = "business"): string | null {
  const byPlan = { plus: process.env.PLUS_PAYMENT_LINK, pro: process.env.PRO_PAYMENT_LINK, business: process.env.BUSINESS_PAYMENT_LINK || process.env.FOUNDING_PAYMENT_LINK };
  const raw = byPlan[plan]?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  const allowed = (process.env.PAYMENT_LINK_ALLOWED_HOSTS ?? "buy.stripe.com,checkout.stripe.com").split(",").map((s) => s.trim().toLowerCase());
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowed.includes(url.hostname.toLowerCase())) {
    throw new Error("Payment link host is not allowed");
  }
  return url.toString();
}
