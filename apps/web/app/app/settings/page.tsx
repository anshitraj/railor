import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Freshness, SectionLabel } from "@railor/ui";
import { getSession } from "../../../lib/auth";
import { getOrgMembers } from "../../../lib/org";
import { WorkspaceNameForm } from "../../../components/app/workspace-name-form";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;

  const members = await getOrgMembers(org.id);

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-semibold tracking-tight">Settings</h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          Workspace identity and who has access.
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <SectionLabel>Workspace name</SectionLabel>
        <WorkspaceNameForm initialName={org.name} />
        <p className="text-[12px] text-[var(--color-faint)]">
          Slug: {org.slug} · Created {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : "—"}
        </p>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <SectionLabel>Members</SectionLabel>
        <ul className="flex flex-col divide-y divide-[var(--color-line)]">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className="flex min-w-[180px] flex-1 flex-col">
                <span className="text-[13.5px] font-medium text-[var(--color-ink)]">
                  {m.name || m.email}
                  {m.userId === session.user.id ? (
                    <span className="ml-1.5 text-[11px] font-normal text-[var(--color-muted)]">(you)</span>
                  ) : null}
                </span>
                {m.name ? <span className="text-[12px] text-[var(--color-muted)]">{m.email}</span> : null}
              </span>
              <span className="rounded-full border border-[var(--color-line)] px-2.5 py-0.5 text-[11.5px] text-[var(--color-ink-soft)]">
                {ROLE_LABEL[m.role] ?? m.role}
              </span>
              <Freshness date={m.joinedAt} prefix="Joined" />
            </li>
          ))}
        </ul>
      </Card>

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
