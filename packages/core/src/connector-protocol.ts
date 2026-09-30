import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PaymentIntent } from "@railor/types";

/** No account credentials or bank details cross this protocol. */
export const ConnectorCommand = z.object({
  version: z.literal(1), id: z.string().uuid(), installationId: z.string().uuid(), organizationId: z.string().uuid(),
  decisionId: z.string().uuid(), decisionHash: z.string().regex(/^[a-f0-9]{64}$/),
  provider: z.string().regex(/^[a-z0-9-]{1,100}$/), intent: PaymentIntent,
  operation: z.enum(["simulate_transfer", "get_quote"]),
  idempotencyKey: z.string().min(8).max(128), expiresAt: z.string().datetime(),
}).strict();
export type ConnectorCommand = z.infer<typeof ConnectorCommand>;

export const ConnectorQuote = z.object({
  providerSlug: z.string().max(100), providerQuoteId: z.string().max(200).optional(),
  sourceAsset: z.string().max(30), sourceNetwork: z.string().max(50).optional(),
  destinationCurrency: z.string().max(10), destinationCountry: z.string().max(2).optional(),
  amount: z.number().finite().positive(), recipientAmount: z.number().finite().nonnegative().optional(),
  feeAmount: z.number().finite().nonnegative().optional(), feeCurrency: z.string().max(30).optional(),
  fxSpreadAmount: z.number().finite().nonnegative().optional(), networkFeeAmount: z.number().finite().nonnegative().optional(),
  payoutFeeAmount: z.number().finite().nonnegative().optional(), platformFeeAmount: z.number().finite().nonnegative().optional(),
  costPartial: z.boolean(), exchangeRate: z.string().max(60).optional(), estimatedArrivalMinutes: z.number().finite().nonnegative().optional(),
  quoteType: z.enum(["live", "indicative", "historical"]), accountContext: z.literal("customer_connected"),
  verificationType: z.enum(["provider_reported", "railor_observed", "provider_verified"]),
  observedAt: z.string().datetime(), expiresAt: z.string().datetime().optional(), quotedAt: z.string().datetime(),
});
export const ConnectorReceipt = z.object({
  jobId: z.string().uuid(), status: z.enum(["succeeded", "failed", "unknown"]),
  // Deliberately no arbitrary provider body: it could contain credentials/PII.
  code: z.enum(["simulated", "quoted", "invalid_command", "runtime_failure", "outcome_unknown"]),
  quote: ConnectorQuote.optional(),
  reference: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).optional(),
}).strict().superRefine((v, ctx) => {
  if ((v.status === "succeeded") !== ["simulated", "quoted"].includes(v.code) || (v.code === "quoted") !== Boolean(v.quote)) ctx.addIssue({ code: "custom", message: "Invalid receipt status/code" });
});

export function connectorTokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => [k, sort(val)])) : v;
  return JSON.stringify(sort(value));
}
export function signConnectorCommand(command: ConnectorCommand, tokenHash: string) {
  return createHmac("sha256", tokenHash).update(canonicalJson(ConnectorCommand.parse(command))).digest("hex");
}
export function verifyConnectorCommand(raw: unknown, signature: string, token: string, installationId: string, now = new Date()): ConnectorCommand {
  const command = ConnectorCommand.parse(raw);
  if (command.installationId !== installationId || new Date(command.expiresAt).getTime() <= now.getTime()) throw new Error("command_expired_or_wrong_installation");
  const expected = signConnectorCommand(command, connectorTokenHash(token));
  if (!/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"))) throw new Error("invalid_signature");
  return command;
}

/** Customer-side integration contract. Real payment adapters are deliberately
 * not loaded by the shipped sandbox runtime. Their release needs conformance
 * tests, provider idempotency guarantees and a separate live-execution rollout. */
export interface CustomerProviderAdapter {
  provider: string;
  quote(intent: PaymentIntent, credentials: Readonly<Record<string, string>>): Promise<import("./unified.js").UnifiedQuote>;
}
