import { z } from "zod";

/** Account holder, not the overseas payer. Freelance income is commercial. */
export const CustomerContext = z.object({
  profile: z.enum(["business", "freelancer", "sole_proprietor"]),
  country: z.string().regex(/^[A-Z]{2}$/),
  direction: z.enum(["send", "receive"]),
  purpose: z.enum(["services", "goods", "salary", "personal"]),
});
export type CustomerContext = z.infer<typeof CustomerContext>;
export interface ProviderProfileAssessment {
  status: "documented" | "not_supported" | "unconfirmed";
  reasons: string[];
  verification: string[];
  fees: string;
  limits: string;
  corridors: string;
  settlement: string[];
  documents: string[];
  purpose: string;
  /** Whether this price source describes the selected account/product. */
  priceApplicable: boolean;
  sources: Array<{ label: string; url: string }>;
  reviewedAt: string | null;
}
const WISE_VERIFY = "https://wise.com/help/articles/6Kpm9pXlJW79OGAktSnHos/how-to-verify-your-indian-business-to-receive-payments";
const WISE_RECEIVE = "https://wise.com/help/articles/71lNXW0Ls3gEFhUH8PtodV/receiving-payments-for-indian-businesses";
const WISE_FREELANCE = "https://wise.com/help/articles/65UX5SOb5YxtgZx0V2bSLw/providing-additional-payment-information-for-your-inr-transfer";
const SKYDO_SIGNUP = "https://www.skydo.com/blog/how-to-sign-up-on-skydo";
const BUSINESS_CURRENCIES = "USD GBP EUR SGD AUD NZD HUF CAD HKD TRY PHP AED BGN CHF CNY CZK DKK ILS JPY NOK PLN SEK UGX ZAR".split(" ");
const FREELANCE_CURRENCIES = "EUR GBP USD AUD CAD NZD SGD HUF".split(" ");
const SKYDO_LOCAL_CURRENCIES = "USD GBP AED CAD EUR AUD SGD".split(" ");

