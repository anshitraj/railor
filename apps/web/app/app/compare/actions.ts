"use server";

import { randomBytes } from "node:crypto";
import { getDb, sharedComparisons } from "@railor/database";
import { requireSession } from "../../../lib/auth";

/** Publishes a read-only snapshot of the current comparison at a stable URL. */
export async function shareComparison(providerSlugs: string[]) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };

  const id = randomBytes(8).toString("base64url");
  const db = await getDb();
  await db.insert(sharedComparisons).values({
    id,
    organizationId: session.organization.id,
    title: providerSlugs.join(" vs "),
    providerSlugs,
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { ok: true as const, url: `${base}/compare/${id}` };
}
