import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  beneficiaries,
  beneficiaryProviderRefs,
  decisions,
  getDb,
  limits as limitsTable,
  orgPaymentSettings,
  organizations,
  paymentAttempts,
  paymentEvents,
  payments,
  platformSettings,
  providerConnections,
  providers,
  providerWebhookEvents,
  type PaymentStatus,
} from "@railor/database";
import { PaymentIntent, PolicyRules } from "@railor/types";
import { getAdapter } from "../adapters.js";
import { canonicalJson } from "../connector-protocol.js";
import { runDecisionEngine, type QuoteFetcher } from "../decision-engine.js";
import { getDefaultActivePolicy, loadDecision, loadProviderIdsWithActiveIncidents, persistDecision } from "../decision-repository.js";
import { settlementMinutes } from "../eligibility.js";
import { decisionAuthorization } from "../product-control.js";
import { loadProviderInputs } from "../repository.js";
import { decryptJson, encryptJson, sha256Hex } from "../secrets.js";
import { getPayoutAdapter, sandboxPayoutAdapter } from "./adapters/index.js";
import { deliverDueWebhooks, enqueueWebhookEvent } from "./outbound.js";
import { scoreRoute, type PaymentRoutePlan, type RouteCandidateInput, type RouteExecutor, type RoutingPreset } from "./routing.js";
import {
  OPEN_STATUSES,
  PaymentError,
  type ConnectionEnvironment,
  type NormalizedTransferStatus,
  type PaymentMode,
  type PayoutAdapter,
  type PayoutBeneficiary,
  type PayoutOutcome,
  type PayoutRequest,
} from "./types.js";

/**
 * Payments — Railor executing a payout through the organization's own
 * connected provider account. Funds never touch Railor.
 *
 * A payment can only be submitted when every gate holds:
 *   1. a policy decision authorizes it (allowed, or independently approved);
 *   2. the route plan has an eligible, executable provider;
 *   3. operators have not paused payments platform-wide;
 *   4. live mode only: RAILOR_LIVE_PAYMENTS=enabled on this deployment, the
 *      organization was approved for live payments by a Railor admin, the
 *      provider was approved for live payouts, the connection is production,
 *      and the amount fits the organization's per-payment and daily limits.
 *
 * Exactly-once: each provider call is recorded as an attempt with a UUID
 * idempotency key *before* the call, and every retry of that attempt reuses
 * the key. An ambiguous outcome (timeout, 5xx) parks the payment in
 * `unknown`; it is never sent to another provider until reconciliation
 * proves the first one did not take it.
 */

export const SANDBOX_CONNECTION_ID = "00000000-0000-0000-0000-000000000000";
const PLAN_MAX_AGE_MS = 10 * 60_000;

export function liveMoneyMovementEnabled(): boolean {
  return process.env.RAILOR_LIVE_PAYMENTS?.trim().toLowerCase() === "enabled";
}

/* ----------------------------------------------------------------------------
 * Platform + organization settings
 * ------------------------------------------------------------------------- */

export interface PlatformPaymentFlags {
  paused: boolean;
  pausedReason: string | null;
  liveProviders: string[];
}

export async function getPlatformPaymentFlags(): Promise<PlatformPaymentFlags> {
  const db = await getDb();
  const rows = await db.select().from(platformSettings).where(inArray(platformSettings.key, ["payments.paused", "payments.live_providers"]));
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const paused = (byKey.get("payments.paused") ?? {}) as { paused?: boolean; reason?: string };
  const live = byKey.get("payments.live_providers");
  return { paused: Boolean(paused.paused), pausedReason: paused.reason ?? null, liveProviders: Array.isArray(live) ? (live as string[]) : [] };
}

export async function setPlatformSetting(key: "payments.paused" | "payments.live_providers", value: unknown, adminUserId: string) {
  const db = await getDb();
  await db
    .insert(platformSettings)
    .values({ key, value, updatedBy: adminUserId })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy: adminUserId, updatedAt: new Date() } });
}

export async function getOrgPaymentSettings(organizationId: string) {
  const db = await getDb();
  const [row] = await db.select().from(orgPaymentSettings).where(eq(orgPaymentSettings.organizationId, organizationId)).limit(1);
  return (
    row ?? {
      organizationId,
      liveEnabled: false,
      liveEnabledBy: null,
      liveEnabledAt: null,
      liveNote: null,
      maxPaymentAmount: null,
      dailyPaymentAmount: null,
      routingPreset: "balanced",
      preferredProviders: [] as string[],
      blockedProviders: [] as string[],
      fallbackEnabled: true,
      maxAttempts: 2,
      updatedAt: new Date(0),
    }
  );
}

export const RoutingSettingsInput = z.object({
  routingPreset: z.enum(["balanced", "cheapest", "fastest", "most_reliable"]).optional(),
  preferredProviders: z.array(z.string().regex(/^[a-z0-9-]{1,100}$/)).max(10).optional(),
  blockedProviders: z.array(z.string().regex(/^[a-z0-9-]{1,100}$/)).max(50).optional(),
  fallbackEnabled: z.boolean().optional(),
  maxAttempts: z.number().int().min(1).max(5).optional(),
});

export async function updateRoutingSettings(organizationId: string, raw: unknown) {
  const patch = RoutingSettingsInput.parse(raw);
  const db = await getDb();
  await db
    .insert(orgPaymentSettings)
    .values({ organizationId, ...patch })
    .onConflictDoUpdate({ target: orgPaymentSettings.organizationId, set: { ...patch, updatedAt: new Date() } });
  return getOrgPaymentSettings(organizationId);
}

/** Railor-admin only: turn live payments on/off for an organization and set its limits. */
export async function setOrgLiveAccess(
  organizationId: string,
  adminUserId: string,
  input: { liveEnabled: boolean; maxPaymentAmount?: number | null; dailyPaymentAmount?: number | null; note?: string },
) {
  const db = await getDb();
  const values = {
    liveEnabled: input.liveEnabled,
    liveEnabledBy: input.liveEnabled ? adminUserId : null,
    liveEnabledAt: input.liveEnabled ? new Date() : null,
    liveNote: input.note?.slice(0, 500) ?? null,
    maxPaymentAmount: input.maxPaymentAmount == null ? null : String(input.maxPaymentAmount),
    dailyPaymentAmount: input.dailyPaymentAmount == null ? null : String(input.dailyPaymentAmount),
  };
  await db
    .insert(orgPaymentSettings)
    .values({ organizationId, ...values })
    .onConflictDoUpdate({ target: orgPaymentSettings.organizationId, set: { ...values, updatedAt: new Date() } });
}

/* ----------------------------------------------------------------------------
 * Beneficiaries
 * ------------------------------------------------------------------------- */

const EVM = /^0x[a-fA-F0-9]{40}$/;
const NETWORK_ADDRESS: Record<string, RegExp> = {
  ethereum: EVM,
  base: EVM,
  polygon: EVM,
  arbitrum: EVM,
  optimism: EVM,
  avalanche: EVM,
  celo: EVM,
  linea: EVM,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  stellar: /^G[A-Z2-7]{55}$/,
};

function ibanValid(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function abaValid(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split("").map(Number);
  return (3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!)) % 10 === 0;
}

const Details = z.object({
  accountNumber: z.string().trim().max(34).optional(),
  routingNumber: z.string().trim().max(20).optional(),
  accountType: z.enum(["checking", "savings"]).optional(),
  iban: z.string().trim().max(42).optional(),
  bic: z.string().trim().max(11).optional(),
  sortCode: z.string().trim().max(8).optional(),
  clabe: z.string().trim().max(18).optional(),
  ifsc: z.string().trim().max(11).transform((v) => v.toUpperCase()).optional(),
  pixKey: z.string().trim().max(140).optional(),
  documentNumber: z.string().trim().max(40).optional(),
  address: z.string().trim().max(120).optional(),
  bankName: z.string().trim().max(120).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(200).optional(),
});

