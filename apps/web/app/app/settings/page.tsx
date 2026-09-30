import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, SectionLabel } from "@railor/ui";
import { getSession } from "../../../lib/auth";
import { getOrgMembers } from "../../../lib/org";
import { WorkspaceNameForm } from "../../../components/app/workspace-name-form";
import { TeamPanel, WorkspaceSwitcher } from "../../../components/app/team-panel";
import { inviteUrl, listPendingInvites, listUserWorkspaces } from "../../../lib/invites";
import { getEntitlement } from "../../../lib/entitlements";

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
    <div className="flex max-w-[720px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-semibold tracking-tight">Settings</h1>
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

      <Card id="team" className="flex scroll-mt-24 flex-col gap-3 p-5">
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

      <Card className="flex flex-col gap-2 p-5">
        <SectionLabel>Elsewhere</SectionLabel>
        <Link href="/app/settings/connections" className="text-[13px] font-medium text-[var(--color-purple)]">
          Provider connections →
        </Link>
        <Link href="/welcome" className="text-[13px] font-medium text-[var(--color-purple)]">
          Redo the onboarding questions →
        </Link>
        <Link href="/app/developers" className="text-[13px] font-medium text-[var(--color-purple)]">
          API keys and usage →
        </Link>
        <Link href="/app/readiness" className="text-[13px] font-medium text-[var(--color-purple)]">
          KYB readiness profile →
        </Link>
      </Card>
    </div>
  );
}
