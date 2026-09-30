import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull, asc, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { connectorInstallations, connectorJobs, getDb, productEvents } from "@railor/database";
import { PaymentIntent, PolicyRules } from "@railor/types";
import { requireProductRole, decisionAuthorization } from "./product-control.js";
import { loadDecision, getActivePolicyVersion } from "./decision-repository.js";
import { runDecisionEngine } from "./decision-engine.js";
import { ConnectorCommand, ConnectorReceipt, ConnectorQuote, connectorTokenHash, canonicalJson, signConnectorCommand } from "./connector-protocol.js";
import type { QuoteRequest } from "./unified.js";

export async function registerConnector(organizationId: string, actorId: string, name: string) {
  await requireProductRole(organizationId, actorId, true);
  const token = `rlc_${randomBytes(32).toString("base64url")}`;
  const db = await getDb();
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(connectorInstallations).values({ organizationId, name: z.string().trim().min(1).max(100).parse(name), tokenHash: connectorTokenHash(token) }).returning();
    await tx.insert(productEvents).values({ organizationId, actorId, kind: "connector_registered", targetId: created!.id });
    return created!;
  });
  return { id: row.id, name: row.name, token }; // Only returned once, never in lists/logs.
}

export async function revokeConnector(organizationId: string, actorId: string, id: string) {
  await requireProductRole(organizationId, actorId, true);
  z.string().uuid().parse(id);
  return (await getDb()).transaction(async (tx) => {
    const [row] = await tx.update(connectorInstallations).set({ revokedAt: new Date() }).where(and(eq(connectorInstallations.id, id), eq(connectorInstallations.organizationId, organizationId))).returning();
    if (!row) throw new Error("connector_not_found");
    await tx.update(connectorJobs).set({ status: "blocked", result: { code: "connector_revoked" }, completedAt: new Date() }).where(and(eq(connectorJobs.installationId, id), eq(connectorJobs.status, "pending")));
    await tx.insert(productEvents).values({ organizationId, actorId, kind: "connector_revoked", targetId: id });
  });
}