export const BeneficiaryInput = z
  .object({
    label: z.string().trim().max(80).optional(),
    holderType: z.enum(["business", "individual"]),
    holderName: z.string().trim().min(2).max(140),
    country: z.string().trim().length(2).transform((v) => v.toUpperCase()),
    currency: z.string().trim().min(3).max(6).transform((v) => v.toUpperCase()),
    method: z.enum(["bank_us", "iban", "gb", "clabe", "pix", "in_bank", "crypto_address"]),
    network: z.string().trim().max(40).optional(),
    details: Details,
  })
  .superRefine((v, ctx) => {
    const d = v.details;
    const need = (cond: boolean, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: "custom", path: ["details", path], message });
    };
    if (v.method === "bank_us") {
      need(/^\d{4,17}$/.test(d.accountNumber ?? ""), "accountNumber", "US account numbers are 4–17 digits.");
      need(abaValid(d.routingNumber ?? ""), "routingNumber", "That is not a valid 9-digit ABA routing number.");
    }
    if (v.method === "iban") need(ibanValid(d.iban ?? ""), "iban", "That IBAN's checksum does not validate.");
    if (v.method === "gb") {
      need(/^\d{8}$/.test(d.accountNumber ?? ""), "accountNumber", "UK account numbers are 8 digits.");
      need(/^\d{6}$/.test((d.sortCode ?? "").replace(/-/g, "")), "sortCode", "UK sort codes are 6 digits.");
    }
    if (v.method === "clabe") need(/^\d{18}$/.test(d.clabe ?? ""), "clabe", "A CLABE is 18 digits.");
    if (v.method === "in_bank") {
      // RBI IFSC: 4-letter bank code, a reserved 0, then a 6-character branch code.
      need(/^[A-Z]{4}0[A-Z0-9]{6}$/.test(d.ifsc ?? ""), "ifsc", "An IFSC is 11 characters, like HDFC0001234.");
      need(/^\d{9,18}$/.test(d.accountNumber ?? ""), "accountNumber", "Indian account numbers are 9–18 digits.");
    }
    if (v.method === "pix") need(Boolean(d.pixKey), "pixKey", "A Pix key is required.");
    if (v.method === "crypto_address") {
      const network = (v.network ?? "").toLowerCase();
      const pattern = NETWORK_ADDRESS[network];
      if (!pattern) ctx.addIssue({ code: "custom", path: ["network"], message: `Pick a supported network (${Object.keys(NETWORK_ADDRESS).join(", ")}).` });
      else need(pattern.test(d.address ?? ""), "address", `That is not a valid ${network} address.`);
    }
  });

function primaryIdentifier(method: string, d: z.infer<typeof Details>, network?: string) {
  switch (method) {
    case "bank_us":
      return `${d.routingNumber}:${d.accountNumber}`;
    case "iban":
      return (d.iban ?? "").replace(/\s+/g, "").toUpperCase();
    case "gb":
      return `${(d.sortCode ?? "").replace(/-/g, "")}:${d.accountNumber}`;
    case "clabe":
      return d.clabe ?? "";
    case "in_bank":
      return `${d.ifsc}:${d.accountNumber}`;
    case "pix":
      return d.pixKey ?? "";
    default:
      return `${network}:${(d.address ?? "").toLowerCase()}`;
  }
}

function maskHint(method: string, d: z.infer<typeof Details>): string {
  const last4 = (v?: string) => (v ?? "").replace(/\s+/g, "").slice(-4);
  if (method === "crypto_address") return `${(d.address ?? "").slice(0, 6)}…${(d.address ?? "").slice(-4)}`;
  if (method === "iban") return `${(d.iban ?? "").replace(/\s+/g, "").slice(0, 4)} •••• ${last4(d.iban)}`;
  if (method === "clabe") return `CLABE •••• ${last4(d.clabe)}`;
  if (method === "pix") return `Pix •••• ${last4(d.pixKey)}`;
  if (method === "in_bank") return `${(d.ifsc ?? "").slice(0, 4)} •••• ${last4(d.accountNumber)}`;
  return `•••• ${last4(d.accountNumber)}`;
}

export async function createBeneficiary(organizationId: string, userId: string | null, raw: unknown) {
  const input = BeneficiaryInput.parse(raw);
  const details = Object.fromEntries(Object.entries(input.details).filter(([, v]) => v !== undefined && v !== "")) as Record<string, string>;
  const network = input.network?.toLowerCase();
  const fingerprint = sha256Hex(`${organizationId}|${input.method}|${input.country}|${input.currency}|${primaryIdentifier(input.method, input.details, network)}`);
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(beneficiaries)
    .where(and(eq(beneficiaries.organizationId, organizationId), eq(beneficiaries.fingerprint, fingerprint), sql`${beneficiaries.archivedAt} is null`))
    .limit(1);
  if (existing) return { beneficiary: summarizeBeneficiary(existing), created: false };
  const [row] = await db
    .insert(beneficiaries)
    .values({
      organizationId,
      label: input.label?.trim() || input.holderName,
      holderType: input.holderType,
      holderName: input.holderName,
      country: input.country,
      currency: input.currency,
      method: input.method,
      network: network ?? null,
      displayHint: maskHint(input.method, input.details),
      encryptedDetails: encryptJson(details),
      fingerprint,
      createdBy: userId,
    })
    .returning();
  return { beneficiary: summarizeBeneficiary(row!), created: true };
}

export function summarizeBeneficiary(b: typeof beneficiaries.$inferSelect) {
  return {
    id: b.id,
    label: b.label,
    holderType: b.holderType,
    holderName: b.holderName,
    country: b.country,
    currency: b.currency,
    method: b.method,
    network: b.network,
    displayHint: b.displayHint,
    archived: Boolean(b.archivedAt),
    createdAt: b.createdAt,
  };
}

export async function listBeneficiaries(organizationId: string, options: { includeArchived?: boolean } = {}) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(beneficiaries)
    .where(and(eq(beneficiaries.organizationId, organizationId), options.includeArchived ? sql`true` : sql`${beneficiaries.archivedAt} is null`))
    .orderBy(desc(beneficiaries.createdAt));
  return rows.map(summarizeBeneficiary);
}

export async function archiveBeneficiary(organizationId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .update(beneficiaries)
    .set({ archivedAt: new Date() })
    .where(and(eq(beneficiaries.id, id), eq(beneficiaries.organizationId, organizationId)))
    .returning();
  if (!row) throw new PaymentError("not_found", "Beneficiary not found.", 404);
}

async function loadPayoutBeneficiary(organizationId: string, id: string): Promise<PayoutBeneficiary> {
  const db = await getDb();
  const [b] = await db.select().from(beneficiaries).where(and(eq(beneficiaries.id, id), eq(beneficiaries.organizationId, organizationId))).limit(1);
  if (!b) throw new PaymentError("beneficiary_not_found", "Beneficiary not found.", 404);
  return {
    id: b.id,
    holderType: b.holderType,
    holderName: b.holderName,
    country: b.country,
    currency: b.currency,
    method: b.method,
    network: b.network,
    details: decryptJson(b.encryptedDetails),
  };
}

/* ----------------------------------------------------------------------------
 * Connections + routing inputs
 * ------------------------------------------------------------------------- */

async function loadOrgConnections(organizationId: string) {
  const db = await getDb();
  return db
    .select({ connection: providerConnections, slug: providers.slug, name: providers.name })
    .from(providerConnections)
    .innerJoin(providers, eq(providerConnections.providerId, providers.id))
    .where(and(eq(providerConnections.organizationId, organizationId), eq(providerConnections.status, "connected")));
}

function connectionCredentials(row: { encryptedCredentials: string | null; environment: ConnectionEnvironment }) {
  if (!row.encryptedCredentials) return null;
  // Adapters read the environment from the credentials, so the connection's
  // own environment always wins over anything typed into a credential field.
  return { ...decryptJson(row.encryptedCredentials), environment: row.environment === "production" ? "production" : "sandbox" };
}

async function observedReliability() {
  const db = await getDb();
  const rows = await db
    .select({
      slug: paymentAttempts.providerSlug,
      settled: sql<number>`count(*) filter (where ${paymentAttempts.status} in ('completed','failed','returned'))::int`,
      completed: sql<number>`count(*) filter (where ${paymentAttempts.status} = 'completed')::int`,
    })
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.executor, "provider"), eq(paymentAttempts.environment, "production")))
    .groupBy(paymentAttempts.providerSlug);
  return new Map(rows.map((r) => [r.slug, { settled: r.settled, rate: r.settled ? r.completed / r.settled : null }]));
}

