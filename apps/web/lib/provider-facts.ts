/**
 * What a provider itself publishes about its fees, limits and tax treatment,
 * kept apart from the price check so a statement is only ever shown with the
 * page it came from. Each entry is a paraphrase of the provider's own page and
 * names it; a provider with no entry shows "not published" instead of a guess.
 * Client-safe: plain data, no server imports.
 */
export interface ProviderFact {
  /** One or more plain sentences, each of which the source page supports. */
  lines: string[];
  sources: Array<{ label: string; url: string }>;
}

export interface ProviderFacts {
  fees?: ProviderFact;
  limits?: ProviderFact;
  tax?: ProviderFact;
  /** When Railor last read the pages above. */
  reviewedAt: string;
}

const WISE_FEES = { label: "Wise · Fees for sending money", url: "https://wise.com/help/articles/2522717/fees-for-sending-money" };
const WISE_PRICING = { label: "Wise · Fees for sending money (US)", url: "https://wise.com/us/pricing/send-money" };
const WISE_USD = { label: "Wise · Guide to USD transfers", url: "https://wise.com/help/articles/2932150/guide-to-usd-transfers" };
const WISE_EUR = { label: "Wise · Send money to Europe", url: "https://wise.com/us/send-money/send-money-to-europe" };

/** Wise's per-currency limits, as its guides state them. Only currencies Railor has read are listed. */
const WISE_LIMITS: Record<string, { line: string; source: { label: string; url: string } }> = {
  USD: { line: "Sending US dollars: up to 1 million USD per local ACH transfer, and up to 20 million USD per local wire transfer when paid from USD in your Wise account.", source: WISE_USD },
  EUR: { line: "Sending to euros: up to 6 million EUR per transfer. Above 1.2 million EUR the money has to come from your Wise account.", source: WISE_EUR },
};

/** Statements for a provider on a route, or null when Railor has read none for it. */
export function providerFacts(slug: string, route: { from: string; to: string }): ProviderFacts | null {
  const key = slug.replace(/^market:/, "").toLowerCase();
  if (key !== "wise" && key !== "wise-business") return null;
  const limitLines = [route.from, route.to].flatMap((code) => WISE_LIMITS[code] ? [WISE_LIMITS[code]!] : []);
  return {
    reviewedAt: "2026-11-26",
    fees: {
      lines: [
        "Wise’s fee is worked out as a percentage of the amount you send, plus a fixed fee. The percentage varies by the currency you send, the currency the recipient gets and how you pay. Some ways to pay are free and others carry a fee.",
        "Wise publishes the percentage for each currency on its pricing page; the figure in this price is the one the quote used.",
      ],
      sources: [WISE_FEES, WISE_PRICING],
    },
    limits: {
      lines: [
        "Wise has limits on how much you can send. They depend on the currencies you send to and from, and how you pay.",
        ...limitLines.map((entry) => entry.line),
      ],
      sources: [WISE_PRICING, ...limitLines.map((entry) => entry.source)],
    },
  };
}

/** The provider's own words are never replaced by Railor's placeholder: these are the placeholders. */
export const isPlaceholder = (text: string | null | undefined): boolean => !text || /unconfirmed|not verified|no verified|not supplied|confirm (at|with)|must be confirmed|no unlimited/i.test(text);
