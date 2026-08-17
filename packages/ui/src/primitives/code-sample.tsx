"use client";

import { useState } from "react";
import { cn } from "../cn.js";

export interface CodeVariant {
  language: string;
  label: string;
  code: string;
}

/**
 * Docs that know who you are. When the reader is signed in, the caller passes
 * their real test key and their most recent corridor, so every snippet is
 * runnable exactly as printed — no placeholder hunting.
 */
export function CodeSample({
  variants,
  apiKey,
  className,
  caption,
}: {
  variants: CodeVariant[];
  apiKey?: string;
  className?: string;
  caption?: string;
}) {
  const [active, setActive] = useState(variants[0]?.language ?? "");
  const [copied, setCopied] = useState(false);
  const current = variants.find((v) => v.language === active) ?? variants[0];

  const code = (current?.code ?? "").replaceAll(
    "RAILOR_API_KEY",
    apiKey ?? "rk_test_your_key_here",
  );

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[#14141b]",
        className,
      )}
    >
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
        {variants.map((v) => (
          <button
            key={v.language}
            type="button"
            onClick={() => setActive(v.language)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] transition",
              v.language === current?.language
                ? "bg-white/10 text-white"
                : "text-white/50 hover:text-white/80",
            )}
          >
            {v.label}
          </button>
        ))}
        <div className="flex-1" />
        {apiKey ? (
          <span className="mr-2 rounded-full bg-[var(--color-lime)]/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-lime)]">
            Your test key
          </span>
        ) : null}
        <button
          type="button"
          onClick={copy}
          className="rounded-full px-3 py-1 text-[12px] text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed text-white/90">
        <code>{code}</code>
      </pre>
      {caption ? (
        <p className="border-t border-white/10 px-4 py-2 text-[11px] text-white/40">{caption}</p>
      ) : null}
    </div>
  );
}