interface PlanInput {
  mode: PaymentMode;
  amount: number;
  sourceCurrency: string;
  sourceNetwork?: string;
  destinationCurrency: string;
  destinationCountry: string;
  pinnedProvider?: string | null;
  candidates: Array<{ providerSlug: string; providerName: string; policyResult: string; eligibilityStatus: string; policyReasonCodes: string[] }>;
}

function quoteSummary(quote: { feeAmount?: number; costPartial: boolean; estimatedArrivalMinutes?: number; recipientAmount?: number; quoteType: string; expiresAt?: string } | null, amount: number) {
  if (!quote) return null;
  return {
    feeBps: quote.feeAmount !== undefined && !quote.costPartial && amount > 0 ? Math.round((quote.feeAmount / amount) * 10_000 * 100) / 100 : null,
    etaMinutes: quote.estimatedArrivalMinutes ?? null,
    recipientAmount: quote.recipientAmount ?? null,
    quoteType: quote.quoteType,
    expiresAt: quote.expiresAt,
  };
}

export async function planPaymentRoute(organizationId: string, input: PlanInput): Promise<PaymentRoutePlan> {
  const [settings, flags, connections, providerInputs, reliability] = await Promise.all([
    getOrgPaymentSettings(organizationId),
    getPlatformPaymentFlags(),
    loadOrgConnections(organizationId),
    loadProviderInputs(),
    observedReliability(),
  ]);
  const inputsBySlug = new Map(providerInputs.map((p) => [p.slug, p]));
  const incidents = await loadProviderIdsWithActiveIncidents(providerInputs.map((p) => p.id));
  const db = await getDb();
  const limitRows = await db.select({ limit: limitsTable, slug: providers.slug }).from(limitsTable).innerJoin(providers, eq(limitsTable.providerId, providers.id));
  const wantEnv: ConnectionEnvironment = input.mode === "live" ? "production" : "sandbox";

  const probe: PayoutRequest = {
    paymentId: "plan",
    attemptNumber: 0,
    idempotencyKey: randomUUID(),
    amount: String(input.amount),
    sourceCurrency: input.sourceCurrency,
    sourceNetwork: input.sourceNetwork,
    destinationCurrency: input.destinationCurrency,
    destinationCountry: input.destinationCountry,
    beneficiary: { id: "plan", holderType: "business", holderName: "plan", country: input.destinationCountry, currency: input.destinationCurrency, method: "iban", network: null, details: {} },
    environment: wantEnv,
  };

  const routeInputs: RouteCandidateInput[] = await Promise.all(
    input.candidates.map(async (c): Promise<RouteCandidateInput> => {
      const provider = inputsBySlug.get(c.providerSlug);
      const payout = getPayoutAdapter(c.providerSlug);
      const connection = connections.find((row) => row.slug === c.providerSlug && row.connection.environment === wantEnv);
      let executor: RouteExecutor | null = null;
      let executorNote: string | undefined;
      if (input.mode === "test") {
        if (connection && payout) {
          executor = { kind: "provider", connectionId: connection.connection.id, environment: "sandbox" };
          executorNote = `${c.providerName} sandbox API via your connection.`;
        } else {
          executor = { kind: "railor_sandbox" };
          executorNote = payout
            ? `Simulated by Railor's sandbox — connect your ${c.providerName} sandbox to test its real API.`
            : `Simulated by Railor's sandbox — Railor cannot execute through ${c.providerName} yet.`;
        }
      } else if (!payout) executorNote = `Railor cannot execute payouts through ${c.providerName} yet.`;
      else if (!connection) executorNote = `Connect your ${c.providerName} production account to pay through it.`;
      else if (!flags.liveProviders.includes(c.providerSlug)) executorNote = `${c.providerName} is awaiting operator approval for live payouts.`;
      else executor = { kind: "provider", connectionId: connection.connection.id, environment: "production" };

      let quote: RouteCandidateInput["quote"] = null;
      let quoteNote: string | undefined;
      if (executor?.kind === "railor_sandbox") {
        quote = quoteSummary(await sandboxPayoutAdapter.quote!({}, probe), input.amount);
        quoteNote = "Sandbox quote.";
      } else if (executor?.kind === "provider" && connection) {
        const quoter = getAdapter(c.providerSlug);
        if (quoter?.getQuote) {
          try {
            const creds = connectionCredentials(connection.connection);
            if (creds) {
              quote = quoteSummary(
                await quoter.getQuote(creds, {
                  sourceAsset: input.sourceCurrency,
                  sourceNetwork: input.sourceNetwork,
                  destinationCurrency: input.destinationCurrency,
                  destinationCountry: input.destinationCountry,
                  amount: input.amount,
                }),
                input.amount,
              );
            }
          } catch (error) {
            quoteNote = `Quote failed: ${error instanceof Error ? error.message.slice(0, 120) : "unknown error"}.`;
          }
        } else quoteNote = "This provider has no quote endpoint Railor uses yet.";
      }

      const matchingLimits = limitRows.filter(
        (l) => l.slug === c.providerSlug && (l.limit.currency === input.sourceCurrency || (l.limit.currency === null && false)),
      );
      let limitStatus: RouteCandidateInput["limitStatus"] = "unknown";
      for (const { limit } of matchingLimits) {
        if (limit.maxAmount !== null && input.amount > Number(limit.maxAmount)) limitStatus = "above_max";
        else if (limit.minAmount !== null && input.amount < Number(limit.minAmount)) limitStatus = "below_min";
        else if (limitStatus === "unknown") limitStatus = "within";
      }

      const rel = reliability.get(c.providerSlug);
      const prefIndex = settings.preferredProviders.indexOf(c.providerSlug);
      const eligible = c.policyResult === "pass" && (c.eligibilityStatus === "supported" || c.eligibilityStatus === "additional_requirements");
      return {
        providerSlug: c.providerSlug,
        providerName: c.providerName,
        eligible: eligible && (!input.pinnedProvider || input.pinnedProvider === c.providerSlug),
        exclusionReason: input.pinnedProvider && input.pinnedProvider !== c.providerSlug
          ? "Not the provider pinned for this payment."
          : c.policyResult !== "pass"
            ? `Policy ${c.policyResult === "fail" ? "rejected" : "could not verify"} this provider${c.policyReasonCodes.length ? ` (${c.policyReasonCodes.slice(0, 3).join(", ").replaceAll("_", " ")})` : ""}.`
            : `Route ${c.eligibilityStatus.replaceAll("_", " ")} for this corridor.`,
        executor,
        executorNote,
        quote,
        quoteNote,
        healthOkRatio: provider?.healthOkRatio ?? null,
        activeIncident: provider ? incidents.has(provider.id) : false,
        observedSuccessRate: rel?.rate ?? null,
        observedAttempts: rel?.settled ?? 0,
        advertisedEtaMinutes: settlementMinutes(provider?.advertisedSettlement ?? null),
        limitStatus,
        preferenceRank: prefIndex >= 0 ? prefIndex : null,
        preferenceCount: settings.preferredProviders.length,
        blocked: settings.blockedProviders.includes(c.providerSlug),
      };
    }),
  );

  return scoreRoute(routeInputs, { mode: input.mode, preset: (settings.routingPreset as RoutingPreset) ?? "balanced" });
}

/* ----------------------------------------------------------------------------
 * Payment lifecycle
 * ------------------------------------------------------------------------- */

export interface PaymentActor {
  userId: string | null;
  source: "user" | "api" | "admin";
  role?: string | null;
}

export interface PaymentDeps {
  /** Live-quote fetcher for the decision engine (credential decryption lives in the web app). */
  fetchQuote?: QuoteFetcher;
}

export const CreatePaymentInput = z.object({
  mode: z.enum(["test", "live"]),
  intent: PaymentIntent,
  beneficiaryId: z.string().uuid(),
  pinnedProvider: z.string().regex(/^[a-z0-9-]{1,100}$/).optional(),
  reference: z.string().trim().max(140).optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});
export type CreatePaymentInput = z.infer<typeof CreatePaymentInput>;

type PaymentRow = typeof payments.$inferSelect;

