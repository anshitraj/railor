"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, TechnologyLogo } from "@railor/ui";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";

interface Props {
  returnTo: string;
  /** "start" when the visitor came from a Get started button. */
  intent?: string;
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
export function LoginForm({ returnTo, intent, oauth, demoAvailable, savedQuery, initialError, initialEmail }: Props) {
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
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
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
    <div className="railor-rise flex w-full max-w-[400px] flex-col gap-3 sm:gap-6">
      <div className="flex flex-col gap-1 sm:gap-2">
        <h1 className="text-[clamp(24px,6vw,38px)] font-[650] leading-[1.08] tracking-[-0.03em]">{savedQuery ? "Sign in to see your results" : intent === "start" ? "Create your free account" : "Welcome back"}</h1>
        <p className="text-[14px] leading-snug text-[var(--color-muted)] sm:text-[15px] sm:leading-relaxed">
          {savedQuery
            ? <>Your search carries over: <span className="font-semibold text-[var(--color-ink)]">“{savedQuery}”</span></>
            : intent === "start"
              ? "Enter your email and we’ll send you a link. No password, no card."
              : "Enter your email and we’ll send you a secure sign-in link."}
        </p>
      </div>

      {(oauth.google || oauth.github) && <div className="flex flex-col gap-2">
        {(["google", "github"] as const).filter((provider) => oauth[provider]).map((provider) => {
          const label = provider === "google" ? "Continue with Google" : "Continue with GitHub";
          return (
            <a key={provider} href={`/api/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`} className="press inline-flex min-h-12 items-center justify-center gap-3 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 text-[15px] font-semibold hover:border-[var(--color-ink)]">
                <TechnologyLogo name={provider} size={20} />
                {label}
            </a>
          );
        })}
      </div>}

      {(oauth.google || oauth.github) && <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--color-line)]" />
        <span className="text-[12.5px] uppercase tracking-wide text-[var(--color-faint)]">or</span>
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
              <span className="text-[12.5px] uppercase tracking-wide text-[var(--color-purple)]">
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
        <form onSubmit={submit} className="flex flex-col gap-2.5 sm:gap-3" aria-busy={state === "sending"}>
          <label htmlFor="sign-in-email" className="text-[13.5px] font-semibold">Email address</label>
          <input
            id="sign-in-email"
            name="email"
            autoComplete="email"
            inputMode="email"
            enterKeyHint="go"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="h-11 rounded-2xl border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 text-[16px] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-ink)] focus:shadow-[0_0_0_4px_rgb(21_19_16/0.06)] sm:h-12"
            aria-label="Email address"
            aria-describedby="sign-in-email-hint"
          />
          <p id="sign-in-email-hint" className="text-[12px] text-[var(--color-muted)] sm:text-[12.5px]">Work or personal email both work.</p>
          <Button type="submit" disabled={state === "sending"} className="min-h-11 justify-center rounded-full bg-[var(--color-ink)] text-[15px] hover:bg-[#2a2722] sm:min-h-12">
            {state === "sending" ? "Sending your link…" : "Continue with email"}
            <ArrowRight size={16} aria-hidden />
          </Button>
          {state === "error" && message ? (
            <p role="alert" className="rounded-xl bg-[var(--color-bad-bg)] px-3 py-2 text-[12.5px] text-[var(--color-bad)]">{message}</p>
          ) : null}
          <p className="flex items-center justify-center gap-1.5 text-[12px] text-[var(--color-muted)]"><ShieldCheck size={14} aria-hidden /> A one-time link, valid for 20 minutes.</p>
        </form>
      )}

      {demoAvailable && <a href="/api/auth/demo" className="group flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-3 text-left transition-colors hover:border-[var(--color-line-strong)] sm:gap-3 sm:p-4">
        <span><span className="block text-[13.5px] font-semibold">Just want to look around?</span><span className="mt-0.5 block text-[12px] text-[var(--color-muted)] sm:mt-1">Explore the demo. No email needed.</span></span>
        <span className="shrink-0 text-[13px] font-semibold text-[var(--color-orange-deep)] transition-transform group-hover:translate-x-0.5">View demo →</span>
      </a>}

      <p className="text-[12.5px] leading-snug text-[var(--color-muted)] sm:text-[13px] sm:leading-relaxed">
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
