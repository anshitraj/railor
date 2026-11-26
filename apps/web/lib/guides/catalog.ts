/**
 * The guides Railor publishes: the part of each one that menus, cards and the
 * home page need. The article text itself lives in `content.ts`, so a menu
 * never ships a whole article to the browser.
 */

export type GuideTopic = "start" | "ways" | "bank" | "rates" | "india";

export interface GuideTopicInfo {
  id: GuideTopic;
  label: string;
  blurb: string;
}

export const GUIDE_TOPICS: readonly GuideTopicInfo[] = [
  { id: "start", label: "Getting started", blurb: "Send money abroad for the first time, and know what it really costs." },
  { id: "ways", label: "Ways to send money", blurb: "Bank transfer, debit card or credit card: what changes for you." },
  { id: "bank", label: "Bank details", blurb: "The numbers you need from the person receiving the money." },
  { id: "rates", label: "Best rates", blurb: "Live comparisons for the routes people search for most." },
  { id: "india", label: "India guides", blurb: "Send money from India, receive it, and follow the rules that apply." },
];

export interface GuideMeta {
  slug: string;
  title: string;
  /** One sentence, written for someone searching for the answer. */
  summary: string;
  topic: GuideTopic;
  minutes: number;
  /** ISO date the facts in the guide were last checked. */
  updated: string;
  /** Currency symbols and country flags drawn on the guide's card. */
  art: { symbols: readonly [string, string?]; flags: readonly [string, string?] };
  /** An illustrated banner for the card and the article, drawn for this guide. Falls back to the coin art. */
  banner?: string;
  /** The route the guide's "Compare this route" button opens in Convert currencies. */
  route: { from: string; to: string; country: string; label: string };
  /** Routes shown as live comparison cards in the article. Defaults to the guide's own route. */
  compare?: ReadonlyArray<{ from: string; to: string; country: string }>;
  /** A guide that shows today's ranking from Railor's own price check. */
  live?: boolean;
  /** A guide built around a live "providers at a glance" table that can be switched between routes. */
  glance?: boolean;
}

