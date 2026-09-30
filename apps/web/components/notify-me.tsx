"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { cn } from "@railor/ui";

export type NotifyFeature = "connections" | "benchmarks" | "unified-api" | "orchestration" | "alerts-slack" | "alerts-webhook";

/**
 * The real action behind every "Coming soon" label. Signed-in people get a
 * one-click subscribe; visitors add an address inline — no modal, no page.
 */
export function NotifyMe({
  feature,
  signedIn = false,
  className,
  compact = false,
}: {
  feature: NotifyFeature;
  signedIn?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "asking" | "sending" | "done" | "error">("idle");
  const [email, setEmail] = useState("");

  const submit = async (address?: string) => {
    setState("sending");
    try {
      const response = await fetch("/api/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature, email: address }),
      });
      setState(response.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-ok)]", className)}>
        <Check size={13} /> We&apos;ll email you when it ships
      </span>
    );
  }

  if (state === "asking" || (state === "error" && !signedIn) || (state === "sending" && !signedIn)) {
    return (
      <form
        className={cn("inline-flex flex-wrap items-center gap-1.5", className)}
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void submit(email.trim());
        }}
      >
        <input
          type="email"
          required
          autoFocus
          aria-label="Email for launch notification"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-48 rounded-full border border-[var(--color-line-strong)] bg-white px-3 py-1 text-[12.5px] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-orange)] focus-visible:ring-2 focus-visible:ring-[var(--color-orange)]/25"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="rounded-full bg-[var(--color-ink)] px-3 py-1 text-[12px] font-bold text-white transition hover:bg-[var(--color-orange-deep)] disabled:opacity-60"
        >
          {state === "sending" ? "…" : "Notify me"}
        </button>
        {state === "error" ? <span className="text-[11.5px] text-[var(--color-bad)]">Couldn&apos;t save — try again.</span> : null}
      </form>
    );
  }

  return (
    <button
      type="button"
      disabled={state === "sending"}
      onClick={() => (signedIn ? void submit() : setState("asking"))}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] font-semibold text-[var(--color-ink-soft)] transition hover:-translate-y-px hover:border-[var(--color-orange)] hover:text-[var(--color-orange-deep)] disabled:opacity-60",
        compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-[12px]",
        className,
      )}
    >
      <Bell size={compact ? 11 : 13} /> {state === "error" ? "Retry" : "Notify me"}
    </button>
  );
}
