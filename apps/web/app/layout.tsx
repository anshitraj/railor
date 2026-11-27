import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { MobileViewportManager } from "../components/mobile-viewport";
import { PageMotion } from "../components/page-motion";
import { Toaster } from "../components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Railor — Financial infrastructure, mapped.",
    template: "%s · Railor",
  },
  description:
    "Discover, compare and monitor the stablecoin, banking, card and compliance infrastructure powering global money movement — backed by verifiable sources.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f3ed",
  // Android: the on-screen keyboard shrinks the page instead of covering it,
  // so sheets and the chat composer stay above the keyboard. iOS is handled
  // symmetrically via MobileViewportManager (--vvh / --kb-offset).
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce CSP requires request-time rendering; static HTML would contain a different nonce.
  await headers();
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>
        {children}
        <MobileViewportManager />
        <Suspense fallback={null}><PageMotion /></Suspense>
        <Toaster />
      </body>
    </html>
  );
}
