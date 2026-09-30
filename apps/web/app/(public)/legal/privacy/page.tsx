import Link from "next/link";
import { SectionLabel } from "@railor/ui";

export const metadata = { title: "Privacy Policy" };

const COLLECTED: Array<[string, string]> = [
  ["Account", "Your email address and, if you sign in with Google or GitHub, the display name they return. No passwords — sign-in is by magic link or OAuth."],
  ["Workspace", "What you create: corridors, monitors, alerts, policies, decisions, readiness answers, invitations and provider-connection metadata. Provider credentials, if you add any, are encrypted at rest (AES-256-GCM)."],
  ["API usage", "Per-key request counts, endpoints, status codes and latency — used for quotas, the usage dashboard and abuse prevention."],
  ["Security", "Rate-limit counters keyed by a one-way hash of your IP or email. Raw IP addresses are not stored."],
  ["Cookies", "Two strictly necessary cookies: a session cookie and the id of the workspace you last opened. No advertising or cross-site tracking cookies."],
];

export default function PrivacyPage() {
  return (
    <article className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <SectionLabel>Legal</SectionLabel>
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight">Privacy Policy</h1>
        <p className="text-[14px] leading-relaxed text-[var(--color-muted)]">
          What this Railor deployment stores, why, and what you can do about it. Written to match what the code actually does.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[18px] font-semibold">What is collected</h2>
        <dl className="flex flex-col divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          {COLLECTED.map(([term, detail]) => (
            <div key={term} className="grid gap-1 px-5 py-4 sm:grid-cols-[140px_1fr]">
              <dt className="text-[14px] font-semibold">{term}</dt>
              <dd className="text-[13.5px] leading-relaxed text-[var(--color-muted)]">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[18px] font-semibold">How it is used</h2>
        <p className="text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          To run the product for your organization: sign you in, show your workspace, deliver alerts you asked for, meter the API, and keep the service secure. Your workspace data is never sold.
        </p>
        <p className="text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          When the operator enables them, the text of a search may be sent to a language-model provider to interpret it, and a corridor query to a web-research provider for fresh market discovery. Only the query itself is sent — never your workspace records, readiness profile or keys.
        </p>
        <p className="text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          Email is sent only for sign-in links, invitations and alerts you configured, through the SMTP provider the operator sets up.
        </p>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[18px] font-semibold">Your choices</h2>
        <ul className="flex flex-col gap-1.5 text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          <li>• Leave a workspace or remove members from Settings → Team.</li>
          <li>• Revoke API keys and provider connections at any time from the dashboard.</li>
          <li>• Ask the deployment operator to export or delete your account data.</li>
        </ul>
      </section>

      <p className="text-[13px] text-[var(--color-muted)]">
        See also the <Link href="/legal/terms" className="font-semibold text-[var(--color-orange-deep)] underline underline-offset-2">Terms of Service</Link>.
      </p>
    </article>
  );
}