const EVENT_FOR_STATUS: Partial<Record<PaymentStatus, string>> = {
  requires_approval: "payment.requires_approval",
  ready: "payment.ready",
  blocked: "payment.blocked",
  submitting: "payment.submitted",
  awaiting_funds: "payment.awaiting_funds",
  processing: "payment.processing",
  completed: "payment.completed",
  failed: "payment.failed",
  returned: "payment.returned",
  cancelled: "payment.cancelled",
  unknown: "payment.unknown",
};

async function recordEvent(
  payment: Pick<PaymentRow, "id" | "organizationId">,
  type: string,
  from: PaymentStatus | null,
  to: PaymentStatus | null,
  source: "user" | "api" | "provider_webhook" | "reconciler" | "system" | "admin",
  actorId: string | null,
  detail: Record<string, unknown> = {},
) {
  const db = await getDb();
  await db.insert(paymentEvents).values({ paymentId: payment.id, organizationId: payment.organizationId, type, fromStatus: from, toStatus: to, source, actorId, detail });
}

async function emitWebhook(payment: PaymentRow, type: string) {
  try {
    const queued = await enqueueWebhookEvent(payment.organizationId, payment.mode, type, serializePayment(payment));
    if (queued) await deliverDueWebhooks({ organizationId: payment.organizationId, limit: 5 });
  } catch (error) {
    console.error(JSON.stringify({ event: "webhook_emit_failed", paymentId: payment.id, error: error instanceof Error ? error.message : "unknown" }));
  }
}

/** Moves a payment between states only along allowed edges; records the event and notifies webhooks. */
async function transition(
  payment: PaymentRow,
  to: PaymentStatus,
  source: Parameters<typeof recordEvent>[4],
  actorId: string | null,
  patch: Partial<typeof payments.$inferInsert> = {},
  detail: Record<string, unknown> = {},
): Promise<PaymentRow> {
  const db = await getDb();
  const [updated] = await db
    .update(payments)
    .set({ ...patch, status: to, updatedAt: new Date(), ...(to === "completed" ? { completedAt: new Date() } : {}) })
    .where(and(eq(payments.id, payment.id), eq(payments.status, payment.status)))
    .returning();
  if (!updated) throw new PaymentError("state_conflict", "This payment changed while the action ran. Refresh and try again.", 409);
  if (payment.status !== to) {
    await recordEvent(payment, `status.${to}`, payment.status, to, source, actorId, detail);
    const type = EVENT_FOR_STATUS[to];
    if (type) await emitWebhook(updated, type);
  }
  return updated;
}

async function runEngine(organizationId: string, intent: PaymentIntent, pinnedProvider: string | undefined | null, actorId: string | null, deps: PaymentDeps) {
  const policy = await getDefaultActivePolicy(organizationId);
  if (!policy) throw new PaymentError("active_policy_required", "Activate a policy first — every payment is evaluated against one.", 409);
  let decisionInsert: Awaited<ReturnType<typeof runDecisionEngine>>;
  try {
    decisionInsert = await runDecisionEngine(
    intent,
    { policyId: policy.policy.id, policyVersionId: policy.version.id, policyVersionNumber: policy.version.versionNumber, rules: PolicyRules.parse(policy.version.rules) },
    {
      organizationId,
      mode: pinnedProvider ? "enforce" : "optimize",
      proposedExecutor: pinnedProvider ? { provider: pinnedProvider } : undefined,
      createdBy: actorId ?? undefined,
      fetchQuote: deps.fetchQuote,
    },
  );
  } catch (error) {
    if (error instanceof Error && error.message === "provider_not_found") {
      throw new PaymentError("provider_not_found", `No mapped provider "${pinnedProvider}" to pin this payment to.`, 404);
    }
    throw error;
  }
  return decisionInsert;
}

async function decide(organizationId: string, intent: PaymentIntent, pinnedProvider: string | undefined | null, actorId: string | null, deps: PaymentDeps) {
  const decisionInsert = await runEngine(organizationId, intent, pinnedProvider, actorId, deps);
  const created = await persistDecision(decisionInsert);
  const loaded = await loadDecision(organizationId, created.id);
  if (!loaded) throw new PaymentError("decision_failed", "The policy decision could not be recorded.", 500);
  return loaded;
}

function planInputFrom(payment: Pick<PaymentRow, "mode" | "amount" | "sourceCurrency" | "destinationCurrency" | "destinationCountry" | "pinnedProvider" | "intent">, candidates: NonNullable<Awaited<ReturnType<typeof loadDecision>>>["candidates"]): PlanInput {
  const intent = payment.intent as { sourceNetwork?: string };
  return {
    mode: payment.mode,
    amount: Number(payment.amount),
    sourceCurrency: payment.sourceCurrency,
    sourceNetwork: intent.sourceNetwork,
    destinationCurrency: payment.destinationCurrency,
    destinationCountry: payment.destinationCountry,
    pinnedProvider: payment.pinnedProvider,
    candidates: candidates.map((c) => ({
      providerSlug: c.providerSlug,
      providerName: c.providerName,
      policyResult: c.policyResult,
      eligibilityStatus: c.eligibilityStatus,
      policyReasonCodes: c.policyReasonCodes,
    })),
  };
}

function statusFromDecision(decisionStatus: string, plan: PaymentRoutePlan): { status: PaymentStatus; failureCode?: string; failureMessage?: string } {
  if (!plan.candidates.length && (decisionStatus === "allow" || decisionStatus === "approval_required")) {
    return { status: "blocked", failureCode: "no_executable_route", failureMessage: plan.excluded[0]?.reason ?? "No eligible provider can execute this payment." };
  }
  if (decisionStatus === "allow") return { status: "ready" };
  if (decisionStatus === "approval_required") return { status: "requires_approval" };
  return {
    status: "blocked",
    failureCode: decisionStatus,
    failureMessage:
      decisionStatus === "deny"
        ? "Your active policy denied every candidate route."
        : decisionStatus === "no_verified_route"
          ? "No provider has verified evidence for this route."
          : "Railor does not have enough verified data to evaluate this route.",
  };
}

async function liveGate(organizationId: string, amount: number, excludePaymentId?: string) {
  if (!liveMoneyMovementEnabled()) {
    throw new PaymentError("live_payments_disabled", "Live payments are not enabled on this deployment (RAILOR_LIVE_PAYMENTS).", 403);
  }
  const settings = await getOrgPaymentSettings(organizationId);
  if (!settings.liveEnabled) {
    throw new PaymentError("live_access_required", "Live payments are not enabled for this workspace yet. Railor enables them after reviewing your account.", 403);
  }
  if (settings.maxPaymentAmount !== null && amount > Number(settings.maxPaymentAmount)) {
    throw new PaymentError("amount_above_limit", `This workspace's live limit is ${Number(settings.maxPaymentAmount).toLocaleString("en-US")} per payment.`, 403);
  }
  if (settings.dailyPaymentAmount !== null) {
    const db = await getDb();
    const since = new Date(Date.now() - 86_400_000);
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(
        and(
          eq(payments.organizationId, organizationId),
          eq(payments.mode, "live"),
          gte(payments.submittedAt, since),
          inArray(payments.status, ["submitting", "awaiting_funds", "processing", "completed", "unknown"]),
          excludePaymentId ? sql`${payments.id} <> ${excludePaymentId}` : sql`true`,
        ),
      );
    if (Number(row?.total ?? 0) + amount > Number(settings.dailyPaymentAmount)) {
      throw new PaymentError("daily_limit_reached", `This workspace's rolling 24-hour live limit is ${Number(settings.dailyPaymentAmount).toLocaleString("en-US")}.`, 403);
    }
  }
}

export const PreviewRouteInput = z.object({
  mode: z.enum(["test", "live"]),
  intent: PaymentIntent,
  pinnedProvider: z.string().regex(/^[a-z0-9-]{1,100}$/).optional(),
});

