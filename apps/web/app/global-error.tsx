"use client";

import "./globals.css";
import { ErrorView } from "../components/error-view";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <main id="main" className="auth-viewport flex items-center justify-center bg-[var(--color-paper)] px-4 py-10 sm:py-16">
          <ErrorView error={error} reset={reset} />
        </main>
      </body>
    </html>
  );
}
