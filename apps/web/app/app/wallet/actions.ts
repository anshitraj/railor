"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth";
import { WalletInputError, addTestTopUp, redeemPromo, saveAutoReload } from "../../../lib/wallet";
import type { AutoReloadPreference } from "../../../lib/wallet-options";

type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/** Billing changes need an owner or admin; any non-viewer may redeem a code. */
async function member(manage: boolean) {
  const session = await requireSession();
  if (!session.organization) throw new WalletInputError("Open a workspace first.");
  const allowed = manage ? session.role === "owner" || session.role === "admin" : session.role !== "viewer";
  if (!allowed) throw new WalletInputError(manage ? "Only owners and admins can change billing." : "Viewers can’t change the wallet.");
  return { organizationId: session.organization.id, userId: session.user.id };
}

async function guarded<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    const result = await work();
    // The sidebar pill lives in the app layout.
    revalidatePath("/app", "layout");
    return result;
  } catch (error) {
    if (error instanceof WalletInputError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export async function redeemPromoAction(code: string): Promise<Result<{ amountCents: number }>> {
  return guarded(async () => {
    const { organizationId, userId } = await member(false);
    const trimmed = String(code ?? "").slice(0, 64);
    if (!trimmed.trim()) return { ok: false, error: "Enter a code first." };
    const result = await redeemPromo(organizationId, userId, trimmed);
    return result.ok ? { ok: true, message: result.message, data: { amountCents: result.amountCents } } : { ok: false, error: result.message };
  });
}

export async function saveAutoReloadAction(input: AutoReloadPreference): Promise<Result<AutoReloadPreference>> {
  return guarded(async () => {
    const { organizationId, userId } = await member(true);
    const data = await saveAutoReload(organizationId, userId, {
      enabled: input?.enabled === true,
      thresholdCents: Number(input?.thresholdCents),
      amountCents: Number(input?.amountCents),
    });
    return { ok: true, data };
  });
}

export async function addTestTopUpAction(amountCents: number, requestId: string): Promise<Result> {
  return guarded(async () => {
    const { organizationId, userId } = await member(true);
    await addTestTopUp(organizationId, userId, Number(amountCents), String(requestId ?? ""));
    return { ok: true };
  });
}
