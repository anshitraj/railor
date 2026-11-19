import type { CustomerContext } from "@railor/core";
import { providerIdentity } from "./price-display";
import { contextParams } from "./price-response";

export interface TransferBookmark {
  from: string;
  to: string;
  amount: number;
  destinationCountry?: string;
  profile?: string;
  context?: CustomerContext;
  provider?: { slug: string; name: string };
}

export function savedProviderSlug(value: unknown) {
  if (typeof value !== "string") return undefined;
  const slug = providerIdentity(value.trim());
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(slug) ? slug : undefined;
}

export function transferBookmarkKey(bookmark: Pick<TransferBookmark, "from" | "to" | "provider" | "context" | "destinationCountry">) {
  const { from, to, provider, context, destinationCountry } = bookmark;
  if (!provider) return `${from}:${to}`;
  return [from, to, provider.slug, context?.profile, context?.country, context?.direction, context?.purpose, context?.paymentMethod, destinationCountry].join(":");
}

export function savedTransferHref(bookmark: TransferBookmark) {
  const params = new URLSearchParams({ from: bookmark.from, to: bookmark.to, amount: String(bookmark.amount) });
  if (bookmark.context) {
    for (const [key, value] of Object.entries(contextParams(bookmark.context))) params.set(key, value);
  }
  if (bookmark.provider) params.set("provider", bookmark.provider.slug);
  if (bookmark.destinationCountry) params.set("destinationCountry", bookmark.destinationCountry);
  return `/app/prices?${params}`;
}
