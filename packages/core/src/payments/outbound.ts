import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { getDb, webhookDeliveries, webhookEndpoints } from "@railor/database";
import { isPrivateAddress, resolvesPrivately } from "../net-guard.js";
import { decryptJson, encryptJson } from "../secrets.js";
import { PaymentError, type PaymentMode } from "./types.js";

/**
 * Outbound webhooks: Railor → the customer's own endpoint.
 *
 *   Railor-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *
 * Deliveries are rows first, HTTP second: an event is persisted for every
 * matching endpoint, then attempted; failures back off (1m → 24h) for up to
 * 8 attempts. A slow or dead endpoint can never block a payment.
 */
export const WEBHOOK_EVENT_TYPES = [
  "payment.created",
  "payment.requires_approval",
  "payment.ready",
  "payment.blocked",
  "payment.submitted",
  "payment.awaiting_funds",
  "payment.processing",
  "payment.completed",
  "payment.failed",
  "payment.returned",
  "payment.cancelled",
  "payment.unknown",
] as const;

const BACKOFF_MINUTES = [1, 5, 30, 120, 360, 720, 1440];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;

export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Reference verifier — the same check a customer implements; used by tests and the docs. */
export function verifyWebhookSignature(secret: string, header: string, body: string, toleranceSeconds = 300, now = Date.now()): boolean {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return expected.length === parts.v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

/** Production endpoints must be public HTTPS; development may target localhost for testing. */
export function validateWebhookUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new PaymentError("invalid_webhook_url", "Enter a full URL, e.g. https://api.example.com/railor/webhooks.");
  }
  if (url.username || url.password) throw new PaymentError("invalid_webhook_url", "Webhook URLs cannot contain credentials.");
  const production = process.env.NODE_ENV === "production";
  if (production && url.protocol !== "https:") throw new PaymentError("invalid_webhook_url", "Webhook URLs must use HTTPS.");
  if (!["https:", "http:"].includes(url.protocol)) throw new PaymentError("invalid_webhook_url", "Webhook URLs must use HTTP(S).");
  if (production && isPrivateAddress(url.hostname)) throw new PaymentError("invalid_webhook_url", "Webhook URLs must be publicly reachable.");
  return url.toString();
}

export async function createWebhookEndpoint(
  organizationId: string,
  userId: string | null,
  input: { url: string; mode: PaymentMode; description?: string; events?: string[] },
) {
  const url = validateWebhookUrl(input.url);
  const events = input.events?.length ? input.events : ["payment.*"];
  for (const e of events) {
    if (e !== "payment.*" && !(WEBHOOK_EVENT_TYPES as readonly string[]).includes(e)) throw new PaymentError("invalid_event", `Unknown event type: ${e}`);
  }
  const db = await getDb();
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.organizationId, organizationId))) as [{ n: number }];
  if (n >= 10) throw new PaymentError("endpoint_limit", "A workspace can have at most 10 webhook endpoints.");
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(webhookEndpoints)
    .values({
      organizationId,
      url,
      mode: input.mode,
      description: input.description?.slice(0, 200),
      events,
      encryptedSecret: encryptJson({ secret }),
      secretHint: `${secret.slice(0, 10)}…${secret.slice(-4)}`,
      createdBy: userId,
    })
    .returning();
  return { endpoint: row!, secret };
}

export async function rollWebhookSecret(organizationId: string, id: string) {
  const db = await getDb();
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .update(webhookEndpoints)
    .set({ encryptedSecret: encryptJson({ secret }), secretHint: `${secret.slice(0, 10)}…${secret.slice(-4)}` })
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, organizationId)))
    .returning();
  if (!row) throw new PaymentError("not_found", "Webhook endpoint not found.", 404);
  return { endpoint: row, secret };
}

export async function listWebhookEndpoints(organizationId: string) {
  const db = await getDb();
  return db.select().from(webhookEndpoints).where(eq(webhookEndpoints.organizationId, organizationId)).orderBy(asc(webhookEndpoints.createdAt));
}

export async function setWebhookEndpointEnabled(organizationId: string, id: string, enabled: boolean) {
  const db = await getDb();
  await db
    .update(webhookEndpoints)
    .set({ enabled, disabledReason: enabled ? null : "Disabled by a workspace member." })
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, organizationId)));
}

export async function deleteWebhookEndpoint(organizationId: string, id: string) {
  const db = await getDb();
  await db.delete(webhookEndpoints).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, organizationId)));
}

