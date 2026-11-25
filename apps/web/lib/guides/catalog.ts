/**
 * The guides Railor publishes: the part of each one that menus, cards and the
 * home page need. The article text itself lives in `content.ts`, so a menu
 * never ships a whole article to the browser.
 */

export type GuideTopic = "start" | "ways" | "bank" | "rates";

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
  /** A guide that shows today's ranking from Railor's own price check. */
  live?: boolean;
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
];

export function guideBySlug(slug: string): GuideMeta | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

export function guidesInTopic(topic: GuideTopic): GuideMeta[] {
  return GUIDES.filter((guide) => guide.topic === topic);
}

export const guideHref = (slug: string) => `/guides/${slug}`;