/** Published product rules, never an assertion that the customer passed KYC. */
export function assessCustomerProfile(slug: string, context: CustomerContext, request: {
  sourceCurrency: string; destinationCurrency: string; amount: number;
  amountUsd: number | null; referenceRate: number | null;
}): ProviderProfileAssessment {
  const unknown: ProviderProfileAssessment = {
    status: "unconfirmed", reasons: ["No verified rules for this account holder, country and payment product yet."],
    verification: ["Confirm legal form, ownership checks and account-name requirements with the provider."],
    fees: "Account and purpose-specific fees are unconfirmed; the displayed price remains a reference.",
    limits: "Not verified for this product. No unlimited-transfer assumption.",
    corridors: "Currency coverage alone does not establish account or payer-country eligibility.",
    settlement: ["Not verified for this account and product."],
    documents: ["Provider confirmation required."], purpose: "Not verified for this purpose.",
    priceApplicable: false, sources: [], reviewedAt: null,
  };
  const provider = slug.replace(/^market:/, "");
  if (!["wise", "skydo"].includes(provider) || context.country !== "IN" || context.direction !== "receive") return unknown;
  const individualName = context.profile === "freelancer";
  const a: ProviderProfileAssessment = {
    ...unknown, status: "documented", reasons: ["Published Indian export-collection rules match this profile. Provider onboarding, industry and payer-country checks still apply."],
    reviewedAt: "2026-10-07",
    purpose: context.purpose === "services" ? "Commercial service-export income; validate the provider's purpose code and industry restrictions." : "This evidence does not establish support for the selected purpose.",
  };
  if (provider === "wise") {
    const currencies = context.profile === "business" ? BUSINESS_CURRENCIES : FREELANCE_CURRENCIES;
    a.verification = [individualName ? "Personal PAN and an INR bank account in your personal name; identity verification." : context.profile === "sole_proprietor" ? "Personal PAN, business registration and an INR bank account in the trading name; identity verification." : "Entity registration, business PAN, bank ownership and owner/director verification; exact requirements depend on legal form."];
    a.documents = [individualName ? "Invoice or matched payment request and payer details." : context.profile === "sole_proprietor" ? "Registration identifier plus separate business proof, invoice and payer details." : "Constitution and ownership documents appropriate to the entity; invoice and payer details.", "e-FIRC is issued for the receipt."];
    a.fees = "Conversion fee plus USD 2 equivalent for e-FIRC; 18% GST on conversion and e-FIRC fees. Anonymous sender quotes do not price this receiving-account product.";
    a.limits = "Per receipt: minimum USD 5 equivalent; maximum INR 2,500,000 equivalent. Confirm the accepted amount with Wise before payment.";
    a.corridors = `${currencies.join(", ")} into INR; payer-country restrictions must also be checked.`;
    a.settlement = ["Automatic conversion and payout to the verified Indian INR bank account; these receiving details cannot hold balances or send money."];
    a.sources = [{ label: "Wise verification", url: WISE_VERIFY }, { label: "Wise receiving product and limits", url: WISE_RECEIVE }, { label: "Wise freelance currencies and invoices", url: WISE_FREELANCE }, { label: "Wise receiving fees", url: "https://wise.com/in/pricing/receive/" }];
    if (!currencies.includes(request.sourceCurrency) || request.destinationCurrency !== "INR") {
      a.status = "not_supported";
      a.reasons = ["The selected currencies are outside the documented receiving product for this profile."];
      if (context.profile !== "business" && BUSINESS_CURRENCIES.includes(request.sourceCurrency) && request.destinationCurrency === "INR") {
        a.status = "unconfirmed";
        a.reasons = ["Wise's general business page lists this currency, but its freelancer-specific page does not. Confirm the profile-specific receiving access with Wise."];
      }
    }
    if ((request.amountUsd !== null && request.amountUsd < 5) || (request.referenceRate !== null && request.amount * request.referenceRate > 2_500_000)) {
      a.status = "not_supported";
      a.reasons.push("This amount is outside the published receiving limits at the reference rate.");
    }
    if (a.status === "documented" && (request.amountUsd === null || request.referenceRate === null)) {
      a.status = "unconfirmed";
      a.reasons = ["A reference rate is missing, so the amount cannot be checked against both published receiving limits."];
    }
    // A public send quote and an Indian receiving-account quote are different products.
    a.priceApplicable = false;
  } else {
    a.verification = [context.profile === "business" ? "Business PAN, entity and beneficial-owner checks." : "Personal PAN for freelancers and sole proprietors; owner identity checks.", "Bank-account ownership and Aadhaar/DigiLocker verification."];
    a.documents = ["Recent bank statements showing foreign receipts, a signed client contract or alternative evidence requested during onboarding.", ...(context.profile === "business" ? ["Entity documents as applicable, such as a partnership deed."] : []), "FIRA accompanies export receipts; confirm purpose-specific documents."];
    a.fees = "Published export-collection slabs and 18% GST apply. No documented freelancer discount is assumed; negotiated account pricing can differ.";
    a.limits = "A product-specific numeric minimum or maximum has not been verified. Check onboarding and account limits.";
    a.corridors = `Local collections in ${SKYDO_LOCAL_CURRENCIES.join(", ")} into India. Other currencies may use SWIFT; confirm the exact route and sender country.`;
    a.settlement = ["Overseas local collection accounts, followed by INR settlement to your Indian bank account; confirm account-specific timing."];
    a.sources = [{ label: "Skydo onboarding", url: SKYDO_SIGNUP }, { label: "Skydo local collection currencies", url: "https://www.skydo.com/faqs/international-accounts?q=faq-19" }, { label: "Skydo prices", url: "https://www.skydo.com/" }, { label: "Skydo terms and restricted industries", url: "https://www.skydo.com/terms-of-use" }];
    a.priceApplicable = true;
    if (request.destinationCurrency !== "INR") {
      a.status = "not_supported"; a.reasons = ["This documented product settles into an Indian INR account."];
    } else if (!SKYDO_LOCAL_CURRENCIES.includes(request.sourceCurrency)) {
      a.status = "unconfirmed"; a.reasons = ["This source currency needs confirmation of the SWIFT product and its fees."]; a.priceApplicable = false;
    }
  }
  if (context.purpose !== "services" && a.status !== "not_supported") {
    a.status = "unconfirmed";
    a.reasons = ["The selected purpose needs a separate product and purpose-code review; export-service rules cannot approve it."];
    a.priceApplicable = false;
  }
  return a;
}
