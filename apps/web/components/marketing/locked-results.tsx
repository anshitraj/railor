"use client";

import { Lock } from "lucide-react";
import { ProviderLogo } from "../app/provider-logo";

/** What the server tells a visitor who is not logged in about a result: who it is, and that the rest is locked. */
export interface LockedResult {
  provider: { slug: string; name: string; category: string; isDemo?: boolean };
  locked: true;
}

/**
 * The answer, as a visitor who is not logged in gets it: the providers that ranked first, behind frosted glass
 * with a lock. The server sends no verdicts, fees, limits or evidence for them, so this is a lock and not a blur
 * laid over data the page already holds. The whole panel is one button to log in.
 */
export function LockedResults({ results, onUnlock }: { results: LockedResult[]; onUnlock: () => void }) {
  return (
    <div data-locked-results className="relative overflow-hidden rounded-[var(--radius-card)]">
      <ul className="flex flex-col gap-2">
        {results.map((result) => (
          <li
            key={result.provider.slug}
            className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-4"
          >
            <ProviderLogo slug={result.provider.slug} name={result.provider.name} size={36} />
            <span className="flex min-w-[160px] flex-1 flex-col">
              <span className="text-[15px] font-medium text-[var(--color-ink)]">{result.provider.name}</span>
              <span className="text-[12px] text-[var(--color-muted)]">{result.provider.category}</span>
            </span>
            {/* Where the verdict, the fees and the confidence would be: shapes, never their values. */}
            <span aria-hidden className="flex items-center gap-3">
              <i className="h-6 w-[78px] rounded-full bg-[var(--color-line)]" />
              <i className="hidden h-8 w-[150px] rounded-lg bg-[var(--color-line)] sm:block" />
              <i className="h-4 w-12 rounded bg-[var(--color-line)]" />
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onUnlock}
        className="group absolute inset-0 grid place-items-center bg-white/55 backdrop-blur-[3px] transition-colors hover:bg-white/65 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-orange)]"
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-[13px] font-semibold text-white shadow-[var(--shadow-lift)] transition-transform group-hover:-translate-y-px">
          <Lock size={14} aria-hidden />
          Log in to see the results
        </span>
      </button>
    </div>
  );
}
