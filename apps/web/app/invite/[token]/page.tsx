import Link from "next/link";
import { getSession } from "../../../lib/auth";
import { loadInvite } from "../../../lib/invites";
import { RailorMark } from "../../../components/marketing/nav";
import { AcceptInviteButton } from "./accept-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join a workspace", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, session] = await Promise.all([loadInvite(token), getSession()]);
  const next = `/invite/${encodeURIComponent(token)}`;

  let body: React.ReactNode;
  if (!invite || invite.state !== "pending") {
    body = (
      <>
        <h1 className="font-display text-[30px] font-medium leading-tight tracking-[-0.04em]">
          {invite?.state === "accepted" ? "This invitation was already used." : "This invitation has expired."}
        </h1>
        <p className="text-[14px] leading-relaxed text-[var(--color-muted)]">
          Invitations are single-use and last seven days. Ask whoever invited you to send a fresh one from their workspace settings.
        </p>
        <Link href={session ? "/app" : "/"} className="w-fit rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[var(--color-orange-deep)]">
          {session ? "Go to your workspace" : "Back to Railor"}
        </Link>
      </>
    );
  } else {
    const signedInAsInvitee = session?.user.email.toLowerCase() === invite.email;
    body = (
      <>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-orange-deep)]">Workspace invitation</p>
        <h1 className="font-display text-[32px] font-medium leading-[1.02] tracking-[-0.045em]">
          Join <span className="text-[var(--color-orange)]">{invite.organizationName}</span> on Railor
        </h1>
        <p className="text-[14px] leading-relaxed text-[var(--color-muted)]">
          {invite.inviterEmail ? <>{invite.inviterEmail} invited </> : "You were invited "}
          <strong className="text-[var(--color-ink)]">{invite.email}</strong> as <strong className="capitalize text-[var(--color-ink)]">{invite.role}</strong>. You&apos;ll share the workspace&apos;s corridors, monitors, policies and decisions.
        </p>
        {!session ? (
          <Link
            href={`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`}
            className="w-fit rounded-full bg-[var(--color-orange)] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[var(--color-orange-deep)]"
          >
            Sign in as {invite.email} to accept
          </Link>
        ) : signedInAsInvitee ? (
          <AcceptInviteButton token={token} organizationName={invite.organizationName} />
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-warn)]/30 bg-[var(--color-warn-bg)] p-4 text-[13px] leading-relaxed">
            <p>
              You&apos;re signed in as <strong>{session.user.email}</strong>, but this invitation is for <strong>{invite.email}</strong>.
            </p>
            <form action="/api/auth/signout" method="post">
              <input type="hidden" name="next" value={`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`} />
              <button type="submit" className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-[13px] font-bold text-white">
                Sign out and switch account
              </button>
            </form>
          </div>
        )}
        <p className="text-[12px] text-[var(--color-faint)]">Expires {invite.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.</p>
      </>
    );
  }

  return (
    <main id="main" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-paper)] px-4 py-16">
      <div className="rail-map-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="railor-rise relative flex w-full max-w-[480px] flex-col gap-4 rounded-[24px] border border-[var(--color-line)] bg-[var(--color-surface)] p-7 shadow-[var(--shadow-panel)] sm:p-9">
        <Link href="/" className="mb-2 flex w-fit items-center gap-2">
          <RailorMark size={28} />
          <span className="font-display text-[18px] font-bold tracking-[-0.05em]">Railor</span>
        </Link>
        {body}
      </div>
    </main>
  );
}
