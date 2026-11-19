"use server";

import { z } from "zod";
import { requireSession } from "../../../lib/auth";
import { removePair, savePair, type SavedPair } from "../../../lib/saved-pairs";
import type { TransferBookmark } from "../../../lib/saved-transfer";

export async function savePricePair(input: TransferBookmark): Promise<{ ok: true; pair: SavedPair } | { ok: false; error: string }> {
  const session = await requireSession();
  if (!session.organization) return { ok: false, error: "Open your dashboard first." };
  const result = await savePair(session.organization.id, session.user.id, input);
  return "error" in result ? { ok: false, error: result.error } : { ok: true, pair: result };
}

export async function removePricePair(id: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  if (!session.organization) return { ok: false };
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false };
  await removePair(session.organization.id, parsed.data);
  return { ok: true };
}