export const GUIDES: readonly GuideMeta[] = [
  {
    slug: "how-to-send-money-abroad",
    title: "How to send money abroad, step by step",
    summary: "What to decide, what to ask the person receiving it and how to compare before you pay.",
    topic: "start",
    minutes: 7,
    updated: "2026-11-25",
    art: { symbols: ["$", "€"], flags: ["US", "DE"] },
    banner: "/images/guides/how-to-send-money-abroad.svg",
    route: { from: "USD", to: "EUR", country: "DE", label: "USD to EUR" },
  },
  {
    slug: "real-cost-of-sending-money",
    title: "The real cost of sending money: fees and the exchange-rate markup",
    summary: "Why “no fee” can still cost you, and the one number to compare instead.",
    topic: "start",
    minutes: 6,
    updated: "2026-11-25",
    art: { symbols: ["%", "$"], flags: ["US", "GB"] },
    banner: "/images/guides/real-cost-of-sending-money.svg",
    route: { from: "USD", to: "GBP", country: "GB", label: "USD to GBP" },
  },
  {
    slug: "send-money-to-india",
    title: "How to send money from the US to India",
    summary: "Bank deposit, UPI or cash pickup: what the receiver needs and how to get the most rupees.",
    topic: "start",
    minutes: 7,
    updated: "2026-11-25",
    art: { symbols: ["$", "₹"], flags: ["US", "IN"] },
    banner: "/images/guides/send-money-to-india.svg",
    route: { from: "USD", to: "INR", country: "IN", label: "USD to INR" },
  },
  {
    slug: "debit-card-vs-bank-transfer",
    title: "Bank transfer, debit card or credit card: how to pay for a transfer",
    summary: "The way you pay changes the fee, the speed and the protection you get.",
    topic: "ways",
    minutes: 6,
    updated: "2026-11-25",
    art: { symbols: ["$", "£"], flags: ["US", "GB"] },
    banner: "/images/guides/debit-card-vs-bank-transfer.svg",
    route: { from: "USD", to: "GBP", country: "GB", label: "USD to GBP" },
  },
  {
    slug: "iban-swift-bic-explained",
    title: "IBAN, SWIFT, routing number, sort code and IFSC explained",
    summary: "Which bank details each country uses, so you ask for the right ones the first time.",
    topic: "bank",
    minutes: 6,
    updated: "2026-11-25",
    art: { symbols: ["€", "£"], flags: ["DE", "GB"] },
    banner: "/images/guides/iban-swift-bic-explained.svg",
    route: { from: "USD", to: "EUR", country: "DE", label: "USD to EUR" },
  },
  {
    slug: "usd-to-inr",
    title: "Top 10 ways to send US dollars to India, ranked live",
    summary: "The ten services Railor checks for USD to INR, ordered by the rupees that arrive.",
    topic: "rates",
    minutes: 5,
    updated: "2026-11-25",
    art: { symbols: ["$", "₹"], flags: ["US", "IN"] },
    banner: "/images/guides/usd-to-inr.svg",
    route: { from: "USD", to: "INR", country: "IN", label: "USD to INR" },
    live: true,
  },
  {
    slug: "best-money-transfer-services",
    title: "The best money transfer services, ranked live",
    summary: "How to choose, and a table of the providers that can serve your route, built from today's prices rather than opinion.",
    topic: "rates",
    minutes: 9,
    updated: "2026-11-26",
    art: { symbols: ["$", "€"], flags: ["US", "DE"] },
    banner: "/images/guides/best-money-transfer-services.jpg",
    route: { from: "USD", to: "EUR", country: "DE", label: "USD to EUR" },
    glance: true,
  },
  {
    slug: "send-money-from-india-to-usa",
    title: "How to send money from India to the USA: LRS rules, documents and cost",
    summary: "The limit, the paperwork, what to ask the person in the US for, and how to compare what arrives.",
    topic: "india",
    minutes: 12,
    updated: "2026-11-26",
    art: { symbols: ["₹", "$"], flags: ["IN", "US"] },
    banner: "/images/guides/send-money-from-india-to-usa.jpg",
    route: { from: "INR", to: "USD", country: "US", label: "INR to USD" },
    compare: [{ from: "INR", to: "USD", country: "US" }],
  },
  {
    slug: "best-money-transfer-app-in-india",
    title: "Best money transfer app in India: what to check before you pick one",
    summary: "Eight checks that tell you which app suits your route, and how to compare them fairly.",
    topic: "india",
    minutes: 9,
    updated: "2026-11-26",
    art: { symbols: ["₹", "$"], flags: ["IN", "US"] },
    banner: "/images/guides/best-money-transfer-app-in-india.jpg",
    route: { from: "INR", to: "USD", country: "US", label: "INR to USD" },
    compare: [{ from: "INR", to: "USD", country: "US" }, { from: "INR", to: "GBP", country: "GB" }],
  },
  {
    slug: "cheapest-way-to-send-money-abroad-from-india",
    title: "Cheapest way to send money abroad from India",
    summary: "The four parts of the cost and how to find the lowest one for your amount.",
    topic: "india",
    minutes: 9,
    updated: "2026-11-26",
    art: { symbols: ["₹", "£"], flags: ["IN", "GB"] },
    banner: "/images/guides/cheapest-way-to-send-money-abroad-from-india.jpg",
    route: { from: "INR", to: "GBP", country: "GB", label: "INR to GBP" },
    compare: [{ from: "INR", to: "USD", country: "US" }, { from: "INR", to: "GBP", country: "GB" }, { from: "INR", to: "AED", country: "AE" }],
  },
  {
    slug: "lrs-limit-and-tcs-explained",
    title: "LRS limit and TCS on foreign remittances, explained",
    summary: "What resident individuals can send abroad each year, what tax at source means, and where to check the current numbers.",
    topic: "india",
    minutes: 8,
    updated: "2026-11-26",
    art: { symbols: ["₹", "$"], flags: ["IN", "US"] },
    banner: "/images/guides/lrs-limit-and-tcs-explained.jpg",
    route: { from: "INR", to: "USD", country: "US", label: "INR to USD" },
    compare: [{ from: "INR", to: "USD", country: "US" }],
  },
  {
    slug: "receive-money-from-abroad-in-india",
    title: "How to receive money from abroad in India",
    summary: "For freelancers, small businesses and families: ways to get paid, the paperwork, and how to compare the rupees you receive.",
    topic: "india",
    minutes: 9,
    updated: "2026-11-26",
    art: { symbols: ["$", "₹"], flags: ["US", "IN"] },
    banner: "/images/guides/receive-money-from-abroad-in-india.jpg",
    route: { from: "USD", to: "INR", country: "IN", label: "USD to INR" },
    compare: [{ from: "USD", to: "INR", country: "IN" }, { from: "GBP", to: "INR", country: "IN" }, { from: "EUR", to: "INR", country: "IN" }],
  },
  {
    slug: "send-money-from-india-to-uk",
    title: "How to send money from India to the UK",
    summary: "Sort code and account number, the rules, and what to compare to get the most pounds across.",
    topic: "india",
    minutes: 7,
    updated: "2026-11-26",
    art: { symbols: ["₹", "£"], flags: ["IN", "GB"] },
    banner: "/images/guides/send-money-from-india-to-uk.jpg",
    route: { from: "INR", to: "GBP", country: "GB", label: "INR to GBP" },
    compare: [{ from: "INR", to: "GBP", country: "GB" }],
  },
  {
    slug: "send-money-from-india-to-canada",
    title: "How to send money from India to Canada",
    summary: "Transit, institution and account numbers, the rules, and how to compare what arrives in Canadian dollars.",
    topic: "india",
    minutes: 7,
    updated: "2026-11-26",
    art: { symbols: ["₹", "$"], flags: ["IN", "CA"] },
    banner: "/images/guides/send-money-from-india-to-canada.jpg",
    route: { from: "INR", to: "CAD", country: "CA", label: "INR to CAD" },
    compare: [{ from: "INR", to: "CAD", country: "CA" }],
  },
  {
    slug: "send-money-from-india-to-australia",
    title: "How to send money from India to Australia",
    summary: "BSB and account number, the rules, and how to compare what arrives in Australian dollars.",
    topic: "india",
    minutes: 7,
    updated: "2026-11-26",
    art: { symbols: ["₹", "$"], flags: ["IN", "AU"] },
    banner: "/images/guides/send-money-from-india-to-australia.jpg",
    route: { from: "INR", to: "AUD", country: "AU", label: "INR to AUD" },
    compare: [{ from: "INR", to: "AUD", country: "AU" }],
  },
  {
    slug: "send-money-from-india-to-uae",
    title: "How to send money from India to the UAE",
    summary: "IBAN details, the rules, and how to compare how many dirhams arrive.",
    topic: "india",
    minutes: 7,
    updated: "2026-11-26",
    art: { symbols: ["₹", "د"], flags: ["IN", "AE"] },
    banner: "/images/guides/send-money-from-india-to-uae.jpg",
    route: { from: "INR", to: "AED", country: "AE", label: "INR to AED" },
    compare: [{ from: "INR", to: "AED", country: "AE" }],
  },
  {
    slug: "send-money-from-india-to-singapore",
    title: "How to send money from India to Singapore",
    summary: "Bank code and account number, the rules, and how to compare what arrives in Singapore dollars.",
    topic: "india",
    minutes: 7,
    updated: "2026-11-26",
    art: { symbols: ["₹", "$"], flags: ["IN", "SG"] },
    banner: "/images/guides/send-money-from-india-to-singapore.jpg",
    route: { from: "INR", to: "SGD", country: "SG", label: "INR to SGD" },
    compare: [{ from: "INR", to: "SGD", country: "SG" }],
  },
  {
    slug: "send-money-abroad-for-study-from-india",
    title: "How to send money abroad for study from India",
    summary: "Tuition and living costs, the documents banks ask for, tax collected at source, and how to compare.",
    topic: "india",
    minutes: 10,
    updated: "2026-11-26",
    art: { symbols: ["₹", "$"], flags: ["IN", "US"] },
    banner: "/images/guides/send-money-abroad-for-study-from-india.jpg",
    route: { from: "INR", to: "USD", country: "US", label: "INR to USD" },
    compare: [{ from: "INR", to: "USD", country: "US" }, { from: "INR", to: "GBP", country: "GB" }, { from: "INR", to: "CAD", country: "CA" }],
  },
  {
    slug: "swift-charges-our-sha-ben-explained",
    title: "SWIFT charges explained: OUR, SHA and BEN",
    summary: "Why the amount that arrives is sometimes smaller, and how to choose who pays the bank charges.",
    topic: "bank",
    minutes: 6,
    updated: "2026-11-26",
    art: { symbols: ["$", "€"], flags: ["US", "DE"] },
    banner: "/images/guides/swift-charges-our-sha-ben-explained.jpg",
    route: { from: "INR", to: "USD", country: "US", label: "INR to USD" },
  },
  {
    slug: "is-this-money-transfer-service-safe-in-india",
    title: "Is this money transfer service safe? How to check in India",
    summary: "Who is authorised to handle foreign remittances, how to check a service and the warning signs of a scam.",
    topic: "india",
    minutes: 7,
    updated: "2026-11-26",
    art: { symbols: ["₹", "$"], flags: ["IN", "US"] },
    banner: "/images/guides/is-this-money-transfer-service-safe-in-india.jpg",
    route: { from: "INR", to: "USD", country: "US", label: "INR to USD" },
  },
  {
    slug: "send-money-to-india-nre-nro-accounts",
    title: "Sending money to India: NRE, NRO and resident accounts",
    summary: "The account types, what to ask the person receiving in India, and how to compare the rupees that arrive.",
    topic: "india",
    minutes: 8,
    updated: "2026-11-26",
    art: { symbols: ["$", "₹"], flags: ["US", "IN"] },
    banner: "/images/guides/send-money-to-india-nre-nro-accounts.jpg",
    route: { from: "USD", to: "INR", country: "IN", label: "USD to INR" },
    compare: [{ from: "USD", to: "INR", country: "IN" }, { from: "GBP", to: "INR", country: "IN" }],
  },
];

