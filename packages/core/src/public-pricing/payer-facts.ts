import type { CustomerContext } from "../customer-profiles.js";

/**
 * What a sender's service says about tax and receipts on a transfer into India,
 * read from each provider's own pages on 2026-11-18. These fill the "Tax
 * included" and "Receipt document" fields of public quotes and market
 * estimates, which carry no such data of their own.
 *
 * `null` means the provider's pages say nothing: shown as "not stated", never
 * guessed. A provider missing here has not been read, and its fields stay
 * unknown.
 */
export interface PayerFacts {
  /** The remittance document the provider says it issues, or null when its pages don't say. */
  receipt: string | null;
  /** Whether the provider's fee includes tax: null when its pages don't say. */
  taxIncluded: boolean | null;
  /** Tax wording when a plain yes/no would mislead. */
  taxNote?: string;
  sources: Array<{ label: string; url: string }>;
}

export const PAYER_FACTS_CHECKED = "2026-11-18";

const WISE_TAX = { label: "Wise: do I need to pay tax on transfers?", url: "https://wise.com/help/articles/2565007/do-i-need-to-pay-any-tax-on-transfers" };
const WISE_FIRC = { label: "Wise: FIRC, FIRA and NOC", url: "https://wise.com/help/articles/2655509/whats-a-foreign-inward-remittance-certificate-firc-and-how-can-i-request-one" };

const FACTS: Record<string, (context?: CustomerContext) => PayerFacts> = {
  wise: (context) => ({
    // Wise issues a No Objection Certificate to the sender, for business INR transfers only; the partner bank issues the FIRA from it.
    receipt: context?.profile === "personal"
      ? "None: Wise issues a NOC only for business INR transfers"
      : "No Objection Certificate (NOC) from your sender’s Wise account, which the partner bank turns into a FIRA. Business INR transfers only",
    taxIncluded: null,
    taxNote: "Any tax on Wise’s fee is either included in it or shown separately at payment, and never reduces what you receive. Wise withholds no tax on the money.",
    sources: [WISE_TAX, WISE_FIRC],
  }),
  remitly: () => ({
    receipt: null, taxIncluded: false,
    taxNote: "No: Remitly’s agreement makes the sender pay any applicable taxes on top of its fees",
    sources: [{ label: "Remitly agreement (taxes)", url: "https://remitly.com/us/en/home/agreement-business" }],
  }),
  xoom: () => ({
    receipt: null, taxIncluded: null,
    taxNote: "Not stated for the fee. Xoom’s payout amount excludes any tax or charge levied under Indian law (“Local Taxes”)",
    sources: [{ label: "Xoom user agreement", url: "https://xoom.com/user-agreement" }],
  }),
  "world-remit": () => ({
    receipt: null, taxIncluded: null,
    taxNote: "Not stated for the fee. WorldRemit says no tax is payable on money sent to family and friends in India",
    sources: [{ label: "WorldRemit: sending to India", url: "https://worldremit.com/en/India" }],
  }),
  "western-union": () => ({
    receipt: null, taxIncluded: false,
    taxNote: "No: Western Union charges its transfer fee plus any applicable taxes",
    sources: [{ label: "Western Union online terms", url: "https://westernunion.com/us/en/legal/terms-conditions.html" }],
  }),
  ofx: () => ({
    receipt: null, taxIncluded: false,
    sources: [{ label: "OFX fee schedule (US)", url: "https://ofx.com/en-us/legal/fee-schedule" }],
  }),
};

/** Facts for a sender's service paying INR into India, or null when its pages haven't been read. */
export function payerFacts(slug: string, context?: CustomerContext): PayerFacts | null {
  const facts = FACTS[slug.replace(/^market:/, "").toLowerCase()];
  return facts ? facts(context) : null;
}
