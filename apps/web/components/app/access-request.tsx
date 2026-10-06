"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, LockKeyhole, Mail, X } from "lucide-react";
import { useModalFocus } from "@railor/ui";
import { ProviderLogo } from "./provider-logo";

export function AccessRequestButton({ provider, providerName = provider, feature = "execution", supportsCredentials = false,
  defaultEmail = "", label, className = "comparison-secondary-action" }: {
  provider: string; providerName?: string; feature?: "provider_connection" | "execution";
  supportsCredentials?: boolean; defaultEmail?: string; label?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const reduce = useReducedMotion();
  const panel = useModalFocus<HTMLDivElement>(open, () => setOpen(false));
  const connection = feature === "provider_connection";
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/notify", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature, providerRequested: provider, email }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) setError(payload.error === "work_email_required" ? "Use your company email so we can match the request to your workspace."
        : response.status === 429 ? "Too many requests. Please try again shortly." : "We couldn’t save this request. Check your email and try again.");
      else setSaved(true);
    } catch { setError("The connection dropped. Please try again."); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={() => { setError(""); setOpen(true); }} className={className}>
      {saved ? "Access requested" : label ?? (connection ? `Connect ${providerName}` : "Request execution access")}
      {connection ? <ArrowUpRight size={14} aria-hidden /> : <LockKeyhole size={14} aria-hidden />}
    </button>
    {typeof document !== "undefined" ? createPortal(<AnimatePresence>{open ? <motion.div className="access-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.16 }}>
      <div className="absolute inset-0" onClick={() => setOpen(false)} aria-hidden />
      <motion.div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}
        className="access-dialog" initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduce ? 0 : 8 }} transition={{ duration: reduce ? 0 : 0.22 }}>
        <button className="access-close" type="button" aria-label="Close access request" onClick={() => setOpen(false)}><X size={18} /></button>
        <div className="access-provider"><ProviderLogo slug={provider} name={providerName} size={36} /><span>{providerName}</span></div>
        <p className="product-eyebrow mt-7">{saved ? "Request received" : connection ? "Provider connection" : "Execution / private beta"}</p>
        <h2 id={titleId} className="mt-2 font-display text-3xl font-semibold tracking-tight">{saved ? "You’re on the list." : connection ? supportsCredentials ? "Bring your provider account." : "Connect when access opens." : "Decide now. Execute when available."}</h2>
        <p id={descriptionId} className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">{saved ? `We saved your ${connection ? "connection" : "execution"} access request for ${providerName}. We’ll follow up at ${email}.`
          : connection ? supportsCredentials ? "Use your existing API credentials in Connections to request account pricing. Guided provider connections are being rolled out; request help below."
            : `${providerName} connection is coming soon. Request early access and we’ll contact you when an account connection is available.`
          : "Direct execution is in private beta. An allowed policy decision is separate from a transfer. Transfers through connected providers are being rolled out; this request does not initiate one."}</p>
        {saved ? <div className="access-success"><Check size={18} /><span>Access requested · no transfer initiated</span></div> : <>
          {connection && supportsCredentials ? <Link href="/app/settings/connections" onClick={() => setOpen(false)} className="access-credentials">Use API credentials <ArrowUpRight size={16} /></Link> : null}
          <form onSubmit={submit} className="mt-6 space-y-3"><label className="block text-xs font-semibold text-[var(--color-ink-soft)]" htmlFor={`${titleId}-email`}>Work email</label>
            <div className="access-email"><Mail size={16} aria-hidden /><input id={`${titleId}-email`} type="email" autoComplete="email" required maxLength={320} value={email} aria-invalid={Boolean(error)} aria-describedby={error ? `${titleId}-error` : undefined} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="you@company.com" /></div>
            {error ? <p id={`${titleId}-error`} role="alert" className="text-xs text-[var(--color-bad)]">{error}</p> : null}
            <button className="comparison-primary-action w-full justify-center" type="submit" disabled={busy}>{busy ? "Saving request…" : connection ? "Request connection access" : "Request execution access"}<ArrowUpRight size={15} /></button>
            <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">We store your workspace, provider and contact email. An access request does not connect an account or send money.</p>
          </form>
        </>}
      </motion.div>
    </motion.div> : null}</AnimatePresence>, document.body) : null}
  </>;
}
