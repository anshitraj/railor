"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shared body for route error boundaries: says what failed, offers a retry, never guesses. */
export function ErrorView({
  error,
  reset,
  homeHref = "/",
  homeLabel = "Back to Railor",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4 rounded-[20px] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8" role="alert">
      <span className="flex size-10 items-center justify-center rounded-full border border-[var(--color-orange)] font-mono text-[14px] font-semibold text-[var(--color-orange-deep)]">!</span>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[26px] font-medium leading-tight tracking-[-0.04em]">Something failed to load.</h1>
        <p className="text-[14px] leading-relaxed text-[var(--color-muted)]">
          Nothing you entered was lost or changed. This is usually temporary — retrying reloads the data from its source.
        </p>
        {error.digest ? (
          <p className="font-mono text-[11.5px] text-[var(--color-faint)]">Reference: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[var(--color-orange-deep)]"
        >
          Try again
        </button>
        <Link href={homeHref} className="rounded-full border border-[var(--color-line-strong)] px-5 py-2.5 text-[14px] font-semibold transition hover:border-[var(--color-ink)]">
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
