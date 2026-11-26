import { providerLink, providerSite, type ProviderLink } from "./provider-sites";

/**
 * The "Taking you to ..." page. A link to a provider goes through /go/<slug>
 * with the transfer in the address, so the page can say where you are going,
 * and the destination is always worked out here from the slug: the address never
 * carries a URL, so the page can't be used to send anyone to a site that isn't
 * a provider's own.
 */
const CODE = /^[A-Z]{3}$/;
const slugKey = (slug: string) => slug.replace(/^market:/, "").toLowerCase();

/** The address of the redirect page for a provider and transfer; null when Railor has no site for the provider. */
export function goHref(slug: string, transfer?: { from: string; to: string; amount: number }): string | null {
  const key = slugKey(slug);
  if (!providerSite(key)) return null;
  const params = new URLSearchParams();
  if (transfer && CODE.test(transfer.from.toUpperCase()) && CODE.test(transfer.to.toUpperCase()) && transfer.amount > 0 && Number.isFinite(transfer.amount)) {
    params.set("from", transfer.from.toUpperCase());
    params.set("to", transfer.to.toUpperCase());
    params.set("amount", String(Math.round(transfer.amount * 100) / 100));
  }
  const query = params.toString();
  return `/go/${encodeURIComponent(key)}${query ? `?${query}` : ""}`;
}

/** Where the redirect page sends the visitor: the provider's own page for this transfer, or its homepage. */
export function goDestination(slug: string, query: { from?: string; to?: string; amount?: string }): ProviderLink | null {
  const key = slugKey(slug);
  const site = providerSite(key);
  if (!site) return null;
  const from = (query.from ?? "").toUpperCase();
  const to = (query.to ?? "").toUpperCase();
  const amount = Number(query.amount);
  const link = CODE.test(from) && CODE.test(to) && amount > 0 && Number.isFinite(amount) ? providerLink(key, { from, to, amount }) : null;
  return link ?? { href: site, carries: "home" };
}
