"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession, setActiveOrganization } from "../../../lib/auth";
import { TeamError, acceptInvite } from "../../../lib/invites";

export async function acceptInvitation(token: string): Promise<{ ok: false; error: string } | never> {
  const session = await requireSession();
  let organizationId: string;
  try {
    ({ organizationId } = await acceptInvite(z.string().min(10).max(100).parse(token), session.user));
  } catch (error) {
    return { ok: false, error: error instanceof TeamError ? error.message : "Couldn't accept this invitation. Try again." };
  }
  await setActiveOrganization(organizationId);
  redirect("/app");
}
