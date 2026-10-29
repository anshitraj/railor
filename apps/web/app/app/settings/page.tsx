import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, SectionLabel } from "@railor/ui";
import { getSession } from "../../../lib/auth";
import { getOrgMembers } from "../../../lib/org";
import { WorkspaceNameForm } from "../../../components/app/workspace-name-form";
import { TeamPanel, WorkspaceSwitcher } from "../../../components/app/team-panel";
import { inviteUrl, listPendingInvites, listUserWorkspaces } from "../../../lib/invites";
import { getEntitlement } from "../../../lib/entitlements";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;

  const [members, entitlement, invites, workspaces] = await Promise.all([
    getOrgMembers(org.id),
    getEntitlement(org.id),
    listPendingInvites(org.id),
    listUserWorkspaces(session.user.id),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="workspace-heading flex flex-col gap-1 lg:col-span-2">
        <span className="product-eyebrow">Your workspace</span>
        <h1 className="font-semibold tracking-tight">Settings</h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          Workspace identity, your team and who has access.
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <SectionLabel>Plan and access</SectionLabel>
        <p className="text-lg font-semibold">{entitlement.plan === "founding" ? "Founding" : "Free"}</p>
        <p className="text-sm text-[var(--color-muted)]">{entitlement.limits.savedCorridors} saved corridors · {entitlement.limits.monitors} monitors · {entitlement.limits.apiRequests.toLocaleString()} API requests / month</p>
        {entitlement.validUntil && <p className="text-sm">{entitlement.status === "expired" ? "Expired" : "Valid until"}: {entitlement.validUntil.toLocaleDateString("en-GB")}</p>}
        <Link href="/app/upgrade" className="text-sm font-medium underline">View Founding access →</Link>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <SectionLabel>Workspace name</SectionLabel>
        {session.role === "owner" || session.role === "admin" ? (
          <WorkspaceNameForm initialName={org.name} />
        ) : (
          <p className="text-[15px] font-medium">{org.name}</p>
        )}
        <p className="text-[12px] text-[var(--color-faint)]">
          Slug: {org.slug} · Created {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : "—"}
        </p>
      </Card>

      <Card id="team" className="flex scroll-mt-24 flex-col gap-3 p-5 lg:col-span-2">
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>Team</SectionLabel>
          <span className="text-[12px] text-[var(--color-muted)]">{members.length} {members.length === 1 ? "member" : "members"}</span>
        </div>
        <TeamPanel
          members={members.map((m) => ({ userId: m.userId, email: m.email, name: m.name, role: m.role, joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : null }))}
          invites={invites.map((i) => ({ token: i.token, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString(), url: inviteUrl(i.token) }))}
          currentUserId={session.user.id}
          currentRole={session.role}
        />
      </Card>

      {workspaces.length > 1 ? (
        <Card className="flex flex-col gap-3 p-5">
          <SectionLabel>Your workspaces</SectionLabel>
          <WorkspaceSwitcher workspaces={workspaces} currentId={org.id} />
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3 p-5">
        <SectionLabel>More workspace tools</SectionLabel>
        <details className="space-y-3"><summary className="cursor-pointer text-sm font-semibold">Company rules & team reviews</summary><p className="text-xs leading-relaxed text-[var(--color-muted)]">Optional for teams. Compare providers first, then add the controls your company needs.</p>{[
          ["Company rules", "Set limits and requirements for your team.", "/app/policies"],
          ["Rule checks", "See recorded results of checking a route against your rules.", "/app/decisions"],
          ["Team reviews", "Review checks that need another person’s sign-off.", "/app/approvals"],
          ["Routing preferences", "Choose ranking and fallback preferences.", "/app/routing"],
        ].map(([label, hint, href]) => <Link key={href} href={href!} className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] p-3 text-xs"><span className="flex-1"><strong className="block">{label}</strong><span className="mt-1 block text-[var(--color-muted)]">{hint}</span></span><ArrowRight size={13} /></Link>)}</details>
        <details className="space-y-3 border-t border-[var(--color-line)] pt-3"><summary className="cursor-pointer text-sm font-semibold">Monitoring & research</summary>{[["Watch routes and providers", "/app/monitoring"], ["Market changes", "/app/changes"], ["Source evidence", "/app/evidence"], ["Review discoveries", "/app/discovery"]].map(([label, href]) => <Link key={href} href={href!} className="block text-xs text-[var(--color-muted)]">{label} →</Link>)}</details>
        <details className="space-y-3 border-t border-[var(--color-line)] pt-3"><summary className="cursor-pointer text-sm font-semibold">Connections & workspace setup</summary>
        <Link href="/app/settings/connections" className="text-[13px] font-medium text-[var(--color-purple)]">
          Provider connections →
        </Link>
        <Link href="/welcome" className="text-[13px] font-medium text-[var(--color-purple)]">
          Redo the onboarding questions →
        </Link>
        <Link href="/app/developers" className="text-[13px] font-medium text-[var(--color-purple)]">
          API keys and usage →
        </Link>
        </details>
      </Card>
    </div>
  );
}
