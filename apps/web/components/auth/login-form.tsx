"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, TechnologyLogo } from "@railor/ui";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";

interface Props {
  returnTo: string;
  oauth: { google: boolean; github: boolean };
  demoAvailable: boolean;
  savedQuery?: string;
  initialError?: string;
  initialEmail?: string;
}

const ERROR_MESSAGE: Record<string, string> = {
  missing_token: "That sign-in link was missing its token.",
  expired: "That sign-in link expired or was already used. Request a new one below.",
  no_org: "We couldn't find a workspace for that account. Try signing in again.",
  oauth_unsupported: "That sign-in provider isn't supported.",
  oauth_not_configured: "That sign-in provider isn't configured on this deployment.",
  oauth_denied: "Sign-in was cancelled.",
  oauth_state: "That sign-in attempt couldn't be verified. Please try again.",
  oauth_failed: "Sign-in with that provider failed. Try again, or use email below.",
  demo_failed: "Couldn't load the demo workspace just now. Try again in a moment.",
  demo_unavailable: "The demo workspace is available in development. Sign in below to use Railor.",
  email_unavailable: "Email sign-in is temporarily unavailable. Try again later or contact your workspace administrator.",
  mail_transport_not_configured: "Email sign-in is temporarily unavailable. Try again later or contact your workspace administrator.",
  send_failed: "Couldn't send that email. Please try again shortly.",
  sign_in_unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
};

/**
 * Sign-in is one field. Only available OAuth methods are shown.
 */
export function LoginForm({ returnTo, oauth, demoAvailable, savedQuery, initialError, initialEmail }: Props) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    initialError ? "error" : "idle",
  );
  const [devLink, setDevLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    initialError ? (ERROR_MESSAGE[initialError] ?? "Something went wrong signing you in.") : null,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setMessage(null);
    setState("sending");
    try {
      const response = await fetch("/api/auth/magic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, returnTo }),
      });
      const json = await response.json();
      if (response.ok && json.sent) {
        setState("sent");
        setDevLink(json.devLink ?? null);
      } else {
        setState("error");
        setMessage(
          response.status === 429 ? "Too many attempts. Please wait a moment and try again."
            : (ERROR_MESSAGE[json.error] ?? "That email address didn't look right."),
        );
      }
    } catch {
      setState("error");
      setMessage("Couldn't connect. Check your connection and try again.");
    }
  };

  return (
    <div className="railor-rise flex w-full max-w-[420px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="product-eyebrow mb-2">Welcome to Railor</span>
        <h1 className="font-display text-[36px] font-semibold leading-tight tracking-[-0.045em]">Your rails. One workspace.</h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          {savedQuery
            ? `We'll pick up where you left off: “${savedQuery}”`
            : "Search infrastructure, compare permitted routes and decide before money moves."}
        </p>
      </div>

      {(oauth.google || oauth.github) && <div className="flex flex-col gap-2">
        {(["google", "github"] as const).filter((provider) => oauth[provider]).map((provider) => {
          const label = provider === "google" ? "Continue with Google" : "Continue with GitHub";
          return (
            <a key={provider} href={`/api/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`} className="inline-flex min-h-11 items-center justify-center gap-3 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 text-[14px] font-semibold hover:bg-[var(--color-paper)]">
                <TechnologyLogo name={provider} size={20} />
                {label}
            </a>
          );
        })}
      </div>}

      {(oauth.google || oauth.github) && <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--color-line)]" />
        <span className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">or</span>
        <span className="h-px flex-1 bg-[var(--color-line)]" />
      </div>}

      {state === "sent" ? (
        <div role="status" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-ok)]/25 bg-[var(--color-ok-bg)] p-5">
          <CheckCircle2 size={24} aria-hidden className="text-[var(--color-ok)]" />
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
          <button type="button" onClick={() => { setState("idle"); setDevLink(null); }} className="w-fit text-[12px] font-semibold underline underline-offset-4">Use a different email</button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3" aria-busy={state === "sending"}>
          <label htmlFor="sign-in-email" className="text-[12px] font-semibold">Email address</label>
          <input
            id="sign-in-email"
            name="email"
            autoComplete="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-3 text-[14px] focus:border-[var(--color-action)]"
            aria-label="Email address"
            aria-describedby="sign-in-email-hint"
          />
          <p id="sign-in-email-hint" className="text-[12px] text-[var(--color-muted)]">Company or work email preferred. Personal email is welcome too.</p>
          <Button type="submit" disabled={state === "sending"} className="justify-center">
            {state === "sending" ? "Sending…" : "Continue with email"}
            <ArrowRight size={16} aria-hidden />
          </Button>
          {state === "error" && message ? (
            <p role="alert" className="rounded-xl bg-[var(--color-bad-bg)] px-3 py-2 text-[12.5px] text-[var(--color-bad)]">{message}</p>
          ) : null}
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-muted)]"><ShieldCheck size={13} aria-hidden /> A secure sign-in link. No password needed.</p>
        </form>
      )}

      {demoAvailable && <a href="/api/auth/demo" className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4 text-left transition-colors hover:border-[var(--color-line-strong)]">
        <span><span className="block text-[13.5px] font-semibold">Just want to look around?</span><span className="mt-1 block text-[12px] text-[var(--color-muted)]">Explore the demo. No email needed.</span></span>
        <span className="shrink-0 text-[13px] font-semibold text-[var(--color-orange-deep)] transition-transform group-hover:translate-x-0.5">View demo →</span>
      </a>}

      <p className="text-[11.5px] leading-relaxed text-[var(--color-muted)]">
        By continuing, you agree to the{" "}
        <Link href="/legal/terms" className="underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
