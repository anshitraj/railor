"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@railor/ui";

interface Props {
  returnTo: string;
  oauth: { google: boolean; github: boolean };
  savedQuery?: string;
}

/**
 * Sign-in is one field. OAuth buttons are shown honestly: if the deployment
 * has no client ID configured, the button says so rather than failing after
 * the click.
 */
export function LoginForm({ returnTo, oauth, savedQuery }: Props) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [devLink, setDevLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    const response = await fetch("/api/auth/magic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, returnTo }),
    });
    const json = await response.json();
    if (json.sent) {
      setState("sent");
      setDevLink(json.devLink ?? null);
    } else {
      setState("error");
      setMessage(
        json.error === "mail_transport_not_configured"
          ? "No mail transport is configured on this deployment. Set SMTP_URL, or use AUTH_EMAIL_TRANSPORT=console in development."
          : "That email address didn't look right.",
      );
    }
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold tracking-tight">Welcome to Railor</h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          {savedQuery
            ? `We'll pick up where you left off: “${savedQuery}”`
            : "Sign in to see full comparisons, evidence and monitoring."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {(["google", "github"] as const).map((provider) => {
          const enabled = oauth[provider];
          const label = provider === "google" ? "Continue with Google" : "Continue with GitHub";
          return enabled ? (
            <a key={provider} href={`/api/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`}>
              <Button variant="secondary" className="w-full justify-center">
                {label}
              </Button>
            </a>
          ) : (
            <button
              key={provider}
              type="button"
              disabled
              title={`Set ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET to enable`}
              className="w-full cursor-not-allowed rounded-full border border-dashed border-[var(--color-line-strong)] px-4 py-2.5 text-[14px] text-[var(--color-faint)]"
            >
              {label} — not configured
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--color-line)]" />
        <span className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">or</span>
        <span className="h-px flex-1 bg-[var(--color-line)]" />
      </div>

      {state === "sent" ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-4">
          <p className="text-[14px] font-medium">Check your inbox</p>
          <p className="text-[13px] text-[var(--color-muted)]">
            We sent a sign-in link to {email}. It expires in 20 minutes.
          </p>
          {devLink ? (
            <div className="flex flex-col gap-1 rounded-xl bg-[var(--color-lavender)] p-3">
              <span className="text-[11px] uppercase tracking-wide text-[var(--color-purple)]">
                Development transport
              </span>
              <a href={devLink} className="break-all text-[12.5px] text-[var(--color-purple-deep)] underline">
                {devLink}
              </a>
            </div>
          ) : null}
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="rounded-full border border-[var(--color-line)] bg-white px-4 py-2.5 text-[14px] outline-none focus:border-[var(--color-violet)]"
            aria-label="Work email"
          />
          <Button type="submit" disabled={state === "sending"} className="justify-center">
            {state === "sending" ? "Sending…" : "Continue with email"}
          </Button>
          {state === "error" && message ? (
            <p className="text-[12.5px] text-[var(--color-bad)]">{message}</p>
          ) : null}
        </form>
      )}

      <p className="text-[12px] leading-relaxed text-[var(--color-faint)]">
        By continuing, you agree to the{" "}
        <Link href="/company/trust" className="underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/company/trust" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
