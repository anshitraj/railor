import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { auditLogs, getDb, invites, organizationMembers, organizations, users } from "@railor/database";
import { appOrigin } from "./security";
import { sendMail } from "./mail";

export const INVITE_ROLES = ["admin", "member", "viewer"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];
export const MEMBER_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

const INVITE_DAYS = 7;

export class TeamError extends Error {}

const canManage = (role: string | null | undefined) => role === "owner" || role === "admin";

async function audit(organizationId: string, actorId: string, action: string, target: string, metadata: Record<string, unknown> = {}) {
  const db = await getDb();
  await db.insert(auditLogs).values({ organizationId, actorId, action, target, metadata });
}

export function inviteUrl(token: string) {
  return `${appOrigin()}/invite/${token}`;
}

/**
 * Creates (or re-issues) an invite. Invites are bound to one email address:
 * whoever accepts must be signed in as that address, so a forwarded link
 * can't be used to join the workspace as someone else.
 */
export async function createInvite(options: {
  organizationId: string;
  organizationName: string;
  actorId: string;
  actorRole: string | null;
  actorEmail: string;
  email: string;
  role: InviteRole;
}) {
  if (!canManage(options.actorRole)) throw new TeamError("Only owners and admins can invite people.");
  if (!INVITE_ROLES.includes(options.role)) throw new TeamError("Unknown role.");
  const email = options.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TeamError("That doesn't look like an email address.");

  const db = await getDb();
  const [existingMember] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(and(eq(organizationMembers.organizationId, options.organizationId), eq(users.email, email)))
    .limit(1);
  if (existingMember) throw new TeamError(`${email} is already a member of this workspace.`);

  // Re-inviting replaces any pending invite for the same address rather than stacking live links.
  await db
    .delete(invites)
    .where(and(eq(invites.organizationId, options.organizationId), eq(invites.email, email), isNull(invites.acceptedAt)));

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await db.insert(invites).values({
    token,
    organizationId: options.organizationId,
    email,
    role: options.role,
    invitedBy: options.actorId,
    expiresAt,
  });
  await audit(options.organizationId, options.actorId, "invite.created", email, { role: options.role });

  const url = inviteUrl(token);
  const mail = await sendMail({
    to: email,
    subject: `Join ${options.organizationName} on Railor`,
    text: `${options.actorEmail} invited you to the ${options.organizationName} workspace on Railor as ${options.role}.\n\nAccept: ${url}\n\nThis invitation expires in ${INVITE_DAYS} days.`,
    html: `<p>${escapeHtml(options.actorEmail)} invited you to the <strong>${escapeHtml(options.organizationName)}</strong> workspace on Railor as ${options.role}.</p><p><a href="${url}">Accept the invitation</a></p><p>This invitation expires in ${INVITE_DAYS} days.</p>`,
  });
  return { token, url, emailed: mail.sent, expiresAt };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function listPendingInvites(organizationId: string) {
  const db = await getDb();
  return db
    .select({ token: invites.token, email: invites.email, role: invites.role, expiresAt: invites.expiresAt, createdAt: invites.createdAt })
    .from(invites)
    .where(and(eq(invites.organizationId, organizationId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .orderBy(invites.createdAt);
}

export async function revokeInvite(organizationId: string, actorId: string, actorRole: string | null, token: string) {
  if (!canManage(actorRole)) throw new TeamError("Only owners and admins can revoke invitations.");
  const db = await getDb();
  const [removed] = await db
    .delete(invites)
    .where(and(eq(invites.organizationId, organizationId), eq(invites.token, token), isNull(invites.acceptedAt)))
    .returning({ email: invites.email });
  if (removed) await audit(organizationId, actorId, "invite.revoked", removed.email);
}

/** Public-safe view of an invite for the landing page at /invite/:token. */
export async function loadInvite(token: string) {
  const db = await getDb();
  const [row] = await db
    .select({ invite: invites, organizationName: organizations.name, inviterEmail: users.email })
    .from(invites)
    .innerJoin(organizations, eq(invites.organizationId, organizations.id))
    .leftJoin(users, eq(invites.invitedBy, users.id))
    .where(eq(invites.token, token))
    .limit(1);
  if (!row) return null;
  const state = row.invite.acceptedAt ? "accepted" : row.invite.expiresAt.getTime() <= Date.now() ? "expired" : "pending";
  return {
    token: row.invite.token,
    organizationId: row.invite.organizationId,
    organizationName: row.organizationName,
    inviterEmail: row.inviterEmail,
    email: row.invite.email,
    role: row.invite.role,
    expiresAt: row.invite.expiresAt,
    state: state as "accepted" | "expired" | "pending",
  };
}

/** Joins the invited workspace. Single use; the signed-in address must match the invited one. */
export async function acceptInvite(token: string, user: { id: string; email: string }) {
  const db = await getDb();
  const invite = await loadInvite(token);
  if (!invite || invite.state !== "pending") throw new TeamError("This invitation is no longer valid.");
  if (invite.email !== user.email.trim().toLowerCase()) {
    throw new TeamError(`This invitation is for ${invite.email}. Sign in with that address to accept it.`);
  }
  const [claimed] = await db
    .update(invites)
    .set({ acceptedAt: new Date() })
    .where(and(eq(invites.token, token), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .returning();
  if (!claimed) throw new TeamError("This invitation is no longer valid.");
  await db
    .insert(organizationMembers)
    .values({ organizationId: claimed.organizationId, userId: user.id, role: claimed.role })
    .onConflictDoNothing();
  await audit(claimed.organizationId, user.id, "invite.accepted", claimed.email, { role: claimed.role });
  return { organizationId: claimed.organizationId };
}

async function ownerCount(organizationId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, "owner")));
  return row?.n ?? 0;
}

async function memberRole(organizationId: string, userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function changeMemberRole(options: {
  organizationId: string;
  actorId: string;
  actorRole: string | null;
  userId: string;
  role: MemberRole;
}) {
  if (!canManage(options.actorRole)) throw new TeamError("Only owners and admins can change roles.");
  if (!MEMBER_ROLES.includes(options.role)) throw new TeamError("Unknown role.");
  const current = await memberRole(options.organizationId, options.userId);
  if (!current) throw new TeamError("That person isn't in this workspace.");
  // Only an owner can create or demote an owner.
  if ((current === "owner" || options.role === "owner") && options.actorRole !== "owner") {
    throw new TeamError("Only an owner can change ownership.");
  }
  if (current === "owner" && options.role !== "owner" && (await ownerCount(options.organizationId)) <= 1) {
    throw new TeamError("A workspace needs at least one owner. Make someone else an owner first.");
  }
  const db = await getDb();
  await db
    .update(organizationMembers)
    .set({ role: options.role })
    .where(and(eq(organizationMembers.organizationId, options.organizationId), eq(organizationMembers.userId, options.userId)));
  await audit(options.organizationId, options.actorId, "member.role_changed", options.userId, { from: current, to: options.role });
}

export async function removeMember(options: {
  organizationId: string;
  actorId: string;
  actorRole: string | null;
  userId: string;
}) {
  const leaving = options.userId === options.actorId;
  if (!leaving && !canManage(options.actorRole)) throw new TeamError("Only owners and admins can remove people.");
  const current = await memberRole(options.organizationId, options.userId);
  if (!current) return;
  if (current === "owner" && !leaving && options.actorRole !== "owner") throw new TeamError("Only an owner can remove an owner.");
  if (current === "owner" && (await ownerCount(options.organizationId)) <= 1) {
    throw new TeamError("A workspace needs at least one owner. Transfer ownership before leaving.");
  }
  const db = await getDb();
  await db
    .delete(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, options.organizationId), eq(organizationMembers.userId, options.userId)));
  await audit(options.organizationId, options.actorId, leaving ? "member.left" : "member.removed", options.userId);
}

/** Every workspace this user belongs to — powers the workspace switcher. */
export async function listUserWorkspaces(userId: string) {
  const db = await getDb();
  return db
    .select({ id: organizations.id, name: organizations.name, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(organizations.name);
}
