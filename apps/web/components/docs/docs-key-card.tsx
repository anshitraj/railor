"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Copy, KeyRound } from "lucide-react";

const CARD =
  "flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4";

/**
 * Signed out: the one nudge that makes every snippet runnable as printed.
 * Signed in: the key itself, one click from the clipboard.
 */
export function DocsKeyCard({ apiKey }: { apiKey: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!apiKey) {
    return (
      <div className={CARD}>
        <span className="flex size-8 items-center justify-center rounded-full bg-[var(--color-lavender)] text-[var(--color-orange-deep)]">
          <KeyRound size={15} strokeWidth={2} aria-hidden />
        </span>
        <p className="text-[13px] leading-snug text-[var(--color-ink-soft)]">
          Sign in and every snippet renders with your own test key.
        </p>
        <Link
          href="/login?intent=start"
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-[var(--color-orange-deep)]"
        >
          Sign in <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked (insecure context); the key stays selectable.
    }
  };

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--color-orange-deep)]">
          <KeyRound size={14} strokeWidth={2} aria-hidden />
          Your test key
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-white px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-ink-soft)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]"
        >
          {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <code className="break-all rounded-lg bg-[var(--color-sand)] px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
        {apiKey}
      </code>
      <p className="text-[11.5px] leading-snug text-[var(--color-faint)]">
        Snippets on these pages are rendered with it.
      </p>
    </div>
  );
}
