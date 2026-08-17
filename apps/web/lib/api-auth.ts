import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { apiKeys, apiUsage, ensureMigrated, getDb } from "@railor/database";
import { randomUUID } from "node:crypto";
import { hashApiKey } from "./auth";

export interface ApiContext {
  organizationId: string;
  keyId: string;
  mode: "test" | "live";
  requestId: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Bearer-key authentication for /v1. Keys are stored hashed; the presented key
 * is hashed and compared, never looked up in plaintext.
 */
export async function authenticate(request: Request): Promise<ApiContext> {
  await ensureMigrated();
  const header = request.headers.get("authorization") ?? "";
  const presented = header.replace(/^Bearer\s+/i, "").trim();
  if (!presented) {
    throw new ApiError(401, "missing_api_key", "Provide an API key as `Authorization: Bearer rk_…`.");
  }

  const db = await getDb();
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(presented)), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!key) throw new ApiError(401, "invalid_api_key", "That API key is not valid.");

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));

  return {
    organizationId: key.organizationId,
    keyId: key.id,
    mode: key.mode,
    requestId: `req_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
  };
}

export async function recordUsage(
  context: ApiContext | null,
  endpoint: string,
  method: string,
  status: number,
  latencyMs: number,
) {
  if (!context) return;
  const db = await getDb();
  await db.insert(apiUsage).values({
    apiKeyId: context.keyId,
    organizationId: context.organizationId,
    endpoint,
    method,
    status,
    latencyMs,
  });
}

/** camelCase in the engine, snake_case on the wire — Stripe-shaped responses. */
export function snake<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const k = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[k] =
      v instanceof Date
        ? v.toISOString()
        : Array.isArray(v)
          ? v.map((item) =>
              item && typeof item === "object" && !(item instanceof Date)
                ? snake(item as Record<string, unknown>)
                : item instanceof Date
                  ? item.toISOString()
                  : item,
            )
          : v && typeof v === "object"
            ? snake(v as Record<string, unknown>)
            : v;
  }
  return out;
}

export function camelQuery(body: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    entity_country: "entityCountry",
    customer_type: "customerType",
    source_country: "sourceCountry",
    destination_country: "destinationCountry",
    asset: "sourceAsset",
    source_asset: "sourceAsset",
    network: "sourceNetwork",
    source_network: "sourceNetwork",
    destination_currency: "destinationCurrency",
    payment_method: "paymentMethod",
    amount_currency: "amountCurrency",
  };
  return Object.fromEntries(
    Object.entries(body).map(([k, v]) => [map[k] ?? k, v]),
  );
}