export function guideBySlug(slug: string): GuideMeta | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

export function guidesInTopic(topic: GuideTopic): GuideMeta[] {
  return GUIDES.filter((guide) => guide.topic === topic);
}

export const guideHref = (slug: string) => `/guides/${slug}`;

/**
 * Guides about a currency pair, best match first: the same pair in either
 * direction, then guides that end in or start from one of its currencies, and
 * general guides to fill the row, so the calculator always has several to show.
 */
export function relatedGuides(from: string, to: string, limit = 4): GuideMeta[] {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  const score = (guide: GuideMeta) => {
    const routes = [guide.route, ...(guide.compare ?? [])];
    let points = 0;
    if (routes.some((route) => route.from === a && route.to === b)) points += 6;
    else if (routes.some((route) => route.from === b && route.to === a)) points += 4;
    if (routes.some((route) => route.to === b)) points += 2;
    if (routes.some((route) => route.from === a)) points += 1;
    if (routes.some((route) => route.to === a || route.from === b)) points += 1;
    return points;
  };
  const ranked = GUIDES.map((guide, index) => ({ guide, index, points: score(guide) })).sort((x, y) => y.points - x.points || x.index - y.index);
  const matched = ranked.filter((item) => item.points >= 4).slice(0, limit).map((item) => item.guide);
  const general = GUIDES.filter((guide) => guide.topic === "start" && !matched.includes(guide));
  return [...matched, ...general, ...ranked.map((item) => item.guide).filter((guide) => !matched.includes(guide) && !general.includes(guide))].slice(0, limit);
}
