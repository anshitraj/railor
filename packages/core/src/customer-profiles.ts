import { z } from "zod";
import { indiaReceivingAssessment } from "./public-pricing/receiving-products.js";

/** Account holder, not the overseas payer. Freelance income is commercial. */
export const CustomerContext = z.object({
  profile: z.enum(["business", "freelancer", "sole_proprietor", "personal"]),
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
const WISE_SEND_INDIA = "https://wise.com/us/send-money/send-money-to-india";
const WISE_INR_GUIDE = "https://wise.com/help/articles/2932151/guide-to-inr-transfers";
const SKYDO_VS_REMITLY = "https://www.skydo.com/compare/skydo-vs-remitly";
const PAYZOLL_AUDIENCE = "https://payzoll.finance/payzoll-vs-skydo";
const REVOLUT_INDIA_RECEIVE = "https://help.revolut.com/en-IN/help/transfers/bank-transfer-basics/question-receiving-a-bank-transfer/";
const BUSINESS_CURRENCIES = "USD GBP EUR SGD AUD NZD HUF CAD HKD TRY PHP AED BGN CHF CNY CZK DKK ILS JPY NOK PLN SEK UGX ZAR".split(" ");
const FREELANCE_CURRENCIES = "EUR GBP USD AUD CAD NZD SGD HUF".split(" ");
const SKYDO_LOCAL_CURRENCIES = "USD GBP AED CAD EUR AUD SGD".split(" ");

/** No verified rules yet: every field says so rather than guessing. */
export function unconfirmedAssessment(): ProviderProfileAssessment {
  return {
    status: "unconfirmed", reasons: ["No verified rules for this account holder, country and payment product yet."],
    verification: ["Confirm legal form, ownership checks and account-name requirements with the provider."],
    fees: "Account and purpose-specific fees are unconfirmed; the displayed price remains a reference.",
    limits: "Not verified for this product. No unlimited-transfer assumption.",
    corridors: "Currency coverage alone does not establish account or payer-country eligibility.",
    settlement: ["Not verified for this account and product."],
    documents: ["Provider confirmation required."], purpose: "Not verified for this purpose.",
    priceApplicable: false, sources: [], reviewedAt: null,
  };
}

/** Published product rules, never an assertion that the customer passed KYC. */
export function assessCustomerProfile(slug: string, context: CustomerContext, request: {
  sourceCurrency: string; destinationCurrency: string; amount: number;
  amountUsd: number | null; referenceRate: number | null;
}): ProviderProfileAssessment {
  const unknown = unconfirmedAssessment();
  const provider = slug.replace(/^market:/, "");
  const intoIndia = context.country === "IN" && context.direction === "receive" && request.destinationCurrency === "INR";
  // Revolut's UK converter prices a sender who already banks with Revolut; nobody in India can receive into it.
  if (provider === "revolut" && intoIndia) {
    return {
      ...unknown, status: "not_supported", priceApplicable: false, reviewedAt: "2026-10-08",
      reasons: ["You can't receive this payment into Revolut. Revolut India accepts domestic UPI only (NEFT/IMPS/RTGS aren't supported), and standard Revolut accounts can't hold INR. This UK converter rate only applies if your sender already holds a Revolut UK account, and it leaves out Revolut's transfer fee."],
      limits: "Revolut India: up to 25 UPI receipts or INR 400,000 a day, and INR 200,000 total balance.",
      settlement: ["Revolut India receives UPI only — no international bank transfers."],
      sources: [{ label: "Revolut India: how to receive money", url: REVOLUT_INDIA_RECEIVE }],
    };
  }
  // Export-collection evidence cannot establish eligibility for a personal account.
  const receivingProduct = indiaReceivingAssessment(provider, context, request);
  if (receivingProduct) return receivingProduct;
  if (context.profile === "personal") return intoIndia ? personalIntoIndia(provider, slug, request, unknown) : unknown;
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

/**
 * Personal money into an Indian bank account: the sender picks a remittance
 * service and the recipient only needs a bank account or UPI ID. Business
 * export-collection products don't carry family or personal remittances.
 */
function personalIntoIndia(provider: string, slug: string, request: { amount: number; referenceRate: number | null }, unknown: ProviderProfileAssessment): ProviderProfileAssessment {
  if (provider === "skydo" || provider === "payzoll") {
    const skydo = provider === "skydo";
    return {
      ...unknown, status: "not_supported", priceApplicable: false, reviewedAt: "2026-10-08",
      reasons: [skydo
        ? "Skydo collects export and business income (FIRA, export purpose codes). Its own comparison sends personal money and family support to consumer remittance apps."
        : "PayZoll lists SaaS companies, agencies, freelancers, global teams, exporters and international businesses. Personal or family money isn't a listed use."],
      purpose: "Business or export income only.",
      sources: [skydo ? { label: "Skydo vs Remitly: who each is for", url: SKYDO_VS_REMITLY } : { label: "Who PayZoll is for", url: PAYZOLL_AUDIENCE }],
    };
  }
  if (provider === "wise" && slug === "wise") {
    const inr = request.referenceRate === null ? null : request.amount * request.referenceRate;
    const tooLarge = inr !== null && inr > 100_000_000;
    return {
      ...unknown, status: tooLarge ? "not_supported" : "documented", priceApplicable: !tooLarge, reviewedAt: "2026-10-08",
      reasons: [tooLarge
        ? "Wise caps transfers to a private individual in India at INR 100 million each."
        : "Your sender pays Wise and Wise pays INR into your Indian bank account or UPI ID. You don't need a Wise account."],
      verification: ["Your sender verifies their identity with Wise. You only share your account details."],
      fees: "This public quote includes Wise's fee for the pay-in method shown. Card pay-ins cost more; your bank may charge on receipt.",
      limits: "Up to INR 100 million per transfer to a private individual in India. Your sender's own Wise limits also apply.",
      corridors: "Into Indian bank accounts (including NRE and NRO) or a UPI ID.",
      settlement: ["Indian bank account (name, 5–20 digit account number, 11-character IFSC) or UPI ID. Usually 1 working day after conversion."],
      documents: ["Your sender picks the payment purpose. Transfers to India for investment or charitable donation aren't allowed."],
      purpose: "Personal transfers such as family support. Not investment or charitable donations.",
      sources: [{ label: "Wise: send money to India", url: WISE_SEND_INDIA }, { label: "Wise guide to INR transfers", url: WISE_INR_GUIDE }],
    };
  }
  if (slug.startsWith("market:")) {
    // Consumer remittance services are the right product type; the price is still a dated estimate.
    return {
      ...unknown, priceApplicable: true,
      reasons: ["A consumer remittance service your sender would use. Wise collected this price from the provider's own site; your sender's country and pay-in method change it."],
      verification: ["Your sender signs up and verifies with this provider. You only need an Indian bank account or the payout method they offer."],
    };
  }
  return unknown;
}