export async function authenticateConnector(token: string) {
  if (!/^rlc_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("invalid_connector_token");
  const [row] = await (await getDb()).select().from(connectorInstallations).where(and(eq(connectorInstallations.tokenHash, connectorTokenHash(token)), isNull(connectorInstallations.revokedAt))).limit(1);
  if (!row) throw new Error("invalid_connector_token");
  return row;
}

async function assertFreshAuthorization(organizationId: string, decisionId: string) {
  const authorization = await decisionAuthorization(organizationId, decisionId);
  if (!authorization.authorized) throw new Error(authorization.reason);
  const loaded = await loadDecision(organizationId, decisionId);
  if (!loaded?.decision.recommendedProviderSlug) throw new Error("provider_required");
  const active = await getActivePolicyVersion(organizationId, loaded.decision.policyId);
  if (!active) throw new Error("active_policy_required");
  const fresh = await runDecisionEngine(PaymentIntent.parse(loaded.decision.intentSnapshot), {
    policyId: active.policy.id, policyVersionId: active.version.id, policyVersionNumber: active.version.versionNumber,
    rules: PolicyRules.parse(active.version.rules),
  }, { organizationId, mode: loaded.decision.mode as "enforce" | "optimize", proposedExecutor: loaded.decision.proposedExecutor ? { provider: loaded.decision.proposedExecutor } : undefined,
    fetchQuote: (slug, _id, request) => loadConnectorQuote(organizationId, slug, request) });
  if (fresh.decisionHash !== loaded.decision.decisionHash) throw new Error("decision_changed_revalidate_first");
  return loaded.decision;
}

export async function queueConnectorSimulation(organizationId: string, actorId: string, raw: unknown) {
  await requireProductRole(organizationId, actorId);
  const input = z.object({ installationId: z.string().uuid(), decisionId: z.string().uuid(), idempotencyKey: z.string().min(8).max(128), operation: z.enum(["simulate_transfer", "get_quote"]).default("simulate_transfer") }).strict().parse(raw);
  const db = await getDb();
  const requestHash = createHash("sha256").update(canonicalJson(input)).digest("hex");
  const existing = await db.select().from(connectorJobs).where(and(eq(connectorJobs.organizationId, organizationId), eq(connectorJobs.idempotencyKey, input.idempotencyKey))).limit(1);
  if (existing[0]) {
    if (existing[0].requestHash !== requestHash) throw new Error("idempotency_conflict");
    return { id: existing[0].id, status: existing[0].status };
  }
  const decision = input.operation === "get_quote" ? (await loadDecision(organizationId, input.decisionId))?.decision : await assertFreshAuthorization(organizationId, input.decisionId);
  if (!decision) throw new Error("decision_not_found");
  if (!decision.proposedExecutor && !decision.recommendedProviderSlug) throw new Error("proposed_provider_required_for_quote");
  return db.transaction(async (tx) => {
    const [installation] = await tx.select().from(connectorInstallations).where(and(eq(connectorInstallations.id, input.installationId), eq(connectorInstallations.organizationId, organizationId), isNull(connectorInstallations.revokedAt))).for("update");
    if (!installation) throw new Error("connector_not_found");
    const [job] = await tx.insert(connectorJobs).values({ organizationId, installationId: installation.id,
      decisionId: decision.id, decisionHash: decision.decisionHash, idempotencyKey: input.idempotencyKey, requestHash,
      expiresAt: new Date(Math.min(Date.now() + 5 * 60_000, input.operation === "get_quote" ? Infinity : decision.validUntil?.getTime() ?? Infinity)),
      payload: { provider: decision.proposedExecutor ?? decision.recommendedProviderSlug, intent: decision.intentSnapshot, operation: input.operation },
    }).onConflictDoNothing().returning();
    if (!job) {
      const [duplicate] = await tx.select().from(connectorJobs).where(and(eq(connectorJobs.organizationId, organizationId), eq(connectorJobs.idempotencyKey, input.idempotencyKey))).limit(1);
      if (duplicate?.requestHash === requestHash) return { id: duplicate.id, status: duplicate.status };
      throw new Error("decision_already_dispatched");
    }
    await tx.insert(productEvents).values({ organizationId, actorId, kind: "connector_job_queued", targetId: decision.id, data: { jobId: job.id, operation: input.operation } });
    return { id: job.id, status: job.status };
  });
}

export async function claimConnectorJob(token: string) {
  const installation = await authenticateConnector(token);
  const db = await getDb();
  await db.update(connectorInstallations).set({ lastSeenAt: new Date() }).where(eq(connectorInstallations.id, installation.id));
  const [job] = await db.select().from(connectorJobs).where(and(eq(connectorJobs.installationId, installation.id), eq(connectorJobs.status, "pending"))).orderBy(asc(connectorJobs.createdAt)).limit(1);
  if (!job) return null;
  try {
    if (job.expiresAt.getTime() <= Date.now()) throw new Error("job_expired");
    if (job.payload.operation !== "get_quote") await assertFreshAuthorization(installation.organizationId, job.decisionId);
  } catch {
    await db.update(connectorJobs).set({ status: "blocked", result: { code: "authorization_requires_review" }, completedAt: new Date() }).where(and(eq(connectorJobs.id, job.id), eq(connectorJobs.status, "pending")));
    return null;
  }
  return db.transaction(async (tx) => {
    const [active] = await tx.select().from(connectorInstallations).where(and(eq(connectorInstallations.id, installation.id), isNull(connectorInstallations.revokedAt))).for("update");
    if (!active) throw new Error("invalid_connector_token");
    const [claimed] = await tx.update(connectorJobs).set({ status: "claimed", claimedAt: new Date() }).where(and(eq(connectorJobs.id, job.id), eq(connectorJobs.status, "pending"))).returning();
    if (!claimed) return null;
    const command = ConnectorCommand.parse({ version: 1, id: job.id, installationId: installation.id,
      organizationId: installation.organizationId, decisionId: job.decisionId, decisionHash: job.decisionHash,
      ...job.payload, idempotencyKey: job.idempotencyKey, expiresAt: job.expiresAt.toISOString() });
    return { command, signature: signConnectorCommand(command, active.tokenHash) };
  });
}

export async function completeConnectorJob(token: string, raw: unknown) {
  const installation = await authenticateConnector(token);
  const receipt = ConnectorReceipt.parse(raw);
  return (await getDb()).transaction(async (tx) => {
    const [job] = await tx.select().from(connectorJobs).where(and(eq(connectorJobs.id, receipt.jobId), eq(connectorJobs.installationId, installation.id))).for("update");
    if (!job) throw new Error("job_not_found");
    if (receipt.status === "succeeded" && ((job.payload.operation === "get_quote") !== (receipt.code === "quoted"))) throw new Error("receipt_operation_mismatch");
    if (receipt.quote) {
      const intent = PaymentIntent.parse(job.payload.intent);
      const q = receipt.quote;
      if (q.providerSlug !== job.payload.provider || q.amount !== intent.amount || q.sourceAsset !== (intent.sourceAsset ?? intent.sourceCurrency) ||
        q.destinationCurrency !== intent.destinationCurrency || (q.sourceNetwork ?? null) !== (intent.sourceNetwork ?? null) ||
        (q.destinationCountry && q.destinationCountry !== intent.destinationCountry) || Date.parse(q.observedAt) > Date.now() + 60_000 ||
        Date.parse(q.observedAt) < (job.claimedAt?.getTime() ?? Date.now()) - 60_000) throw new Error("quote_scope_mismatch");
    }
    if (job.status !== "claimed") {
      if (canonicalJson(job.result) === canonicalJson(receipt)) return { id: job.id, status: job.status };
      throw new Error("receipt_conflict");
    }
    await tx.update(connectorJobs).set({ status: receipt.status, result: receipt, completedAt: new Date() }).where(eq(connectorJobs.id, job.id));
    await tx.insert(productEvents).values({ organizationId: installation.organizationId, kind: "connector_job_completed", targetId: job.decisionId, data: { jobId: job.id, status: receipt.status } });
    return { id: job.id, status: receipt.status };
  });
}

/** A customer quote remains private to this tenant and exact amount/route.
 * Missing expiry is capped at one minute; it is never a public price feed. */
export async function loadConnectorQuote(organizationId: string, providerSlug: string, request: QuoteRequest) {
  const db = await getDb();
  const rows = await db.select({ result: connectorJobs.result, payload: connectorJobs.payload }).from(connectorJobs)
    .innerJoin(connectorInstallations, eq(connectorInstallations.id, connectorJobs.installationId))
    .where(and(eq(connectorJobs.organizationId, organizationId), eq(connectorJobs.status, "succeeded"), isNull(connectorInstallations.revokedAt),
      sql`${connectorJobs.payload}->>'operation' = 'get_quote'`, sql`${connectorJobs.payload}->>'provider' = ${providerSlug}`))
    .orderBy(desc(connectorJobs.completedAt)).limit(100);
  for (const row of rows) {
    const q = ConnectorQuote.safeParse(row.result?.quote); const intent = PaymentIntent.safeParse(row.payload.intent);
    if (!q.success || !intent.success) continue;
    const quote = q.data;
    const expires = Math.min(quote.expiresAt ? Date.parse(quote.expiresAt) : Date.parse(quote.observedAt) + 60_000, Date.parse(quote.observedAt) + 15 * 60_000);
    if (request.intentFingerprint && createHash("sha256").update(canonicalJson(intent.data)).digest("hex") !== request.intentFingerprint) continue;
    if (expires <= Date.now() || quote.amount !== request.amount || quote.sourceAsset !== request.sourceAsset ||
      quote.destinationCurrency !== request.destinationCurrency || intent.data.destinationCountry !== request.destinationCountry ||
      intent.data.sourceEntityCountry !== request.entityCountry || (quote.sourceNetwork ?? null) !== (request.sourceNetwork ?? null)) continue;
    return { ...quote, expiresAt: new Date(expires).toISOString() };
  }
  return null;
}
