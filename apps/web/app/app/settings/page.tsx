import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight, BellRing, Building2, Clock, KeyRound, LogOut, Mail, PlugZap, RotateCcw, ShieldCheck, Sparkles, Users } from "lucide-react";
import { getSession } from "../../../lib/auth";
import { getOrgMembers } from "../../../lib/org";
import { WorkspaceNameForm } from "../../../components/app/workspace-name-form";
import { TeamPanel, WorkspaceSwitcher } from "../../../components/app/team-panel";
import { UserAvatar } from "../../../components/app/user-avatar";
import { ProfileNameForm, SettingsNav } from "../../../components/app/settings/settings-sections";
import { ConnectionsGrid } from "../../../components/app/settings/connections-grid";
import { inviteUrl, listPendingInvites, listUserWorkspaces } from "../../../lib/invites";
import { getEntitlement } from "../../../lib/entitlements";
import { isCompanyWorkspace } from "../../../lib/workspace-profile";
import styles from "../../../components/app/settings/settings.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

const PROFILE_LABEL: Record<string, string> = { personal: "Personal", freelancer: "Freelancer", freelancer_business: "Freelancer" };
const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</div>
      <div className={styles.rowValue}>{children}</div>
    </div>
  );
}

function LinkRow({ href, icon: Icon, label, hint, external }: { href: string; icon: React.ComponentType<{ size?: number }>; label: string; hint: string; external?: boolean }) {
  return (
    <Link href={href} className={styles.linkRow} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      <span className={styles.linkIcon}><Icon size={16} /></span>
      <span className={styles.linkText}><strong>{label}</strong><small>{hint}</small></span>
      {external ? <ArrowUpRight size={15} aria-hidden /> : <ArrowRight size={15} aria-hidden />}
    </Link>
  );
}

/**
 * Settings, the way most apps do it: who you are, the dashboard you're in,
 * your team, your plan, what we email you, developer access and signing out.
 * Every row does something real; anything not built yet says so.
 */
