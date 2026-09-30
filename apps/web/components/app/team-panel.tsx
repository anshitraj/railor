"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Mail, UserMinus } from "lucide-react";
import { Button, cn } from "@railor/ui";
import { inviteTeammate, removeTeamMember, revokeTeamInvite, setMemberRole, switchWorkspace } from "../../app/app/settings/actions";
import { Segmented } from "./form-kit";

const ROLE_HINT: Record<string, string> = {
  owner: "Everything, including ownership",
  admin: "Manage people, keys and policies",
  member: "Search, monitor, evaluate",
  viewer: "Read-only",
};

interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  joinedAt: string | null;
}

interface PendingInvite {
  token: string;
  email: string;
  role: string;
  expiresAt: string;
  url: string;
}

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const run = <T,>(work: () => Promise<{ ok: true; data?: T } | { ok: false; error: string }>, onOk?: (data?: T) => void) => {
    setError("");
    start(async () => {
      const result = await work();
      if (!result.ok) setError(result.error);
      else {
        onOk?.(result.data);
        router.refresh();
      }
    });
  };
  return { pending, error, run };
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          window.prompt("Copy this invite link", url);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[12px] font-semibold transition hover:border-[var(--color-line-strong)]"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function TeamPanel({
  members,
  invites,
  currentUserId,
  currentRole,
}: {
  members: Member[];
  invites: PendingInvite[];
  currentUserId: string;
  currentRole: string | null;
}) {
  const manage = currentRole === "owner" || currentRole === "admin";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [lastInvite, setLastInvite] = useState<{ url: string; emailed: boolean; email: string } | null>(null);
  const invite = useAction();
  const memberAction = useAction();

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col divide-y divide-[var(--color-line)]">
        {members.map((m) => {
          const self = m.userId === currentUserId;
          const editable = manage && !(m.role === "owner" && currentRole !== "owner");
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-sand)] text-[12px] font-bold uppercase text-[var(--color-ink-soft)]">
                {(m.name || m.email).charAt(0)}
              </span>
              <span className="flex min-w-[160px] flex-1 flex-col">
                <span className="text-[13.5px] font-medium text-[var(--color-ink)]">
                  {m.name || m.email}
                  {self ? <span className="ml-1.5 text-[11px] font-normal text-[var(--color-muted)]">(you)</span> : null}
                </span>
                {m.name ? <span className="text-[12px] text-[var(--color-muted)]">{m.email}</span> : null}
              </span>
              {editable && !self ? (
                <div className="w-full sm:w-auto sm:min-w-[300px]">
                  <Segmented
                    label={`Role for ${m.email}`}
                    size="sm"
                    value={m.role}
                    onChange={(next) => memberAction.run(() => setMemberRole(m.userId, next))}
                    options={(currentRole === "owner" ? ["owner", "admin", "member", "viewer"] : ["admin", "member", "viewer"]).map((r) => ({
                      value: r,
                      label: r.charAt(0).toUpperCase() + r.slice(1),
                    }))}
                  />
                </div>
              ) : (
                <span title={ROLE_HINT[m.role]} className="rounded-full border border-[var(--color-line)] px-2.5 py-0.5 text-[11.5px] capitalize text-[var(--color-ink-soft)]">
                  {m.role}
                </span>
              )}
              {(editable && !self) || self ? (
                <button
                  type="button"
                  disabled={memberAction.pending}
                  onClick={() => {
                    if (window.confirm(self ? "Leave this workspace? You'll need a new invite to come back." : `Remove ${m.email} from this workspace?`)) {
                      memberAction.run(() => removeTeamMember(m.userId));
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] text-[var(--color-muted)] transition hover:bg-[var(--color-bad-bg)] hover:text-[var(--color-bad)]"
                >
                  <UserMinus size={13} /> {self ? "Leave" : "Remove"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {memberAction.error ? <p role="alert" className="text-[12.5px] text-[var(--color-bad)]">{memberAction.error}</p> : null}

      {manage ? (
        <form
          className="flex flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const target = email.trim();
            invite.run(
              () => inviteTeammate({ email: target, role }),
              (data) => {
                const result = data as { url: string; emailed: boolean } | undefined;
                if (result) setLastInvite({ ...result, email: target });
                setEmail("");
              },
            );
          }}
        >
          <p className="text-[13px] font-semibold">Invite a teammate</p>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="invite-email">
              Teammate email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="min-w-[220px] flex-1 rounded-full border border-[var(--color-line)] bg-white px-4 py-2 text-[14px] outline-none focus:border-[var(--color-orange)]"
            />
            <Button type="submit" size="sm" disabled={invite.pending || !email.trim()}>
              <Mail size={14} /> {invite.pending ? "Inviting…" : "Send invite"}
            </Button>
          </div>
          <Segmented
            label="Invite role"
            value={role}
            onChange={setRole}
            options={(["admin", "member", "viewer"] as const).map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1), hint: ROLE_HINT[r] }))}
          />
          {invite.error ? <p role="alert" className="text-[12.5px] text-[var(--color-bad)]">{invite.error}</p> : null}
          <AnimatePresence>
            {lastInvite ? (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-ok)]/30 bg-[var(--color-ok-bg)] px-3 py-2 text-[12.5px]"
              >
                <Check size={14} className="text-[var(--color-ok)]" />
                <span className="flex-1">
                  {lastInvite.emailed
                    ? `Invitation emailed to ${lastInvite.email}.`
                    : `Invite created for ${lastInvite.email}. Email isn't configured here — share the link directly.`}
                </span>
                <CopyLink url={lastInvite.url} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </form>
      ) : (
        <p className="text-[12.5px] text-[var(--color-muted)]">Ask a workspace owner or admin to invite teammates.</p>
      )}

      {invites.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-faint)]">Pending invitations</p>
          <ul className="flex flex-col divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
            {invites.map((i) => (
              <li key={i.token} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-[13px]">
                <span className="min-w-[160px] flex-1 font-medium">{i.email}</span>
                <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[11px] capitalize">{i.role}</span>
                <span className="text-[11.5px] text-[var(--color-muted)]">expires {new Date(i.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                <CopyLink url={i.url} />
                {manage ? (
                  <button
                    type="button"
                    onClick={() => memberAction.run(() => revokeTeamInvite(i.token))}
                    className={cn("rounded-full px-2.5 py-1 text-[12px] text-[var(--color-muted)] transition hover:bg-[var(--color-bad-bg)] hover:text-[var(--color-bad)]")}
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceSwitcher({ workspaces, currentId }: { workspaces: Array<{ id: string; name: string; role: string }>; currentId: string }) {
  const action = useAction();
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {workspaces.map((w) => {
          const current = w.id === currentId;
          return (
            <li key={w.id}>
              <button
                type="button"
                disabled={current || action.pending}
                onClick={() => action.run(() => switchWorkspace(w.id))}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                  current ? "border-[var(--color-orange)]/40 bg-[var(--color-lavender)]" : "border-[var(--color-line)] hover:border-[var(--color-line-strong)] hover:bg-[var(--color-paper)]",
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-ink)] text-[12px] font-bold uppercase text-white">{w.name.charAt(0)}</span>
                <span className="flex-1 text-[13.5px] font-medium">{w.name}</span>
                <span className="text-[11.5px] capitalize text-[var(--color-muted)]">{current ? "Current" : w.role}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {action.error ? <p role="alert" className="text-[12.5px] text-[var(--color-bad)]">{action.error}</p> : null}
    </div>
  );
}