/** What would happen if this payment were created now — the policy verdict and route plan, nothing persisted. */
export async function previewPaymentRoute(organizationId: string, raw: unknown, deps: PaymentDeps = {}) {
  const input = PreviewRouteInput.parse(raw);
  const intent = input.intent;
  const sourceCurrency = (intent.sourceAsset ?? intent.sourceCurrency)?.toUpperCase();
  if (!sourceCurrency || !intent.destinationCurrency) throw new PaymentError("invalid_intent", "Pick a source asset or currency and a destination currency.");
  const insert = await runEngine(organizationId, intent, input.pinnedProvider, null, deps);
  const plan = await planPaymentRoute(organizationId, {
    mode: input.mode,
    amount: intent.amount,
    sourceCurrency,
    sourceNetwork: intent.sourceNetwork,
    destinationCurrency: intent.destinationCurrency.toUpperCase(),
    destinationCountry: intent.destinationCountry.toUpperCase(),
    pinnedProvider: input.pinnedProvider ?? null,
    candidates: insert.candidates.map((c) => ({
      providerSlug: c.providerSlug,
      providerName: c.providerName,
      policyResult: c.policyEvaluation.result,
      eligibilityStatus: c.eligibilityStatus,
      policyReasonCodes: c.rejectionReasonCodes,
    })),
  });
  return { decisionStatus: insert.status, outcome: statusFromDecision(insert.status, plan), plan };
}

export async function createPayment(organizationId: string, actor: PaymentActor, raw: unknown, deps: PaymentDeps = {}) {
  const input = CreatePaymentInput.parse(raw);
  const db = await getDb();
  const { idempotencyKey, ...hashed } = input;
  const requestHash = sha256Hex(canonicalJson(hashed));
  if (idempotencyKey) {
    const [existing] = await db.select().from(payments).where(and(eq(payments.organizationId, organizationId), eq(payments.idempotencyKey, idempotencyKey))).limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new PaymentError("idempotency_conflict", "This Idempotency-Key was already used with a different request.", 409);
      return { payment: existing, replayed: true };
    }
  }

  const intent = input.intent;
  const sourceCurrency = (intent.sourceAsset ?? intent.sourceCurrency)?.toUpperCase();
  if (!sourceCurrency) throw new PaymentError("invalid_intent", "The intent needs a source asset or source currency.");
  if (!intent.destinationCurrency) throw new PaymentError("invalid_intent", "The intent needs a destination currency.");
  const beneficiary = await loadPayoutBeneficiary(organizationId, input.beneficiaryId);
  const [benRow] = await db.select({ archivedAt: beneficiaries.archivedAt }).from(beneficiaries).where(eq(beneficiaries.id, beneficiary.id)).limit(1);
  if (benRow?.archivedAt) throw new PaymentError("beneficiary_archived", "That beneficiary was archived.");
  if (beneficiary.currency !== intent.destinationCurrency.toUpperCase() || beneficiary.country !== intent.destinationCountry.toUpperCase()) {
    throw new PaymentError(
      "beneficiary_mismatch",
      `This beneficiary receives ${beneficiary.currency} in ${beneficiary.country}, but the payment is for ${intent.destinationCurrency} in ${intent.destinationCountry}.`,
    );
  }
  if (input.mode === "live") await liveGate(organizationId, intent.amount);

  const loaded = await decide(organizationId, intent, input.pinnedProvider, actor.userId, deps);
  const base = {
    mode: input.mode,
    amount: String(intent.amount),
    sourceCurrency,
    destinationCurrency: intent.destinationCurrency.toUpperCase(),
    destinationCountry: intent.destinationCountry.toUpperCase(),
    pinnedProvider: input.pinnedProvider ?? null,
    intent: intent as unknown as Record<string, unknown>,
  };
  const plan = await planPaymentRoute(organizationId, planInputFrom(base, loaded.candidates));
  const outcome = statusFromDecision(loaded.decision.status, plan);

  let row: PaymentRow;
  try {
    [row] = (await db
      .insert(payments)
      .values({
        organizationId,
        ...base,
        status: outcome.status,
        beneficiaryId: beneficiary.id,
        decisionId: loaded.decision.id,
        routePlan: plan as unknown as Record<string, unknown>,
        failureCode: outcome.failureCode,
        failureMessage: outcome.failureMessage,
        reference: input.reference,
        idempotencyKey: idempotencyKey ?? null,
        requestHash,
        createdBy: actor.userId,
      })
      .returning()) as [PaymentRow];
  } catch (error) {
    // Two concurrent requests with one Idempotency-Key: the loser returns the winner's row.
    if (idempotencyKey) {
      const [existing] = await db.select().from(payments).where(and(eq(payments.organizationId, organizationId), eq(payments.idempotencyKey, idempotencyKey))).limit(1);
      if (existing && existing.requestHash === requestHash) return { payment: existing, replayed: true };
    }
    throw error;
  }
  await recordEvent(row, "payment.created", null, row.status, actor.source === "admin" ? "admin" : actor.source, actor.userId, {
    decisionId: loaded.decision.id,
    decisionStatus: loaded.decision.status,
    candidates: plan.candidates.map((c) => c.providerSlug),
  });
  await emitWebhook(row, "payment.created");
  if (row.status !== "ready") await emitWebhook(row, EVENT_FOR_STATUS[row.status]!);
  return { payment: row, replayed: false };
}

async function getOwnedPayment(organizationId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new PaymentError("not_found", "Payment not found.", 404);
  const db = await getDb();
  const [row] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.organizationId, organizationId))).limit(1);
  if (!row) throw new PaymentError("not_found", "Payment not found.", 404);
  return row;
}

/** Pulls a payment forward once its decision is approved (the approval itself lives in Approvals). */
export async function syncAuthorization(payment: PaymentRow, actor: PaymentActor): Promise<PaymentRow> {
  if (payment.status !== "requires_approval" || !payment.decisionId) return payment;
  const auth = await decisionAuthorization(payment.organizationId, payment.decisionId);
  if (auth.authorized) return transition(payment, "ready", "system", actor.userId, {}, { reason: auth.reason });
  return payment;
}