export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;
  const user = session.user;
  const canManage = session.role === "owner" || session.role === "admin";
  const company = isCompanyWorkspace(org.building);

  const [members, entitlement, invites, workspaces] = await Promise.all([
    getOrgMembers(org.id),
    getEntitlement(org.id),
    listPendingInvites(org.id),
    listUserWorkspaces(user.id),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Settings</h1>
        <p>Your profile, your dashboard and who can use it.</p>
      </header>

      <div className={styles.layout}>
        <SettingsNav />

        <div className={styles.sections}>
          <section id="profile" className={styles.section} aria-labelledby="profile-title">
            <h2 id="profile-title">Profile</h2>
            <div className={styles.profile}>
              <UserAvatar src={user.avatarUrl} name={user.name} email={user.email} size={72} />
              <div className={styles.profileText}>
                <strong>{user.name ?? user.email.split("@")[0]}</strong>
                <span>{user.email}</span>
                <small>{user.avatarUrl ? "Photo from the Google or GitHub account you sign in with." : "Sign in with Google to use your Google photo here."}</small>
              </div>
            </div>
            <Row label="Name" hint="Shown to your team and on your dashboard."><ProfileNameForm initialName={user.name ?? ""} /></Row>
            <Row label="Email" hint="Your sign-in address. It can’t be changed here."><span className={styles.mono}>{user.email}</span></Row>
          </section>

          <section id="dashboard" className={styles.section} aria-labelledby="dashboard-title">
            <h2 id="dashboard-title">Dashboard</h2>
            <Row label="Name" hint={canManage ? "Owners and admins can rename it." : "Only owners and admins can rename it."}>
              {canManage ? <WorkspaceNameForm initialName={org.name} /> : <span>{org.name}</span>}
            </Row>
            <Row label="Type" hint="Company turns on rules, team reviews, payment audit and payroll.">
              <span className={styles.value}>
                <span className={styles.badge}><Building2 size={13} aria-hidden />{company ? "Company" : PROFILE_LABEL[org.building ?? ""] ?? "Personal"}</span>
                <Link href="/welcome" className={styles.textLink}><RotateCcw size={13} aria-hidden />Change</Link>
              </span>
            </Row>
            <Row label="Your role"><span className={styles.badge}><ShieldCheck size={13} aria-hidden />{ROLE_LABEL[session.role ?? ""] ?? "Member"}</span></Row>
            <Row label="Created"><span>{org.createdAt ? new Date(org.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span></Row>
            {workspaces.length > 1 ? <Row label="Switch" hint="You belong to more than one."><WorkspaceSwitcher workspaces={workspaces} currentId={org.id} /></Row> : null}
          </section>

          <section id="team" className={styles.section} aria-labelledby="team-title">
            <div className={styles.sectionHead}><h2 id="team-title">Team</h2><span><Users size={14} aria-hidden />{members.length} {members.length === 1 ? "member" : "members"}</span></div>
            <TeamPanel
              members={members.map((m) => ({ userId: m.userId, email: m.email, name: m.name, role: m.role, joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : null }))}
              invites={invites.map((i) => ({ token: i.token, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString(), url: inviteUrl(i.token) }))}
              currentUserId={user.id}
              currentRole={session.role}
            />
          </section>

          <section id="plan" className={styles.section} aria-labelledby="plan-title">
            <h2 id="plan-title">Plan</h2>
            <div className={styles.plan}>
              <div>
                <span className={styles.planName}><Sparkles size={15} aria-hidden />{entitlement.plan === "founding" ? "Founding" : "Free"}</span>
                {entitlement.validUntil ? <small>{entitlement.status === "expired" ? "Expired" : "Valid until"} {entitlement.validUntil.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</small> : null}
              </div>
              <Link href="/app/upgrade" className={styles.button}>See Founding access</Link>
            </div>
            <ul className={styles.limits}>
              <li><strong>{entitlement.limits.savedCorridors}</strong><span>saved routes</span></li>
              <li><strong>{entitlement.limits.monitors}</strong><span>monitors</span></li>
              <li><strong>{entitlement.limits.apiRequests.toLocaleString("en-US")}</strong><span>API requests a month</span></li>
            </ul>
          </section>

          <section id="notifications" className={styles.section} aria-labelledby="notifications-title">
            <h2 id="notifications-title">Notifications</h2>
            <Row label="Sign-in links" hint="Always on. They’re how you sign in by email."><span className={styles.badge} data-tone="on"><Mail size={13} aria-hidden />Email</span></Row>
            <Row label="Route changes" hint="Email when a provider or route you watch changes.">
              <Link href="/app/monitoring" className={styles.textLink}><BellRing size={13} aria-hidden />Choose what to watch</Link>
            </Row>
            <Row label="Price reminders" hint="A reminder when a saved pair reaches your rate."><span className={styles.badge} data-tone="soon"><Clock size={13} aria-hidden />Coming soon</span></Row>
          </section>

          <section id="connections" className={styles.section} aria-labelledby="connections-title">
            <div className={styles.sectionHead}><h2 id="connections-title">Connections</h2><span className={styles.badge} data-tone="soon"><Clock size={13} aria-hidden />Coming soon</span></div>
            <p className={styles.sectionNote}>Connect the accounts you already use to see your own balances and exact quotes next to every comparison. Signing in with these is on the way.</p>
            <ConnectionsGrid />
          </section>

          <section id="developers" className={styles.section} aria-labelledby="developers-title">
            <h2 id="developers-title">Developers</h2>
            <div className={styles.links}>
              <LinkRow href="/app/developers" icon={KeyRound} label="API keys and usage" hint="One key for the API and AI tools." />
              <LinkRow href="/app/settings/connections" icon={PlugZap} label="Provider accounts" hint="Connect accounts for your own exact quotes." />
              {company ? <LinkRow href="/app/policies" icon={ShieldCheck} label="Company rules" hint="Limits and requirements for your team." /> : null}
            </div>
          </section>

          <section id="account" className={styles.section} aria-labelledby="account-title">
            <h2 id="account-title">Account</h2>
            <Row label="Sign out" hint="Signs you out on this device.">
              <form action="/api/auth/signout" method="post"><button type="submit" className={styles.buttonGhost}><LogOut size={14} aria-hidden />Sign out</button></form>
            </Row>
            <Row label="Privacy" hint="What Railor keeps and why."><Link href="/legal/privacy" className={styles.textLink}>Read the privacy policy</Link></Row>
          </section>
        </div>
      </div>
    </div>
  );
}
