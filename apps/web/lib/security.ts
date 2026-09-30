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

export function appOrigin(): string {
  const raw = process.env.APP_ORIGIN ?? (process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000" : "");
  const url = new URL(raw);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (process.env.NODE_ENV === "production" ? url.protocol !== "https:" : !["https:", "http:"].includes(url.protocol))) {
    throw new Error("APP_ORIGIN must be a canonical origin (HTTPS in production)");
  }
  return url.origin;
}

export function paymentLink(): string | null {
  const raw = process.env.FOUNDING_PAYMENT_LINK?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  const allowed = (process.env.PAYMENT_LINK_ALLOWED_HOSTS ?? "buy.stripe.com,checkout.stripe.com").split(",").map((s) => s.trim().toLowerCase());
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowed.includes(url.hostname.toLowerCase())) {
    throw new Error("Payment link host is not allowed");
  }
  return url.toString();
}