async function ensureFreshAuthorization(payment: PaymentRow, actor: PaymentActor, deps: PaymentDeps): Promise<PaymentRow> {
  const auth = payment.decisionId ? await decisionAuthorization(payment.organizationId, payment.decisionId) : { authorized: false, reason: "decision_not_found" };
  if (auth.authorized) return payment;
  if (!["revalidation_required", "policy_changed", "decision_not_found"].includes(auth.reason)) {
    return transition(payment, "blocked", "system", actor.userId, { failureCode: auth.reason, failureMessage: `Policy decision no longer authorizes this payment (${auth.reason.replaceAll("_", " ")}).` });
  }
  // The decision expired or the policy changed: evaluate again under the current policy.
  const loaded = await decide(payment.organizationId, PaymentIntent.parse(payment.intent), payment.pinnedProvider, actor.userId, deps);
  const plan = await planPaymentRoute(payment.organizationId, planInputFrom(payment, loaded.candidates));
  const outcome = statusFromDecision(loaded.decision.status, plan);
  const db = await getDb();
  const [updated] = await db
    .update(payments)
    .set({ decisionId: loaded.decision.id, routePlan: plan as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(payments.id, payment.id))
    .returning();
  await recordEvent(payment, "decision.refreshed", payment.status, payment.status, "system", actor.userId, { decisionId: loaded.decision.id, decisionStatus: loaded.decision.status });
  if (outcome.status === "ready") return updated!;
  return transition(updated!, outcome.status, "system", actor.userId, { failureCode: outcome.failureCode, failureMessage: outcome.failureMessage });
}

async function resolveExecutor(payment: PaymentRow, executor: RouteExecutor): Promise<{ adapter: PayoutAdapter; credentials: Record<string, string>; connectionId: string; environment: ConnectionEnvironment } | { error: string }> {
  if (executor.kind === "railor_sandbox") {
    if (payment.mode !== "test") return { error: "The sandbox rail cannot carry live payments." };
    return { adapter: sandboxPayoutAdapter, credentials: {}, connectionId: SANDBOX_CONNECTION_ID, environment: "sandbox" };
  }
  const db = await getDb();
  const [row] = await db
    .select({ connection: providerConnections, slug: providers.slug })
    .from(providerConnections)
    .innerJoin(providers, eq(providerConnections.providerId, providers.id))
    .where(and(eq(providerConnections.id, executor.connectionId), eq(providerConnections.organizationId, payment.organizationId)))
    .limit(1);
  if (!row || row.connection.status !== "connected") return { error: "The provider connection is no longer connected." };
  const expected: ConnectionEnvironment = payment.mode === "live" ? "production" : "sandbox";
  if (row.connection.environment !== expected) return { error: `A ${payment.mode} payment cannot use a ${row.connection.environment} connection.` };
  const adapter = getPayoutAdapter(row.slug);
  if (!adapter) return { error: `Railor cannot execute payouts through ${row.slug}.` };
  const credentials = connectionCredentials(row.connection);
  if (!credentials) return { error: "The connection has no stored credentials." };
  return { adapter, credentials, connectionId: row.connection.id, environment: row.connection.environment };
}

async function beneficiaryRef(
  adapter: PayoutAdapter,
  credentials: Record<string, string>,
  beneficiary: PayoutBeneficiary,
  providerSlug: string,
  connectionId: string,
  environment: ConnectionEnvironment,
): Promise<string | undefined> {
  if (!adapter.ensureBeneficiary) return undefined;
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(beneficiaryProviderRefs)
    .where(and(eq(beneficiaryProviderRefs.beneficiaryId, beneficiary.id), eq(beneficiaryProviderRefs.connectionId, connectionId)))
    .limit(1);
  if (existing) return existing.providerRef;
  const { providerRef } = await adapter.ensureBeneficiary(credentials, beneficiary, { environment, idempotencyKey: randomUUID() });
  await db.insert(beneficiaryProviderRefs).values({ beneficiaryId: beneficiary.id, providerSlug, connectionId, providerRef }).onConflictDoNothing();
  return providerRef;
}

function attemptStatusFor(status: NormalizedTransferStatus): (typeof paymentAttempts.$inferSelect)["status"] {
  return status === "completed" ? "completed" : status === "failed" ? "failed" : status === "returned" ? "returned" : status === "cancelled" ? "cancelled" : "accepted";
}

export async function submitPayment(organizationId: string, actor: PaymentActor, paymentId: string, deps: PaymentDeps = {}) {
  let payment = await getOwnedPayment(organizationId, paymentId);
  payment = await syncAuthorization(payment, actor);
  if (payment.status === "requires_approval") throw new PaymentError("approval_required", "This payment is waiting for an independent approval (see Approvals).", 409);
  if (payment.status !== "ready") throw new PaymentError("not_submittable", `A ${payment.status.replaceAll("_", " ")} payment cannot be submitted.`, 409);

  const flags = await getPlatformPaymentFlags();
  if (flags.paused) throw new PaymentError("payments_paused", `Payments are paused by Railor operations${flags.pausedReason ? `: ${flags.pausedReason}` : ""}.`, 503);
  if (payment.mode === "live") {
    if (actor.role !== undefined && actor.role !== null && actor.role !== "owner" && actor.role !== "admin") {
      throw new PaymentError("forbidden", "Only workspace owners and admins can send live payments.", 403);
    }
    await liveGate(organizationId, Number(payment.amount), payment.id);
  }

  payment = await ensureFreshAuthorization(payment, actor, deps);
  if (payment.status !== "ready") return getPaymentDetail(organizationId, payment.id);

  const planAge = Date.now() - new Date(String((payment.routePlan as { generatedAt?: string }).generatedAt ?? 0)).getTime();
  if (!Number.isFinite(planAge) || planAge > PLAN_MAX_AGE_MS) {
    const loaded = payment.decisionId ? await loadDecision(organizationId, payment.decisionId) : null;
    if (loaded) {
      const plan = await planPaymentRoute(organizationId, planInputFrom(payment, loaded.candidates));
      const db = await getDb();
      [payment] = (await db.update(payments).set({ routePlan: plan as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(payments.id, payment.id)).returning()) as [PaymentRow];
      await recordEvent(payment, "route.replanned", "ready", "ready", "system", actor.userId, { candidates: plan.candidates.map((c) => c.providerSlug) });
    }
  }

  // Claim: exactly one submit wins, however many clicks or API retries arrive.
  payment = await transition(payment, "submitting", actor.source, actor.userId, { submittedBy: actor.userId, submittedAt: new Date() });

  const settings = await getOrgPaymentSettings(organizationId);
  const plan = payment.routePlan as unknown as PaymentRoutePlan;
  const maxAttempts = settings.fallbackEnabled ? settings.maxAttempts : 1;
  const candidates = (plan.candidates ?? []).slice(0, maxAttempts);
  const beneficiary = await loadPayoutBeneficiary(organizationId, payment.beneficiaryId);
  const db = await getDb();
  let lastRejection: { code: string; message: string } | null = null;

  for (const [index, candidate] of candidates.entries()) {
    const attemptNumber = index + 1;
    const resolved = await resolveExecutor(payment, candidate.executor);
    const idempotencyKey = randomUUID();
    const base = {
      paymentId: payment.id,
      organizationId,
      attemptNumber,
      providerSlug: candidate.providerSlug,
      executor: candidate.executor.kind === "railor_sandbox" ? ("railor_sandbox" as const) : ("provider" as const),
      idempotencyKey,
    };
    if ("error" in resolved) {
      await db.insert(paymentAttempts).values({ ...base, environment: payment.mode === "live" ? "production" : "sandbox", status: "rejected", errorCode: "executor_unavailable", errorMessage: resolved.error });
      await recordEvent(payment, "attempt.skipped", "submitting", "submitting", "system", actor.userId, { attemptNumber, provider: candidate.providerSlug, reason: resolved.error });
      lastRejection = { code: "executor_unavailable", message: resolved.error };
      continue;
    }

    let providerRef: string | undefined;
    try {
      providerRef = await beneficiaryRef(resolved.adapter, resolved.credentials, beneficiary, candidate.providerSlug, resolved.connectionId, resolved.environment);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Beneficiary registration failed.";
      await db.insert(paymentAttempts).values({ ...base, environment: resolved.environment, connectionId: resolved.connectionId, status: "rejected", errorCode: "beneficiary_registration_failed", errorMessage: message });
      await recordEvent(payment, "attempt.rejected", "submitting", "submitting", "system", actor.userId, { attemptNumber, provider: candidate.providerSlug, code: "beneficiary_registration_failed" });
      lastRejection = { code: "beneficiary_registration_failed", message };
      continue;
    }

    const request: PayoutRequest = {
      paymentId: payment.id,
      attemptNumber,
      idempotencyKey,
      amount: payment.amount,
      sourceCurrency: payment.sourceCurrency,
      sourceNetwork: (payment.intent as { sourceNetwork?: string }).sourceNetwork,
      destinationCurrency: payment.destinationCurrency,
      destinationCountry: payment.destinationCountry,
      beneficiary,
      beneficiaryProviderRef: providerRef,
      reference: payment.reference ?? undefined,
      environment: resolved.environment,
    };
    // Durable before the call: if this process dies mid-request the attempt is
    // still on record (pending) and reconciliation replays the same key.
    const [attempt] = await db
      .insert(paymentAttempts)
      .values({
        ...base,
        environment: resolved.environment,
        connectionId: resolved.connectionId,
        status: "pending",
        requestSnapshot: { amount: request.amount, sourceCurrency: request.sourceCurrency, sourceNetwork: request.sourceNetwork ?? null, destinationCurrency: request.destinationCurrency, beneficiaryMethod: beneficiary.method },
      })
      .returning();

    let outcome: PayoutOutcome;
    try {
      outcome = await resolved.adapter.createPayout(resolved.credentials, request);
    } catch (error) {
      outcome = { kind: "unknown", message: `Adapter error: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}` };
    }

    if (outcome.kind === "accepted") {
      await db
        .update(paymentAttempts)
        .set({ status: attemptStatusFor(outcome.status), providerReference: outcome.providerReference, providerStatus: outcome.providerStatus, responseSnapshot: outcome.response ?? null, updatedAt: new Date() })
        .where(eq(paymentAttempts.id, attempt!.id));
      await recordEvent(payment, "attempt.accepted", "submitting", "submitting", "system", actor.userId, { attemptNumber, provider: candidate.providerSlug, executor: base.executor, reference: outcome.providerReference });
      payment = await transition(payment, outcome.status, "system", actor.userId, {
        selectedProvider: candidate.providerSlug,
        providerReference: outcome.providerReference,
        recipientAmount: outcome.recipientAmount ?? null,
        feeAmount: outcome.feeAmount ?? null,
        feeCurrency: outcome.feeCurrency ?? null,
        depositInstructions: outcome.depositInstructions ?? null,
        failureCode: null,
        failureMessage: null,
      });
      return getPaymentDetail(organizationId, payment.id);
    }

    if (outcome.kind === "unknown") {
      await db.update(paymentAttempts).set({ status: "unknown", errorMessage: outcome.message, updatedAt: new Date() }).where(eq(paymentAttempts.id, attempt!.id));
      payment = await transition(payment, "unknown", "system", actor.userId, { selectedProvider: candidate.providerSlug, failureCode: "outcome_unknown", failureMessage: outcome.message }, { attemptNumber });
      return getPaymentDetail(organizationId, payment.id);
    }

    await db.update(paymentAttempts).set({ status: "rejected", errorCode: outcome.code, errorMessage: outcome.message, updatedAt: new Date() }).where(eq(paymentAttempts.id, attempt!.id));
    await recordEvent(payment, "attempt.rejected", "submitting", "submitting", "system", actor.userId, { attemptNumber, provider: candidate.providerSlug, code: outcome.code, retryableElsewhere: outcome.retryableElsewhere });
    lastRejection = { code: outcome.code, message: outcome.message };
    if (!outcome.retryableElsewhere) break;
  }

  payment = await transition(payment, "failed", "system", actor.userId, {
    failureCode: lastRejection?.code ?? "no_route_accepted",
    failureMessage: lastRejection?.message ?? "No provider accepted this payment.",
  });
  return getPaymentDetail(organizationId, payment.id);
}

export async function cancelPayment(organizationId: string, actor: PaymentActor, paymentId: string) {
  const payment = await getOwnedPayment(organizationId, paymentId);
  if (!["requires_approval", "ready", "blocked"].includes(payment.status)) {
    throw new PaymentError("not_cancellable", "Once a provider has the payment, cancelling has to happen with that provider.", 409);
  }
  await transition(payment, "cancelled", actor.source, actor.userId);
  return getPaymentDetail(organizationId, paymentId);
}

/* ----------------------------------------------------------------------------
 * Provider status: webhooks + reconciliation
 * ------------------------------------------------------------------------- */

const PAYMENT_EDGES: Record<string, PaymentStatus[]> = {
  submitting: ["awaiting_funds", "processing", "completed", "failed", "returned", "cancelled", "unknown"],
  unknown: ["awaiting_funds", "processing", "completed", "failed", "returned", "cancelled"],
  awaiting_funds: ["processing", "completed", "failed", "returned", "cancelled"],
  processing: ["completed", "failed", "returned", "cancelled"],
  completed: ["returned"],
};

async function applyProviderStatus(
  attempt: typeof paymentAttempts.$inferSelect,
  update: { status?: NormalizedTransferStatus; providerStatus?: string; providerReference?: string; failureMessage?: string },
  source: "provider_webhook" | "reconciler",
) {
  const db = await getDb();
  if (update.status) {
    await db
      .update(paymentAttempts)
      .set({
        status: attemptStatusFor(update.status),
        providerStatus: update.providerStatus ?? attempt.providerStatus,
        providerReference: update.providerReference ?? attempt.providerReference,
        updatedAt: new Date(),
      })
      .where(eq(paymentAttempts.id, attempt.id));
  }
  const [payment] = await db.select().from(payments).where(eq(payments.id, attempt.paymentId)).limit(1);
  if (!payment || !update.status) return { changed: false };
  const to = update.status as PaymentStatus;
  if (payment.status === to || !(PAYMENT_EDGES[payment.status] ?? []).includes(to)) return { changed: false };
  await transition(payment, to, source, null, {
    selectedProvider: attempt.providerSlug,
    providerReference: update.providerReference ?? attempt.providerReference ?? payment.providerReference,
    ...(to === "failed" || to === "returned" ? { failureCode: `provider_${to}`, failureMessage: update.failureMessage ?? `Provider reported ${update.providerStatus ?? to}.` } : {}),
  }, { providerStatus: update.providerStatus });
  return { changed: true };
}

async function adapterForAttempt(attempt: typeof paymentAttempts.$inferSelect, organizationId: string) {
  if (attempt.executor === "railor_sandbox") return { adapter: sandboxPayoutAdapter, credentials: {} as Record<string, string> };
  if (!attempt.connectionId) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(providerConnections)
    .where(and(eq(providerConnections.id, attempt.connectionId), eq(providerConnections.organizationId, organizationId)))
    .limit(1);
  const adapter = getPayoutAdapter(attempt.providerSlug);
  const credentials = row ? connectionCredentials(row) : null;
  return adapter && credentials ? { adapter, credentials } : null;
}

/** Asks the provider what happened to one open payment and applies the answer. */
export async function reconcilePayment(paymentId: string) {
  const db = await getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment || !OPEN_STATUSES.has(payment.status)) return { paymentId, outcome: "not_open" as const };
  const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.paymentId, paymentId)).orderBy(desc(paymentAttempts.attemptNumber)).limit(1);
  if (!attempt) return { paymentId, outcome: "no_attempt" as const };
  const resolved = await adapterForAttempt(attempt, payment.organizationId);
  if (!resolved) {
    await recordEvent(payment, "reconcile.skipped", payment.status, payment.status, "reconciler", null, { reason: "connection_unavailable" });
    return { paymentId, outcome: "connection_unavailable" as const };
  }

  const lookup = await resolved.adapter.getPayout(resolved.credentials, {
    providerReference: attempt.providerReference ?? undefined,
    idempotencyKey: attempt.idempotencyKey,
    environment: attempt.environment,
    createdAt: attempt.createdAt,
  });
  if (lookup.found) {
    const result = await applyProviderStatus(attempt, lookup, "reconciler");
    return { paymentId, outcome: result.changed ? ("updated" as const) : ("unchanged" as const) };
  }

  if (attempt.status === "unknown" || attempt.status === "pending") {
    // No reference to look up: replay the identical request under the same
    // idempotency key. The provider returns the original transfer if it took
    // it, or creates it now if it never arrived — either way exactly once.
    const beneficiary = await loadPayoutBeneficiary(payment.organizationId, payment.beneficiaryId);
    const [ref] = await db
      .select()
      .from(beneficiaryProviderRefs)
      .where(and(eq(beneficiaryProviderRefs.beneficiaryId, beneficiary.id), eq(beneficiaryProviderRefs.connectionId, attempt.connectionId ?? SANDBOX_CONNECTION_ID)))
      .limit(1);
    let outcome: PayoutOutcome;
    try {
      outcome = await resolved.adapter.createPayout(resolved.credentials, {
        paymentId: payment.id,
        attemptNumber: attempt.attemptNumber,
        idempotencyKey: attempt.idempotencyKey,
        amount: payment.amount,
        sourceCurrency: payment.sourceCurrency,
        sourceNetwork: (payment.intent as { sourceNetwork?: string }).sourceNetwork,
        destinationCurrency: payment.destinationCurrency,
        destinationCountry: payment.destinationCountry,
        beneficiary,
        beneficiaryProviderRef: ref?.providerRef,
        reference: payment.reference ?? undefined,
        environment: attempt.environment,
      });
    } catch (error) {
      outcome = { kind: "unknown", message: error instanceof Error ? error.message : "Adapter error." };
    }
    if (outcome.kind === "accepted") {
      await applyProviderStatus(attempt, { status: outcome.status, providerStatus: outcome.providerStatus, providerReference: outcome.providerReference }, "reconciler");
      return { paymentId, outcome: "updated" as const };
    }
    if (outcome.kind === "rejected") {
      await db.update(paymentAttempts).set({ status: "rejected", errorCode: outcome.code, errorMessage: outcome.message, updatedAt: new Date() }).where(eq(paymentAttempts.id, attempt.id));
      await transition(payment, "failed", "reconciler", null, { failureCode: outcome.code, failureMessage: outcome.message });
      return { paymentId, outcome: "updated" as const };
    }
  }
  await recordEvent(payment, "reconcile.pending", payment.status, payment.status, "reconciler", null, { attemptNumber: attempt.attemptNumber });
  return { paymentId, outcome: "pending" as const };
}

