import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  alerts,
  changeEvents,
  getDb,
  providers,
  savedCorridors,
  watchlists,
} from "@railor/database";
import { COUNTRY_TERMS, PRODUCT_TERMS } from "@railor/core";
import { ChangeKind, ProductType } from "@railor/types";
import { ApiError } from "./api-auth";
import { backfillWatchlistAlerts } from "./alerting";

export const WatchTarget = z.enum(["provider", "corridor", "country", "asset", "product"]);
export type WatchTarget = z.infer<typeof WatchTarget>;

export const WatchDigest = z.enum(["instant", "daily", "weekly"]);

export const WatchlistCreate = z.object({
  target_type: WatchTarget,
  target_id: z.string().min(1).max(120),
  label: z.string().min(1).max(160).optional(),
  kinds: z.array(ChangeKind).max(ChangeKind.options.length).optional(),
  channel_email: z.boolean().optional(),
  digest: WatchDigest.optional(),
});

export const WatchlistUpdate = z
  .object({
    label: z.string().min(1).max(160).optional(),
    kinds: z.array(ChangeKind).max(ChangeKind.options.length).optional(),
    channel_email: z.boolean().optional(),
    digest: WatchDigest.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update.",
  });

/** The change kinds a target type can meaningfully raise, mirrored from the UI defaults. */
const DEFAULT_KINDS: Record<WatchTarget, string[]> = {
  provider: [...ChangeKind.options],
  corridor: [
    "coverage_changed",
    "requirement_changed",
    "pricing_changed",
    "limit_changed",
    "service_degraded",
  ],
  country: ["coverage_changed", "requirement_changed", "product_launched", "product_removed"],
  asset: ["coverage_changed", "pricing_changed", "product_launched", "product_removed"],
  product: ["coverage_changed", "product_launched", "product_removed"],
};

type WatchlistRow = typeof watchlists.$inferSelect;

