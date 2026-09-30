"use client";

import { ErrorView } from "../components/error-view";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-[var(--color-paper)] px-4 py-16">
      <ErrorView error={error} reset={reset} />
    </main>
  );
}
