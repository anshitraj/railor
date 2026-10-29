import type { CustomerContext, ProviderProfileAssessment } from "../customer-profiles.js";

/** Product-specific official sources. A listed product is not evidence of completed account verification. */
export const INDIA_RECEIVING_PRODUCTS = [
  { slug: "pingpong", name: "PingPong", url: "https://in.pingpongx.com/", currencies: ["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "HKD", "SGD", "AED", "MXN", "PLN", "NZD"], fee: "India product page directs customers to account-dashboard fees. No universal all-in 1% price is assumed." },
  { slug: "karbon", name: "Karbon", url: "https://www.karboncard.com/faqs/what-are-the-charges-for-receving-an-inward-remittance", currencies: [], fee: "The official FAQ says conversion, transfer fees, taxes and intermediary charges depend on the country, currency and method. An amount-specific calculator or account quote is required." },
  { slug: "refrens", name: "Refrens", url: "https://www.refrens.com/receive-international-payments-india", currencies: ["USD", "GBP", "CAD", "EUR", "SGD"], fee: "Bank/ACH/wire: 1.5% or lower, capped at USD 60, including taxes. FX conversion is additional and not fixed by this published fee. Card payments use a different tariff." },
  { slug: "salt", name: "Salt", url: "https://www.salt.pe/international-payments", currencies: ["USD", "GBP", "EUR", "HKD", "AED", "AUD", "CZK", "CHF", "DKK", "NOK", "PLN", "SEK", "SGD"], fee: "Published 1.75% including GST and no FX markup. Current onboarding and the final conversion rate must be confirmed; the public widget's zero placeholders are not live FX." },
  { slug: "payzoll", name: "PayZoll", url: "https://payzoll.finance/", currencies: ["USD"], fee: "Public headline: 1%; taxes, minimums and partner charges require account confirmation." },
  { slug: "xflow", name: "Xflow", url: "https://www.xflowpay.com/pricing", currencies: ["USD", "GBP", "EUR", "CAD"], fee: "Starter: USD 12 through USD 2,000, then 0.6%; Growth and custom plans differ. Applicable taxes must be confirmed." },
  { slug: "infinity", name: "Infinity", url: "https://www.infinityapp.in/", currencies: ["USD", "GBP", "EUR", "CAD", "AUD"], fee: "0.5% all-inclusive, zero advertised FX markup; custom pricing above USD 50,000." },
  { slug: "mulya", name: "Mulya", url: "https://www.mulya.co/", currencies: ["USD", "GBP", "EUR", "CAD", "AUD", "SGD"], fee: "Published 1% all-inclusive fee, zero FX markup and no additional GST charged by the provider." },
  { slug: "payglocal", name: "PayGlocal", url: "https://payglocal.in/compare/payglocal-vs-skydo", currencies: ["USD", "GBP", "EUR", "CAD", "AUD", "DKK", "SEK", "HUF", "CHF"], fee: "Bank collections: USD 10 through USD 2,000; USD 18 through USD 7,500; then 0.25%, plus GST. Card checkout is a different product." },
  { slug: "razorpay", name: "Razorpay MoneySaver", url: "https://razorpay.com/accept-international-payments/money-saver/", currencies: ["USD", "EUR", "GBP", "CAD", "AUD"], fee: "Standard bank transfer: 1%, with INR 1,000 flat below INR 100,000, plus applicable GST. Payment links use different pricing." },
  { slug: "winvesta", name: "Winvesta", url: "https://www.winvesta.in/faqs/global-collections-account/what-are-the-charges-for-the-global-collections-account", currencies: ["USD", "EUR", "GBP", "AED", "AUD", "CHF", "CZK", "DKK", "HKD", "NOK", "PLN", "SEK", "SGD"], fee: "Standard monthly-volume plan: 0.99% plus a currency-specific fixed fee. Non-JPMC accounts add 18% GST; negotiated tiers differ." },
  { slug: "dashx", name: "DashX", url: "https://dashx.xyz/tools/currency-converter", currencies: ["USD", "GBP", "EUR", "AED"], fee: "Published 0.30% flat fee and zero FX markup. Tax inclusion and an executable account rate are unconfirmed; do not mistake the homepage's untimestamped rate for a live quote." },
  { slug: "cashfree", name: "Cashfree Global Collections", url: "https://www.cashfree.com/international-payments/international-wire-transfer/", currencies: ["USD", "EUR", "CAD", "GBP"], fee: "Global Collections supports local collection accounts. Its payment-gateway card fee must not be substituted for a bank-collection quote." },
  { slug: "payoneer", name: "Payoneer", url: "https://www.payoneer.com/en-in/about/pricing/", currencies: ["USD", "GBP", "EUR"], fee: "Receiving fees depend on the method. USD-to-INR withdrawal pricing is account/volume-specific, publicly described as a 1–4% range." },
] as const;

export function indiaReceivingAssessment(slug: string, context: CustomerContext, request: { sourceCurrency: string; destinationCurrency: string }): ProviderProfileAssessment | null {
  const product = INDIA_RECEIVING_PRODUCTS.find((item) => item.slug === slug);
  if (!product || context.country !== "IN" || context.direction !== "receive") return null;
  const commercial = context.profile !== "personal" && context.purpose === "services";
  const currency = (product.currencies as readonly string[]).includes(request.sourceCurrency);
  const supported = commercial && currency && request.destinationCurrency === "INR";
  const status = context.profile === "personal" || request.destinationCurrency !== "INR" ? "not_supported" : supported ? "documented" : "unconfirmed";
  return {
    status, priceApplicable: supported,
    reasons: [supported ? "The provider's published export-collection product covers this currency and an Indian commercial recipient. Account and payer approval still apply." : "The published collection evidence does not establish this profile, purpose or currency combination."],
    verification: ["Provider onboarding, identity/business checks and bank ownership verification apply. Railor does not verify identity or approve an account."],
    fees: product.fee, limits: "Provider-specific account, monthly-volume and transaction limits must be confirmed; no unlimited-transfer assumption.",
    corridors: `${product.currencies.join(", ")} collection evidence for INR settlement in India; payer-country and local/SWIFT method restrictions apply.`,
    settlement: ["Settlement to the approved Indian INR bank account. Confirm the actual account's delivery and funding method."],
    documents: ["Invoice, purpose code and provider-requested export documentation. Check the provider's remittance-certificate workflow."],
    purpose: "Commercial service-export receipts; personal transfers, salaries and other purposes require separate evidence.",
    sources: [{ label: `${product.name} official product and pricing`, url: product.url }], reviewedAt: "2026-10-29",
  };
}