export function serializeWatchlist(row: WatchlistRow, unreadAlerts?: number) {
  return {
    object: "watchlist" as const,
    id: row.id,
    target_type: row.targetType,
    target_id: row.targetId,
    label: row.label,
    kinds: row.kinds,
    channel_email: row.channelEmail,
    digest: row.digest,
    ...(unreadAlerts !== undefined ? { unread_alerts: unreadAlerts } : {}),
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * Validates the watch target against the real world and derives a default
 * label. A corridor watch must point at one of the org's own saved corridors;
 * a provider watch must point at a mapped provider. Everything else is a
 * vocabulary check.
 */
export async function resolveTarget(
  organizationId: string,
  targetType: WatchTarget,
  rawTargetId: string,
): Promise<{ targetId: string; label: string }> {
  const db = await getDb();

  switch (targetType) {
    case "provider": {
      const slug = rawTargetId.toLowerCase();
      const [provider] = await db
        .select({ name: providers.name })
        .from(providers)
        .where(eq(providers.slug, slug))
        .limit(1);
      if (!provider) {
        throw new ApiError(404, "target_not_found", `No provider with slug "${slug}".`);
      }
      return { targetId: slug, label: provider.name };
    }
    case "corridor": {
      const [corridor] = await db
        .select()
        .from(savedCorridors)
        .where(eq(savedCorridors.id, rawTargetId))
        .limit(1);
      if (!corridor || corridor.organizationId !== organizationId) {
        throw new ApiError(
          404,
          "target_not_found",
          "No saved corridor with that id in this organization.",
        );
      }
      return { targetId: corridor.id, label: corridor.label };
    }
    case "country": {
      const code = rawTargetId.toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) {
        throw new ApiError(400, "invalid_request", "`target_id` must be an ISO 3166-1 alpha-2 code.");
      }
      const name = COUNTRY_TERMS.find((c) => c.code === code)?.name;
      return { targetId: code, label: name ?? code };
    }
    case "asset": {
      const symbol = rawTargetId.toUpperCase();
      return { targetId: symbol, label: symbol };
    }
    case "product": {
      const parsed = ProductType.safeParse(rawTargetId);
      if (!parsed.success) {
        throw new ApiError(
          400,
          "invalid_request",
          `Unknown product "${rawTargetId}". One of: ${ProductType.options.join(", ")}.`,
        );
      }
      const label = PRODUCT_TERMS.find((p) => p.product === parsed.data)?.label ?? parsed.data;
      return { targetId: parsed.data, label };
    }
  }
}

export async function createWatchlist(
  organizationId: string,
  createdBy: string | null,
  input: z.infer<typeof WatchlistCreate>,
) {
  const db = await getDb();
  const { targetId, label } = await resolveTarget(
    organizationId,
    input.target_type,
    input.target_id,
  );

  // Idempotent on (org, target): re-POSTing the same watch returns the row
  // that already exists instead of stacking duplicates.
  const [existing] = await db
    .select()
    .from(watchlists)
    .where(
      and(
        eq(watchlists.organizationId, organizationId),
        eq(watchlists.targetType, input.target_type),
        eq(watchlists.targetId, targetId),
      ),
    )
    .limit(1);
  if (existing) return { row: existing, created: false as const };

  const [row] = await db
    .insert(watchlists)
    .values({
      organizationId,
      targetType: input.target_type,
      targetId,
      label: input.label ?? label,
      kinds: input.kinds ?? DEFAULT_KINDS[input.target_type],
      channelEmail: input.channel_email ?? true,
      digest: input.digest ?? "instant",
      createdBy,
    })
    .returning();
  if (!row) throw new Error("watchlist insert failed");
  await backfillWatchlistAlerts(row.id);
  return { row, created: true as const };
}

/** Fetch a watchlist owned by the org — 404, never 403, across the boundary. */
export async function getOwnedWatchlist(organizationId: string, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(watchlists).where(eq(watchlists.id, id)).limit(1);
  if (!row || row.organizationId !== organizationId) {
    throw new ApiError(404, "watchlist_not_found", "No watchlist with that id.");
  }
  return row;
}

export async function listWatchlists(organizationId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(watchlists)
    .where(eq(watchlists.organizationId, organizationId))
    .orderBy(desc(watchlists.createdAt));

  if (!rows.length) return rows.map((r) => serializeWatchlist(r, 0));

  const counts = await db
    .select({ watchlistId: alerts.watchlistId, unread: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(eq(alerts.organizationId, organizationId), isNull(alerts.readAt)))
    .groupBy(alerts.watchlistId);
  const unread = new Map(counts.map((c) => [c.watchlistId, c.unread]));

  return rows.map((r) => serializeWatchlist(r, unread.get(r.id) ?? 0));
}

export async function listWatchlistAlerts(
  organizationId: string,
  watchlistId: string,
  limit: number,
) {
  const db = await getDb();
  return db
    .select({
      alert: alerts,
      change: changeEvents,
      providerName: providers.name,
      providerSlug: providers.slug,
    })
    .from(alerts)
    .innerJoin(changeEvents, eq(alerts.changeEventId, changeEvents.id))
    .innerJoin(providers, eq(changeEvents.providerId, providers.id))
    .where(and(eq(alerts.organizationId, organizationId), eq(alerts.watchlistId, watchlistId)))
    .orderBy(desc(changeEvents.detectedAt))
    .limit(limit);
}

export function serializeAlert({
  alert,
  change,
  providerName,
  providerSlug,
}: Awaited<ReturnType<typeof listWatchlistAlerts>>[number]) {
  return {
    object: "alert" as const,
    id: alert.id,
    read_at: alert.readAt?.toISOString() ?? null,
    change: {
      object: "change_event" as const,
      id: change.id,
      provider: { slug: providerSlug, name: providerName },
      kind: change.kind,
      field: change.field,
      previous_value: change.previousValue,
      current_value: change.currentValue,
      summary: change.summary,
      detected_at: change.detectedAt.toISOString(),
      confidence: Number(change.confidence),
      review_status: change.reviewStatus,
      affects: change.affects,
    },
  };
}
