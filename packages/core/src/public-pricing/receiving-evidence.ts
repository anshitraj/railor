import type { CustomerContext, ProviderProfileAssessment } from "../customer-profiles.js";

interface PaymentFact {
  detail: string;
  url: string;
}

export interface ReceivingPaymentFacts {
  delivery?: PaymentFact & { label: string };
  receipt?: PaymentFact & { label: string };
  feeTax?: PaymentFact;
  exportTax?: PaymentFact;
}

type Verification = { url: string; details: (profile: CustomerContext["profile"]) => string[] };
type ProductEvidence = Omit<ReceivingPaymentFacts, "exportTax"> & { verification?: Verification; invoice?: string[] };

const infinity = "https://www.infinityapp.in/faqs/articles/";
const winvesta = "https://www.winvesta.in/faqs/global-collections-account/";
const refrens = "https://www.refrens.com/receive-international-payments-india";
const payglocal = "https://payglocal.in/multi-currency-accounts";
const razorpay = "https://razorpay.com/accept-international-payments/money-saver/";
const salt = "https://www.salt.pe/international-payments";
const payzoll = "https://payzoll.finance/payzoll-vs-skydo";

const evidence: Record<string, ProductEvidence | undefined> = {
  infinity: {
    delivery: { label: "1–2 business days to settle", detail: "Infinity publishes 1–2 business days for INR settlement. Sender-bank processing is separate. Cutoffs, holidays and review can add time.", url: `${infinity}how-long-receiving-and-settlement-take` },
    receipt: { label: "FIRA available", detail: "Free bank-issued FIRA for eligible settled payments. Download it from the transaction once generated.", url: `${infinity}how-to-download-your-fira` },
    feeTax: { detail: "GST is included in the standard 0.5% bank-transfer fee. QuickLinks cards use separate pricing.", url: "https://www.infinityapp.in/blog/secure-international-payments-for-exporters" },
    verification: { url: `${infinity}what-documents-you-need-for-kyc`, details: profile => profile === "business" ? [
      "Company: business PAN, applicable GST/IEC/CIN details, Indian bank details and PAN cards for two directors.",
      "LLP or partnership: business PAN, applicable GST/IEC details, Indian bank details and partner PAN cards.",
      "Infinity’s onboarding checklist confirms which registrations apply.",
    ] : ["Personal PAN, GST or business details as applicable, and Indian bank account information."] },
    invoice: ["Client’s legal name, email and address.", "Invoice for the services, payment currency and correct purpose code. Share the invoice reference with your client."],
  },
  skydo: {
    delivery: { label: "Usually 24–48h after ACH clears", detail: "Skydo’s US ACH guide gives a 24–48 hour INR payout window after clearing. The sender’s ACH typically takes 1–3 business days. This is for direct ACH to a virtual account.", url: "https://www.skydo.com/blog/accept-ach-payments" },
    receipt: { label: "FIRA available", detail: "Skydo advertises an automatic FIRA with each payment.", url: "https://www.skydo.com/send-money-to-india" },
    feeTax: { detail: "Skydo adds 18% GST to its fee. The Railor estimate already includes that charge.", url: "https://www.skydo.com/send-money-to-india" },
  },
  mulya: {
    delivery: { label: "Usually 1 business day after withdrawal", detail: "Mulya usually settles a withdrawal in one business day when requested on a working day. The sender’s transfer into Mulya happens before you request withdrawal.", url: "https://support.mulya.co/transactions/nQbgPHJzFu5NDS15Swfwqr/what-happens-after-we-receive-the-money-in-mulya-how-do-i-convert-the-foreign-money-in-my-mulya-account-to-inr/wMa2FTShr2bHeDKwACYgxP" },
    receipt: { label: "FIRS available", detail: "Mulya provides a free Foreign Inward Remittance Statement (FIRS) within 24 hours of settlement. For an e-FIRC, ask your Indian beneficiary bank using the FIRS.", url: "https://support.mulya.co/firc-regulations-compliance-security-and-legalities/355SkxzLmHm2wGsJ5SnLaE/all-about-firc/355SkxzLmHoXVToPkbr4KW" },
    feeTax: { detail: "Mulya advertises a 1% all-inclusive fee with no additional GST charged by Mulya.", url: "https://www.mulya.co/" },
    verification: { url: "https://support.mulya.co/kyc/fPR7ejW8NvfjDbV7e7tPCA", details: profile => [
      "Indian bank account number and IFSC, business description, purpose code, and proof of online presence or accepted alternative.",
      profile === "business" ? "Use Mulya’s checklist for your company, LLP or partnership to see which owner identity and entity documents to upload."
        : profile === "sole_proprietor" ? "Use the sole proprietorship checklist for business and GST evidence." : "Follow the Individual/Freelancer identity verification checklist.",
    ] },
  },
  payglocal: {
    delivery: { label: "Advertised under 24h to settle", detail: "PayGlocal advertises INR settlement in under 24 hours for multi-currency collection accounts. Check when your settlement window starts in your agreement.", url: payglocal },
    receipt: { label: "FIRA available", detail: "PayGlocal lists automatic FIRA on bank collections at no additional charge.", url: payglocal },
    feeTax: { detail: "PayGlocal adds 18% GST to the bank-collection fee. The Railor estimate includes it.", url: payglocal },
    verification: { url: payglocal, details: profile => [
      profile === "business" ? "Incorporation documents, PAN, GST registration, bank account proof, and director or partner KYC."
        : "Upload PAN, bank proof and the registration documents PayGlocal requests for your legal form.",
      "Complete video KYC. PayGlocal captures the purpose code for each transaction.",
    ] },
  },
  razorpay: {
    delivery: { label: "1 business day after invoice capture", detail: "MoneySaver starts its published settlement window when invoice details are captured against the payment. Sender bank processing occurs separately.", url: "https://razorpay.com/blog/international-payment-settlement-explained/" },
    receipt: { label: "Digital FIRC available", detail: "Razorpay’s MoneySaver page says the digital FIRC is available within 24 hours of settlement.", url: razorpay },
  },
  winvesta: {
    delivery: { label: "1 business day after USD withdrawal processing", detail: "Winvesta lists one business day after processing for USD. The working-day cutoff is 1 p.m. IST. Client payments can take additional time to reach the collections account.", url: `${winvesta}how-long-does-it-take-for-funds-to-reach-my-indian-bank-account` },
    receipt: { label: "e-FIRA available", detail: "Winvesta sends an electronic FIRA within 24 hours of Indian bank credit. Download it under Statements.", url: `${winvesta}when-will-i-receive-my-e-fira-certificate` },
    verification: { url: winvesta, details: profile => ["PAN, Aadhaar, a website or professional profile link, and bank account number and IFSC.", ...(profile === "business" ? ["Business registration details."] : [])] },
  },
  xflow: {
    delivery: { label: "Typically next business day for USD", detail: "Xflow’s U.S. collection page describes next-business-day INR settlement as typical. Sender-bank arrival, the payout schedule and checks affect actual timing.", url: "https://www.xflowpay.com/send-money/usa-to-india" },
    receipt: { label: "e-FIRA available", detail: "Xflow documents automatic eFIRA for eligible export account payments. Confirm the exact document generated for your account and route.", url: "https://www.xflowpay.com/blog/what-documents-do-you-need-to-open-an-xflow-account" },
    verification: { url: "https://www.xflowpay.com/blog/what-documents-do-you-need-to-open-an-xflow-account", details: profile => [
      profile === "business" ? "Entity registration or GST details as applicable, PAN for the business and relevant directors, partners or beneficial owners." : "PAN and the personal or business evidence requested for your legal form.",
      "Bank details, business description, purpose code and proof of online presence.",
    ] },
  },
  refrens: {
    delivery: { label: "Within 2 business days after payment", detail: "Refrens publishes up to two business days for international payment settlement after the customer pays, subject to verification.", url: refrens },
    receipt: { label: "e-FIRC available", detail: "Refrens says merchants can request an e-FIRC for eligible international payments collected on its platform.", url: "https://www.refrens.com/grow/receive-international-payment-in-india/" },
    feeTax: { detail: "Refrens includes taxes in the published bank/ACH/wire processing fee. FX conversion is a separate cost.", url: refrens },
    verification: { url: refrens, details: profile => [
      profile === "business" ? "Business PAN, GST registration and incorporation records for companies." : "PAN and Aadhaar address proof. Refrens also asks for an online professional profile.",
      "Three previous invoices and a bank statement showing the corresponding international payments.",
    ] },
  },
  salt: {
    receipt: { label: "FIRC advertised", detail: "Salt advertises a free FIRC from its dashboard within 24 hours of the transaction. Verify that the product is available for your account.", url: salt },
    feeTax: { detail: "Salt advertises a 1.75% fee including GST. Confirm the active offer before relying on it.", url: salt },
  },
  dashx: {
    receipt: { label: "FIRA advertised", detail: "DashX describes automatic FIRA documentation in its company profile. Ask DashX which receipts qualify and when the document becomes available.", url: "https://www.linkedin.com/company/dashxpayments" },
    feeTax: { detail: "DashX publishes a 0.30% fee. Its calculator does not say whether GST is included.", url: "https://dashx.xyz/tools/currency-converter" },
  },
  payzoll: {
    receipt: { label: "FIRA/FIRC available", detail: "PayZoll advertises FIRA/FIRC for eligible international receipts. Check the document issued for this payment.", url: payzoll },
    feeTax: { detail: "PayZoll publishes the payout fee. Its public comparison does not specify whether GST applies and lists possible additional banking and corridor charges.", url: payzoll },
  },
  wise: {
    receipt: { label: "e-FIRC available", detail: "Wise emails the e-FIRC about 2–3 days after a completed receipt through Indian business account details. It is also downloadable from the transfer.", url: "https://wise.com/help/articles/71lNXW0Ls3gEFhUH8PtodV/receiving-payments-for-indian-businesses" },
    feeTax: { detail: "Wise charges 18% GST on its conversion and e-FIRC fees for Indian business collections.", url: "https://wise.com/in/pricing/business/receive/" },
  },
  payoneer: {
    receipt: { label: "FIRA, FIRS or NOC available", detail: "Payoneer lists a free FIRA, FIRS or NOC depending on the transfer. Check Documents for the exact form; an e-FIRC request goes through the recipient’s bank.", url: "https://www.payoneer.com/resources/decoding-firc-a-guide-for-indian-exporters-of-goods-services/" },
  },
};

