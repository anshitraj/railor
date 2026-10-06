/** Public comparison aliases are provider identities, not separate account integrations. */
export function connectionProviderSlug(value: string): string {
  return value.replace(/^market:/, "").toLowerCase();
}

export function providerConnectionPath(providerSlug: string, mode: "app" | "public" = "app"): string {
  const path = `/app/settings/connections?${new URLSearchParams({ provider: connectionProviderSlug(providerSlug) })}`;
  return mode === "app" ? path : `/login?${new URLSearchParams({ next: path })}`;
}

export function priceSourceTime(observedAt: string, basis: string): string {
  const date = new Date(observedAt);
  const label = basis === "published" ? "Schedule reviewed" : "Collected";
  return Number.isFinite(date.getTime())
    ? `${label} ${date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`
    : "Collection time unavailable";
}
