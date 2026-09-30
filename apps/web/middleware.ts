import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "./lib/security";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const api = path.startsWith("/api/") || path.startsWith("/v1/");
  if (mutating && api) {
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > 65_536)) {
      return NextResponse.json({ error: "request_too_large" }, { status: 413 });
    }
    // /v1 uses bearer authentication exclusively. Cookie BFF routes require the canonical origin.
    const serviceRoute = path.startsWith("/api/internal/") || path.startsWith("/api/webhooks/") || path === "/api/mcp" || path === "/api/connector/poll";
    if (path.startsWith("/api/") && !serviceRoute && request.headers.get("origin") !== appOrigin()) {
      return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
    }
  }
  // Provider logos are public, cacheable images with their own sandboxed CSP (set by the route).
  if (path.startsWith("/api/logos/")) {
    const response = NextResponse.next();
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
  const nonce = btoa(crypto.randomUUID());
  const policy = [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https:", "font-src 'self' data:",
    "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // Browsers must never downgrade a Railor session to plain HTTP (production only: localhost is http).
  if (process.env.NODE_ENV === "production") response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (api || path.startsWith("/app") || path.startsWith("/admin") || path.startsWith("/auth")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|woff2)$).*)"] };