export async function reconcileOpenPayments(options: { limit?: number; organizationId?: string } = {}) {
  const db = await getDb();
  const stale = new Date(Date.now() - 15_000);
  const open = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        inArray(payments.status, ["submitting", "awaiting_funds", "processing", "unknown"]),
        lt(payments.updatedAt, stale),
        options.organizationId ? eq(payments.organizationId, options.organizationId) : sql`true`,
      ),
    )
    .orderBy(payments.updatedAt)
    .limit(options.limit ?? 50);
  const results = [];
  for (const { id } of open) {
    try {
      results.push(await reconcilePayment(id));
    } catch (error) {
      results.push({ paymentId: id, outcome: "error" as const, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return results;
}

/** Inbound provider webhook: verify, deduplicate, apply. Unverifiable events are refused, never trusted. */
export async function ingestProviderWebhook(providerSlug: string, connectionId: string, headers: Headers, rawBody: string) {
  const adapter = getPayoutAdapter(providerSlug);
  if (!adapter?.verifyWebhook || !adapter.parseWebhook) throw new PaymentError("unsupported", "This provider's status is reconciled by polling.", 404);
  if (!z.string().uuid().safeParse(connectionId).success) throw new PaymentError("not_found", "Unknown connection.", 404);
  const db = await getDb();
  const [connection] = await db
    .select({ connection: providerConnections, slug: providers.slug })
    .from(providerConnections)
    .innerJoin(providers, eq(providerConnections.providerId, providers.id))
    .where(eq(providerConnections.id, connectionId))
    .limit(1);
  if (!connection || connection.slug !== providerSlug) throw new PaymentError("not_found", "Unknown connection.", 404);
  const credentials = connectionCredentials(connection.connection);
  if (!credentials || !adapter.verifyWebhook(credentials, headers, rawBody)) throw new PaymentError("invalid_signature", "Webhook signature did not verify.", 401);
  const event = adapter.parseWebhook(rawBody);
  if (!event) return { outcome: "ignored" as const };
  const inserted = await db
    .insert(providerWebhookEvents)
    .values({ providerSlug, connectionId, eventId: event.eventId, payloadHash: sha256Hex(rawBody), outcome: "received" })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) return { outcome: "duplicate" as const };
  const [attempt] = await db
    .select()
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.providerSlug, providerSlug), eq(paymentAttempts.connectionId, connectionId), eq(paymentAttempts.providerReference, event.providerReference)))
    .limit(1);
  if (!attempt) return { outcome: "unmatched" as const };
  const result = await applyProviderStatus(attempt, { status: event.status ?? undefined, providerStatus: event.providerStatus }, "provider_webhook");
  return { outcome: result.changed ? ("applied" as const) : ("unchanged" as const) };
}