/** Attach product evidence only to the matching Indian commercial bank collection. */
export function withReceivingEvidence(assessment: ProviderProfileAssessment, slug: string, context: CustomerContext, sourceCurrency: string): ProviderProfileAssessment {
  const source = evidence[slug];
  const method = context.paymentMethod ?? "local_bank";
  if (context.direction !== "receive" || context.country !== "IN" || context.profile === "personal" || context.purpose !== "services"
    || assessment.status === "not_supported" || (method !== "local_bank" && !(method === "wire" && slug === "refrens"))) return assessment;

  const delivery = (slug === "skydo" || slug === "winvesta" || slug === "xflow") && sourceCurrency !== "USD" ? undefined : source?.delivery;
  return {
    ...assessment,
    verification: source?.verification?.details(context.profile) ?? assessment.verification,
    documents: source?.invoice ?? assessment.documents,
    sources: [
      ...assessment.sources,
      ...(source?.verification ? [{ label: "Provider KYC checklist", url: source.verification.url }] : []),
      ...(slug === "infinity" ? [{ label: "Before your first payment", url: `${infinity}your-checklist-before-receiving-the-first-payment` }] : []),
    ],
    reviewedAt: source ? "2026-11-18" : assessment.reviewedAt,
    payment: {
      ...(delivery ? { delivery } : {}),
      ...(source?.receipt ? { receipt: source.receipt } : {}),
      ...(source?.feeTax ? { feeTax: source.feeTax } : {}),
      exportTax: {
        detail: "Qualifying exports of services are zero-rated for GST. Keep the invoice and remittance proof, and check whether you need to file a Letter of Undertaking (LUT). Income tax depends on your tax status.",
        url: "https://cbic-gst.gov.in/pdf/circular-cgst-88.pdf",
      },
    },
  };
}
