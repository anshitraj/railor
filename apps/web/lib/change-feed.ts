import "server-only";
import { loadChangeFeed, loadPlatformCounts } from "@railor/core";
import { CHANGE_KIND_LABEL } from "@railor/types";
import type { FeedItem } from "../components/app/change-feed";

/** Server → client shape for the change timeline (dates as ISO, labels resolved). */
export async function loadFeedItems(limit: number): Promise<{ items: FeedItem[]; providersMonitored: number; now: string }> {
  const [feed, counts] = await Promise.all([loadChangeFeed({ limit }), loadPlatformCounts()]);
  return {
    now: new Date().toISOString(),
    providersMonitored: counts.providers,
    items: feed.map(({ change, providerName, providerSlug }) => ({
      id: change.id,
      kind: change.kind,
      label: CHANGE_KIND_LABEL[change.kind] ?? change.kind,
      field: change.field,
      previous: change.previousValue,
      current: change.currentValue,
      summary: change.summary,
      detectedAt: change.detectedAt.toISOString(),
      confidence: Number(change.confidence),
      status: change.reviewStatus,
      providerName,
      providerSlug,
      affects: (change.affects ?? {}) as Record<string, string>,
    })),
  };
}
