"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditLogs, getDb } from "@railor/database";
import { getPlatformPaymentFlags, reconcilePayment, resolveUnknownPayment, setOrgLiveAccess, setPlatformSetting } from "@railor/core";
import { requireSession } from "../../lib/auth";

/**
 * Operator controls over money movement. Every one is server-side
 * admin-checked and written to the audit log with who, what and why.
 */
async function requireAdmin() {
  const session = await requireSession();
  if (!session.user.isAdmin) throw new Error("FORBIDDEN");
  return session;
}

async function audit(actorId: string, action: string, target: string | null, metadata: Record<string, unknown>, organizationId: string | null = null) {
  const db = await getDb();
  await db.insert(auditLogs).values({ actorId, action, target, metadata, organizationId });
}

type Result = { ok: true } | { ok: false; error: string };

async function guarded(work: () => Promise<void>): Promise<Result> {
  try {
    await work();
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid input." : error instanceof Error ? error.message : "Action failed." };
  }
}

export async function setPaymentsPausedAction(paused: boolean, reason: string) {
  return guarded(async () => {
    const session = await requireAdmin();
    const note = z.string().trim().max(200).parse(reason);
    if (paused && !note) throw new Error("Give a reason — every workspace sees it.");
    await setPlatformSetting("payments.paused", { paused, reason: paused ? note : null, at: new Date().toISOString() }, session.user.id);
    await audit(session.user.id, paused ? "payments.paused" : "payments.resumed", null, { reason: note });
  });
}

export async function setProviderLiveAction(slug: string, approved: boolean, note: string) {
  return guarded(async () => {
    const session = await requireAdmin();
    const provider = z.string().regex(/^[a-z0-9-]{1,100}$/).parse(slug);
    const reason = z.string().trim().max(300).parse(note);
    if (approved && reason.length < 10) throw new Error("Record what sandbox evidence justified approving live payouts (10+ characters).");
    const flags = await getPlatformPaymentFlags();
    const next = approved ? [...new Set([...flags.liveProviders, provider])] : flags.liveProviders.filter((p) => p !== provider);
    await setPlatformSetting("payments.live_providers", next, session.user.id);
    await audit(session.user.id, approved ? "provider.live_approved" : "provider.live_revoked", provider, { note: reason });
  });
}

export async function setOrgLiveAction(organizationId: string, input: { liveEnabled: boolean; maxPaymentAmount: number | null; dailyPaymentAmount: number | null; note: string }) {
  return guarded(async () => {
    const session = await requireAdmin();
    const org = z.string().uuid().parse(organizationId);
    const parsed = z
      .object({
        liveEnabled: z.boolean(),
        maxPaymentAmount: z.number().positive().nullable(),
        dailyPaymentAmount: z.number().positive().nullable(),
        note: z.string().trim().max(500),
      })
      .parse(input);
    if (parsed.liveEnabled && (parsed.maxPaymentAmount === null || parsed.dailyPaymentAmount === null)) {
      throw new Error("Set both a per-payment and a daily limit before enabling live payments.");
    }
    if (parsed.liveEnabled && parsed.note.length < 10) throw new Error("Record the review behind enabling live payments (10+ characters).");
    await setOrgLiveAccess(org, session.user.id, parsed);
    await audit(session.user.id, parsed.liveEnabled ? "org.live_enabled" : "org.live_disabled", org, parsed, org);
  });
}

export async function resolveUnknownAction(paymentId: string, outcome: "completed" | "failed", note: string) {
  return guarded(async () => {
    const session = await requireAdmin();
    const id = z.string().uuid().parse(paymentId);
    const reason = z.string().trim().min(10, "Explain what the provider dashboard showed (10+ characters).").max(500).parse(note);
    await resolveUnknownPayment(id, session.user.id, z.enum(["completed", "failed"]).parse(outcome), reason);
    await audit(session.user.id, "payment.resolved_by_operator", id, { outcome, note: reason });
  });
}

export async function adminReconcileAction(paymentId: string) {
  return guarded(async () => {
    const session = await requireAdmin();
    const id = z.string().uuid().parse(paymentId);
    const result = await reconcilePayment(id);
    await audit(session.user.id, "payment.reconciled_by_operator", id, { outcome: result.outcome });
  });
}
