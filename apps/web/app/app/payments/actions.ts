"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PaymentError,
  archiveBeneficiary,
  cancelPayment,
  createBeneficiary,
  createPayment,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  previewPaymentRoute,
  reconcilePayment,
  rollWebhookSecret,
  sendTestWebhook,
  setWebhookEndpointEnabled,
  submitPayment,
  updateRoutingSettings,
} from "@railor/core";
import { requireSession } from "../../../lib/auth";
import { describePaymentError, paymentDeps } from "../../../lib/payments";

type Result<T = undefined> = { ok: true; data?: T; href?: string } | { ok: false; error: string; code?: string; fields?: Record<string, string> };

async function member(options: { manage?: boolean } = {}) {
  const session = await requireSession();
  if (!session.organization) throw new PaymentError("no_workspace", "Create a workspace first.", 403);
  if (session.role === "viewer") throw new PaymentError("forbidden", "Viewers can see payments but not create or send them.", 403);
  if (options.manage && session.role !== "owner" && session.role !== "admin") throw new PaymentError("forbidden", "Only workspace owners and admins can change this.", 403);
  return { session, org: session.organization.id };
}

async function run<T>(work: () => Promise<{ data?: T; href?: string }>): Promise<Result<T>> {
  try {
    const out = await work();
    revalidatePath("/app/payments", "layout");
    return { ok: true, data: out.data === undefined ? undefined : JSON.parse(JSON.stringify(out.data)), href: out.href };
  } catch (error) {
    const d = describePaymentError(error);
    return { ok: false, error: d.message, code: d.code, fields: d.fields };
  }
}

export async function createBeneficiaryAction(raw: unknown) {
  return run(async () => {
    const who = await member();
    const result = await createBeneficiary(who.org, who.session.user.id, raw);
    return { data: result };
  });
}

export async function archiveBeneficiaryAction(id: string) {
  return run(async () => {
    const who = await member();
    await archiveBeneficiary(who.org, z.string().uuid().parse(id));
    return {};
  });
}

export async function previewRouteAction(raw: unknown) {
  return run(async () => {
    const who = await member();
    return { data: await previewPaymentRoute(who.org, raw, paymentDeps(who.org)) };
  });
}

export async function createPaymentAction(raw: unknown) {
  return run(async () => {
    const who = await member();
    const { payment } = await createPayment(who.org, { userId: who.session.user.id, source: "user", role: who.session.role }, raw, paymentDeps(who.org));
    return { data: { id: payment.id, status: payment.status }, href: `/app/payments/${payment.id}` };
  });
}

export async function submitPaymentAction(id: string) {
  return run(async () => {
    const who = await member();
    const detail = await submitPayment(who.org, { userId: who.session.user.id, source: "user", role: who.session.role }, z.string().uuid().parse(id), paymentDeps(who.org));
    return { data: { status: detail.payment.status } };
  });
}

export async function cancelPaymentAction(id: string) {
  return run(async () => {
    const who = await member();
    await cancelPayment(who.org, { userId: who.session.user.id, source: "user" }, z.string().uuid().parse(id));
    return {};
  });
}

export async function reconcilePaymentAction(id: string) {
  return run(async () => {
    const who = await member();
    // Ownership: reconcile only after confirming the payment belongs to this workspace.
    const { getPaymentDetail } = await import("@railor/core");
    await getPaymentDetail(who.org, z.string().uuid().parse(id));
    return { data: await reconcilePayment(id) };
  });
}

export async function updateRoutingSettingsAction(raw: unknown) {
  return run(async () => {
    const who = await member({ manage: true });
    await updateRoutingSettings(who.org, raw);
    revalidatePath("/app/routing");
    return {};
  });
}

export async function createWebhookEndpointAction(raw: { url: string; mode: "test" | "live"; description?: string }) {
  return run(async () => {
    const who = await member({ manage: true });
    const input = z.object({ url: z.string().max(500), mode: z.enum(["test", "live"]), description: z.string().max(200).optional() }).parse(raw);
    const { endpoint, secret } = await createWebhookEndpoint(who.org, who.session.user.id, input);
    revalidatePath("/app/developers");
    return { data: { id: endpoint.id, secret } };
  });
}

export async function webhookEndpointAction(id: string, action: "enable" | "disable" | "delete" | "roll" | "test") {
  return run(async () => {
    const who = await member({ manage: true });
    const endpointId = z.string().uuid().parse(id);
    let data: unknown;
    if (action === "enable" || action === "disable") await setWebhookEndpointEnabled(who.org, endpointId, action === "enable");
    else if (action === "delete") await deleteWebhookEndpoint(who.org, endpointId);
    else if (action === "roll") data = { secret: (await rollWebhookSecret(who.org, endpointId)).secret };
    else data = await sendTestWebhook(who.org, endpointId);
    revalidatePath("/app/developers");
    return { data };
  });
}