/** Operator action for a payment stuck in `unknown` after checking the provider's dashboard by hand. */
export async function resolveUnknownPayment(paymentId: string, adminUserId: string, outcome: "completed" | "failed", note: string) {
  const db = await getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) throw new PaymentError("not_found", "Payment not found.", 404);
  if (payment.status !== "unknown") throw new PaymentError("not_unknown", "Only a payment in `unknown` can be resolved by hand.", 409);
  await transition(payment, outcome, "admin", adminUserId, outcome === "failed" ? { failureCode: "resolved_by_operator", failureMessage: note.slice(0, 300) } : {}, { note: note.slice(0, 500) });
}

/* ----------------------------------------------------------------------------
 * Reads + serialization
 * ------------------------------------------------------------------------- */

export function serializePayment(p: PaymentRow) {
  const plan = p.routePlan as unknown as Partial<PaymentRoutePlan>;
  return {
    object: "payment",
    id: p.id,
    mode: p.mode,
    livemode: p.mode === "live",
    status: p.status,
    amount: p.amount,
    source_currency: p.sourceCurrency,
    destination_currency: p.destinationCurrency,
    destination_country: p.destinationCountry,
    beneficiary_id: p.beneficiaryId,
    decision_id: p.decisionId,
    pinned_provider: p.pinnedProvider,
    selected_provider: p.selectedProvider,
    provider_reference: p.providerReference,
    recipient_amount: p.recipientAmount,
    fee_amount: p.feeAmount,
    fee_currency: p.feeCurrency,
    deposit_instructions: p.depositInstructions,
    failure_code: p.failureCode,
    failure_message: p.failureMessage,
    reference: p.reference,
    route: {
      preset: plan.preset ?? null,
      generated_at: plan.generatedAt ?? null,
      candidates: (plan.candidates ?? []).map((c) => ({ provider: c.providerSlug, score: c.score, confidence: c.confidence, executor: c.executor.kind })),
      excluded: (plan.excluded ?? []).map((e) => ({ provider: e.providerSlug, reason: e.reason })),
    },
    created_at: p.createdAt.toISOString(),
    submitted_at: p.submittedAt?.toISOString() ?? null,
    completed_at: p.completedAt?.toISOString() ?? null,
  };
}

export async function listPayments(organizationId: string, options: { mode?: PaymentMode; status?: string; limit?: number; before?: Date } = {}) {
  const db = await getDb();
  return db
    .select({ payment: payments, beneficiaryLabel: beneficiaries.label, beneficiaryHint: beneficiaries.displayHint })
    .from(payments)
    .innerJoin(beneficiaries, eq(payments.beneficiaryId, beneficiaries.id))
    .where(
      and(
        eq(payments.organizationId, organizationId),
        options.mode ? eq(payments.mode, options.mode) : sql`true`,
        options.status ? eq(payments.status, options.status as PaymentStatus) : sql`true`,
        options.before ? lt(payments.createdAt, options.before) : sql`true`,
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(Math.min(options.limit ?? 50, 100));
}

export async function getPaymentDetail(organizationId: string, id: string) {
  const payment = await getOwnedPayment(organizationId, id);
  const db = await getDb();
  const [attempts, events, beneficiary, decision] = await Promise.all([
    db.select().from(paymentAttempts).where(eq(paymentAttempts.paymentId, id)).orderBy(paymentAttempts.attemptNumber),
    db.select().from(paymentEvents).where(eq(paymentEvents.paymentId, id)).orderBy(paymentEvents.createdAt),
    db.select().from(beneficiaries).where(eq(beneficiaries.id, payment.beneficiaryId)).limit(1),
    payment.decisionId ? db.select({ id: decisions.id, status: decisions.status }).from(decisions).where(eq(decisions.id, payment.decisionId)).limit(1) : Promise.resolve([]),
  ]);
  return {
    payment,
    attempts,
    events,
    beneficiary: beneficiary[0] ? summarizeBeneficiary(beneficiary[0]) : null,
    decision: decision[0] ?? null,
  };
}

/** Operations view across every organization (Railor admins only — enforced by the caller). */
export async function listAllPayments(options: { status?: string; mode?: PaymentMode; limit?: number } = {}) {
  const db = await getDb();
  return db
    .select({ payment: payments, organizationName: organizations.name })
    .from(payments)
    .innerJoin(organizations, eq(payments.organizationId, organizations.id))
    .where(and(options.status ? eq(payments.status, options.status as PaymentStatus) : sql`true`, options.mode ? eq(payments.mode, options.mode) : sql`true`))
    .orderBy(desc(payments.createdAt))
    .limit(Math.min(options.limit ?? 100, 200));
}

export async function paymentStats(options: { organizationId?: string; sinceDays?: number } = {}) {
  const db = await getDb();
  const since = new Date(Date.now() - (options.sinceDays ?? 30) * 86_400_000);
  const rows = await db
    .select({ mode: payments.mode, status: payments.status, currency: payments.sourceCurrency, n: sql<number>`count(*)::int`, volume: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(and(gte(payments.createdAt, since), options.organizationId ? eq(payments.organizationId, options.organizationId) : sql`true`))
    .groupBy(payments.mode, payments.status, payments.sourceCurrency);
  // Volume stays per currency: summing USDC and INR into one number would be meaningless.
  return rows.map((r) => ({ mode: r.mode, status: r.status, currency: r.currency, count: r.n, volume: Number(r.volume) }));
}
