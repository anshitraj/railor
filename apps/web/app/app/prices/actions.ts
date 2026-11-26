"use server";

import { z } from "zod";
import { requireSession } from "../../../lib/auth";
import { removePair, savePair, type SavedPair } from "../../../lib/saved-pairs";
import type { TransferBookmark } from "../../../lib/saved-transfer";
import { removeRateAlert, setRateAlert, type RateAlertSummary } from "../../../lib/rate-alerts";
import type { AlertFrequency } from "../../../lib/plans";

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

export async function setPriceAlert(savedSearchId: string, frequency: AlertFrequency): Promise<{ ok: true; alert: RateAlertSummary } | { ok: false; error: string }> {
  const session = await requireSession();
  const org = session.organization;
  if (!org) return { ok: false, error: "Open your dashboard first." };
  const id = z.string().uuid().safeParse(savedSearchId);
  if (!id.success) return { ok: false, error: "Save this transfer first." };
  const result = await setRateAlert({ organizationId: org.id, userId: session.user.id, entityCountry: org.entityCountry, building: org.building }, id.data, frequency);
  return result.ok ? { ok: true, alert: result.alert } : result;
}

export async function removePriceAlert(savedSearchId: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  if (!session.organization) return { ok: false };
  const id = z.string().uuid().safeParse(savedSearchId);
  if (!id.success) return { ok: false };
  await removeRateAlert(session.organization.id, session.user.id, id.data);
  return { ok: true };
}
