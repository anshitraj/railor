"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, setActiveOrganization } from "../../../lib/auth";
import { renameOrganization } from "../../../lib/org";
import {
  INVITE_ROLES,
  MEMBER_ROLES,
  TeamError,
  changeMemberRole,
  createInvite,
  listUserWorkspaces,
  removeMember,
  revokeInvite,
} from "../../../lib/invites";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guarded<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await work();
    revalidatePath("/app/settings");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof TeamError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: "That input isn't valid." };
    console.error(error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export async function updateWorkspaceName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120) return { ok: false as const };
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  // Renaming is an admin action — the check lives here, never only in the UI.
  if (session.role !== "owner" && session.role !== "admin") return { ok: false as const };
  await renameOrganization(session.organization.id, trimmed);
  revalidatePath("/app/settings");
  revalidatePath("/app");
  return { ok: true as const };
}

export async function inviteTeammate(input: { email: string; role: string }) {
  return guarded(async () => {
    const parsed = z.object({ email: z.string().trim().email().max(320), role: z.enum(INVITE_ROLES) }).parse(input);
    const session = await requireSession();
    if (!session.organization) throw new TeamError("Create a workspace first.");
    const invite = await createInvite({
      organizationId: session.organization.id,
      organizationName: session.organization.name,
      actorId: session.user.id,
      actorRole: session.role,
      actorEmail: session.user.email,
      email: parsed.email,
      role: parsed.role,
    });
    return { url: invite.url, emailed: invite.emailed };
  });
}

export async function revokeTeamInvite(token: string) {
  return guarded(async () => {
    const session = await requireSession();
    if (!session.organization) throw new TeamError("Create a workspace first.");
    await revokeInvite(session.organization.id, session.user.id, session.role, z.string().min(10).max(100).parse(token));
  });
}

export async function setMemberRole(userId: string, role: string) {
  return guarded(async () => {
    const session = await requireSession();
    if (!session.organization) throw new TeamError("Create a workspace first.");
    await changeMemberRole({
      organizationId: session.organization.id,
      actorId: session.user.id,
      actorRole: session.role,
      userId: z.string().uuid().parse(userId),
      role: z.enum(MEMBER_ROLES).parse(role),
    });
  });
}

export async function removeTeamMember(userId: string) {
  return guarded(async () => {
    const session = await requireSession();
    if (!session.organization) throw new TeamError("Create a workspace first.");
    await removeMember({
      organizationId: session.organization.id,
      actorId: session.user.id,
      actorRole: session.role,
      userId: z.string().uuid().parse(userId),
    });
  });
}

export async function switchWorkspace(organizationId: string) {
  return guarded(async () => {
    const session = await requireSession();
    const id = z.string().uuid().parse(organizationId);
    const workspaces = await listUserWorkspaces(session.user.id);
    if (!workspaces.some((w) => w.id === id)) throw new TeamError("You're not a member of that workspace.");
    await setActiveOrganization(id);
    revalidatePath("/app", "layout");
  });
}
