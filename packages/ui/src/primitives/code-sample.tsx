"use client";

import { useState } from "react";
import { cn } from "../cn.js";
import { TechnologyLogo } from "./technology-logo.js";

export interface CodeVariant {
  language: string;
  label: string;
  code: string;
}

/** `backticked` spans in a caption read as inline code instead of showing raw backticks. */
function captionWithCode(text: string) {
  return text.split(/`([^`]+)`/g).map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="rounded bg-white/10 px-1 py-px font-mono text-[1em] text-white/60">
        {part}
      </code>
    ) : (
      part
    ),
  );
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
  // Tabs are addressed by position: two tabs may share a language (e.g. two
  // "bash" install commands), so language cannot identify one.
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const current = variants[active] ?? variants[0];

  const code = (current?.code ?? "").replaceAll(
    "RAILOR_API_KEY",
    apiKey ?? "rail_test_your_key_here",
  );

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[#1c1b19]",
        className,
      )}
    >
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
        {/* Tabs scroll rather than wrap when a phone can't fit them all; py/-my leaves room for focus rings. */}
        <div className="-my-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {variants.map((v, i) => (
            <button
              key={`${i}-${v.label}`}
              type="button"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] transition-colors",
                v === current
                  ? "bg-white/10 text-white"
                  : "text-white/65 hover:text-white/90",
              )}
            >
              <TechnologyLogo name={v.label} fallbackName={v.language} size={19} />
              {v.label}
            </button>
          ))}
        </div>
        {apiKey ? (
          <span className="mr-2 shrink-0 rounded-full bg-[var(--color-lime)]/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-lime)]">
            Your test key
          </span>
        ) : null}
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-full px-3 py-1 text-[12px] text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed text-white/90">
        <code>{code}</code>
      </pre>
      {caption ? (
        <p className="border-t border-white/10 px-4 py-2 text-[11px] leading-relaxed text-white/40">
          {captionWithCode(caption)}
        </p>
      ) : null}
    </div>
  );
}
