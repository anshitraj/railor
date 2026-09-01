/**
 * Which pages to read for a given provider.
 *
 * Two sources, in order of trust:
 *  1. A curated list of the provider's own coverage/pricing/docs pages. These
 *     are the pages that actually carry capability facts, and hand-picking
 *     them beats any query — a provider's "supported countries" table is
 *     worth more than ten blog posts about them.
 *  2. Tavily discovery, restricted to the provider's own domains, for
 *     providers with no curated list yet. Restricting to their domains is the
 *     point: this pipeline records what a provider says about itself, not
 *     what the press says about it.
 */
import { tavilySearch } from "../country-research/tavily.js";

/**
 * Pages that state ENTITY eligibility — which jurisdictions a business can
 * *sign up from* — as opposed to where money can land.
 *
 * These are tracked separately because they answer a different question and
 * are the scarcer of the two. A "supported countries" payout table says money
 * reaches Kenya; it says nothing about whether a Kenyan company may open the
 * account. The eligibility engine treats those as independent facts (a
 * receiving_endpoints row is mapped to `entityCountry: null` on purpose), and
 * a corridor only exists where one provider has both. Without these pages the
 * route graph can never contain a real provider, however many payout
 * destinations it accumulates.
 */
export const ENTITY_ELIGIBILITY_TARGETS: Record<string, string[]> = {
  wise: [
    "https://wise.com/help/articles/2932708/which-countries-can-i-open-a-wise-business-account-from",
    "https://wise.com/gb/business/",
  ],
  airwallex: [
    "https://www.airwallex.com/docs/onboarding/supported-countries-and-regions",
    "https://help.airwallex.com/hc/en-gb/articles/900004308326",
  ],
  payoneer: ["https://www.payoneer.com/about/supported-countries/"],
  stripe: ["https://stripe.com/global", "https://docs.stripe.com/connect/cross-border-payouts"],
  nium: ["https://www.nium.com/coverage"],
  rapyd: ["https://docs.rapyd.net/en/countries-and-currencies.html"],
  dlocal: ["https://docs.dlocal.com/reference/country-reference"],
  thunes: ["https://www.thunes.com/network/"],
  zerohash: ["https://zerohash.com/licensing/"],
  banxa: ["https://banxa.com/supported-countries/"],
  "ramp-network": ["https://docs.ramp.network/supported-countries-payment-methods"],
  bitso: ["https://bitso.com/business"],
  tazapay: ["https://tazapay.com/coverage"],
  flutterwave: ["https://flutterwave.com/us/countries"],
  bvnk: ["https://www.bvnk.com/legal/licences"],
};

/**
 * Curated per-provider targets. Deliberately the provider's own coverage,
 * pricing and reference pages — the surfaces where capability facts live.
 */
export const CURATED_TARGETS: Record<string, string[]> = {
  "yellow-card": [
    "https://docs.yellowcard.engineering/docs/supported-countries",
    "https://docs.yellowcard.engineering/docs/getting-started",
    "https://yellowcard.io/",
  ],
  moonpay: [
    "https://www.moonpay.com/supported-countries",
    "https://www.moonpay.com/pricing",
    "https://dev.moonpay.com/docs/on-ramp-overview",
  ],
  coinbase: [
    "https://docs.cdp.coinbase.com/onramp-&-offramp/introduction/welcome",
    "https://docs.cdp.coinbase.com/onramp-&-offramp/support/supported-countries-payment-methods",
  ],
  transak: [
    "https://transak.com/crypto-coverage",
    "https://transak.com/global-coverage",
    "https://docs.transak.com/docs/fees-and-limits",
  ],
  wise: [
    "https://wise.com/help/articles/2571942/which-currencies-can-i-use-with-wise",
    "https://wise.com/gb/pricing/",
  ],
  bvnk: [
    "https://docs.bvnk.com/docs/supported-currencies-and-networks",
    "https://www.bvnk.com/products/global-settlement",
  ],
  conduit: ["https://conduitpay.com/", "https://docs.conduit.financial/"],
  brale: ["https://docs.brale.xyz/docs/supported-networks", "https://brale.xyz/platform"],
  "mural-pay": [
    "https://developers.muralpay.com/docs/supported-countries-and-currencies",
    "https://www.muralpay.com/",
  ],
  ripple: ["https://ripple.com/solutions/cross-border-payments/", "https://docs.ripple.com/"],
  circle: ["https://www.circle.com/multi-chain-usdc", "https://developers.circle.com/stablecoins/supported-blockchains"],
  bridge: ["https://apidocs.bridge.xyz/", "https://www.bridge.xyz/"],
  paxos: ["https://www.paxos.com/usdp", "https://docs.paxos.com/"],
  airwallex: ["https://www.airwallex.com/docs/accounts/supported-regions-and-currencies"],
  payoneer: ["https://www.payoneer.com/en-in/multi-currency-account/", "https://www.payoneer.com/en-in/digital-firc/"],
  dashx: ["https://dashx.xyz/"],
  skydo: ["https://www.skydo.com/features/global-remittances", "https://www.skydo.com/pricing"],
  xflow: ["https://www.xflowpay.com/products/stablecoins"],
  tether: ["https://tether.to/en/supported-protocols/"],
  ethena: ["https://docs.ethena.fi/"],
};

/**
 * Queries aimed at the "who can become a customer" page rather than the
 * "where can money go" page. Kept separate from the coverage queries because
 * a search for "supported countries" reliably returns the payout table, which
 * is the fact we already have and not the one we're missing.
 */
const ENTITY_QUERIES = (name: string) => [
  `${name} which countries can open a business account`,
  `${name} eligible countries to sign up register business`,
  `${name} account opening supported countries onboarding`,
];

const COVERAGE_QUERIES = (name: string) => [
  `${name} supported countries and currencies`,
  `${name} supported stablecoins and blockchain networks`,
  `${name} pricing fees`,
];

/**
 * Discovers the provider's own coverage pages via Tavily, restricted to the
 * domains it actually owns. Returns [] rather than throwing when Tavily finds
 * nothing — an empty target list is a real answer, not a failure.
 *
 * `mode: "entity"` swaps in the account-opening queries; hand-guessing those
 * URLs produced 404s that silently redirected to marketing pages, which then
 * yielded coverage facts labelled as eligibility. Searching for the page beats
 * guessing its path.
 */
export async function discoverTargets(
  providerName: string,
  domains: string[],
  mode: "coverage" | "entity" = "coverage",
): Promise<string[]> {
  if (domains.length === 0) return [];
  const queries = mode === "entity" ? ENTITY_QUERIES(providerName) : COVERAGE_QUERIES(providerName);

  const found = new Set<string>();
  for (const query of queries) {
    try {
      const response = await tavilySearch(query, { maxResults: 5, includeDomains: domains });
      for (const result of response.results) found.add(result.url);
    } catch {
      // One failed query never sinks discovery — the other queries still count.
    }
  }
  return [...found];
}

/** Host (and its www-stripped form) for a provider's website/docs URLs. */
export function domainsFor(websiteUrl: string | null, docsUrl: string | null): string[] {
  const hosts = new Set<string>();
  for (const raw of [websiteUrl, docsUrl]) {
    if (!raw) continue;
    try {
      hosts.add(new URL(raw).hostname.replace(/^www\./, ""));
    } catch {
      // A malformed stored URL just contributes no domain.
    }
  }
  return [...hosts];
}