export async function listWebhookDeliveries(organizationId: string, limit = 30) {
  const db = await getDb();
  return db
    .select({ delivery: webhookDeliveries, url: webhookEndpoints.url })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
    .where(eq(webhookDeliveries.organizationId, organizationId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

function matches(events: string[], type: string) {
  return events.some((e) => e === type || (e.endsWith(".*") && type.startsWith(e.slice(0, -1))));
}

/** Persists one delivery per matching enabled endpoint. Returns how many were queued. */
export async function enqueueWebhookEvent(organizationId: string, mode: PaymentMode, type: string, data: Record<string, unknown>) {
  const db = await getDb();
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.organizationId, organizationId), eq(webhookEndpoints.mode, mode), eq(webhookEndpoints.enabled, true)));
  const targets = endpoints.filter((e) => matches(e.events, type));
  if (!targets.length) return 0;
  const eventId = randomUUID();
  const payload = { id: `evt_${eventId.replaceAll("-", "")}`, object: "event", type, livemode: mode === "live", created: Math.floor(Date.now() / 1000), data: { object: data } };
  await db.insert(webhookDeliveries).values(targets.map((t) => ({ endpointId: t.id, organizationId, eventId, eventType: type, payload })));
  return targets.length;
}

/** Attempts every due delivery (optionally for one org). Safe to call from a cron and inline after events. */
export async function deliverDueWebhooks(options: { organizationId?: string; limit?: number; fetcher?: typeof fetch } = {}) {
  const db = await getDb();
  const due = await db
    .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
    .where(
      and(
        eq(webhookDeliveries.status, "pending"),
        lte(webhookDeliveries.nextAttemptAt, new Date()),
        options.organizationId ? eq(webhookDeliveries.organizationId, options.organizationId) : sql`true`,
      ),
    )
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(options.limit ?? 50);

  let delivered = 0;
  let failed = 0;
  for (const { delivery, endpoint } of due) {
    // Claim it so two concurrent runners never double-send the same delivery.
    const [claimed] = await db
      .update(webhookDeliveries)
      .set({ attempts: delivery.attempts + 1, nextAttemptAt: new Date(Date.now() + 60_000) })
      .where(and(eq(webhookDeliveries.id, delivery.id), eq(webhookDeliveries.attempts, delivery.attempts), eq(webhookDeliveries.status, "pending")))
      .returning();
    if (!claimed) continue;
    const result = endpoint.enabled ? await sendOnce(endpoint.url, endpoint.encryptedSecret, delivery.payload, options.fetcher) : { ok: false, status: null, error: "Endpoint disabled." };
    if (result.ok) {
      delivered++;
      await db.update(webhookDeliveries).set({ status: "delivered", deliveredAt: new Date(), lastStatusCode: result.status, lastError: null }).where(eq(webhookDeliveries.id, delivery.id));
    } else {
      failed++;
      const attempts = delivery.attempts + 1;
      const gaveUp = attempts >= MAX_ATTEMPTS || !endpoint.enabled;
      await db
        .update(webhookDeliveries)
        .set({
          status: gaveUp ? "failed" : "pending",
          lastStatusCode: result.status,
          lastError: result.error,
          nextAttemptAt: new Date(Date.now() + (BACKOFF_MINUTES[attempts - 1] ?? 1440) * 60_000),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    }
  }
  return { attempted: due.length, delivered, failed };
}

async function sendOnce(url: string, encryptedSecret: string, payload: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  // A public hostname can still resolve to an internal address; redirects are never followed.
  if (process.env.NODE_ENV === "production" && (await resolvesPrivately(url))) {
    return { ok: false, status: null, error: "Endpoint resolves to a private network address; Railor only delivers to public hosts." };
  }
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  let secret: string;
  try {
    secret = decryptJson(encryptedSecret).secret!;
  } catch {
    return { ok: false, status: null, error: "Signing secret unavailable (encryption key changed?)." };
  }
  try {
    const response = await fetcher(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
      headers: { "Content-Type": "application/json", "User-Agent": "Railor-Webhooks/1.0", "Railor-Signature": signWebhookPayload(secret, timestamp, body) },
      body,
    });
    return response.status >= 200 && response.status < 300
      ? { ok: true, status: response.status, error: null }
      : { ok: false, status: response.status, error: `Endpoint answered HTTP ${response.status}.` };
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "Network error." };
  }
}

/** Sends a signed `ping` so a developer can check their verifier without waiting for a payment. */
export async function sendTestWebhook(organizationId: string, id: string, fetcher?: typeof fetch) {
  const db = await getDb();
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, organizationId)))
    .limit(1);
  if (!endpoint) throw new PaymentError("not_found", "Webhook endpoint not found.", 404);
  const payload = { id: `evt_${randomUUID().replaceAll("-", "")}`, object: "event", type: "ping", livemode: endpoint.mode === "live", created: Math.floor(Date.now() / 1000), data: { object: { message: "Railor webhook test" } } };
  return sendOnce(endpoint.url, endpoint.encryptedSecret, payload, fetcher);
}
