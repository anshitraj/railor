import type { CustomerContext, ProviderProfileAssessment } from "../customer-profiles.js";

/**
 * What each provider publishes about identity (KYC/KYB) checks: the documents
 * it asks for and how long its own pages say approval takes. Every entry is
 * taken from the provider's own site or help centre and names that page. Where
 * a provider publishes no turnaround or no fixed document list, the entry says
 * so instead of guessing, and the screen tells the reader to ask the provider.
 * Railor never verifies anyone's identity or approves an account.
 */

export const KYC_REVIEWED_AT = "2026-11-26";

export type KycProfile = CustomerContext["profile"];

export interface KycApprovalTime {
  /** A few words for the row ("Under 1 hour", "1–3 business days"). */
  label: string;
  /** What the provider’s page actually says, with the conditions it names. */
  detail: string;
  url: string;
}

export interface KycEntry {
  /** Who verifies: the person paying in with a transfer service, or the person opening the account. */
  for: "sender" | "account_holder";
  profiles: readonly KycProfile[];
  /** Countries the provider's page is written for (the account holder's country). Omit when it is not country-specific. */
  countries?: readonly string[];
  /** One line on whose rules these are, shown beside the documents. */
  scope: string;
  documents: readonly string[];
  /** Said instead of a list when the provider publishes no fixed one. */
  documentsNote?: string;
  documentsUrl: string;
  /** null: the provider publishes no turnaround for this product. */
  approvalTime: KycApprovalTime | null;
}

/** What the Requirements panel shows. */
export interface ProviderKyc {
  /** "sender" when the check belongs to the person paying in, not to the reader. */
  appliesTo: "you" | "sender";
  scope: string;
  /** How closely the page matches the reader's country. */
  match: "country" | "general" | "other_country";
  documents: string[];
  documentsNote?: string;
  documentsUrl: string;
  approvalTime: KycApprovalTime | null;
  reviewedAt: string;
}

const EEA = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "NO", "IS", "LI"] as const;
const PERSON: readonly KycProfile[] = ["personal", "freelancer"];
const BUSINESS: readonly KycProfile[] = ["business", "sole_proprietor"];
const ANYONE: readonly KycProfile[] = ["personal", "freelancer", "sole_proprietor", "business"];

const WISE_GUIDE = "https://wise.com/help/articles/2949782/guide-to-getting-verified";
const WISE_BUSINESS = "https://wise.com/help/articles/2769792/how-can-i-verify-my-business";
const XE_VERIFY = "https://help.xe.com/hc/en-gb/articles/360019467417-How-do-I-complete-verification";
const XE_TIME = "In most cases Xe checks your identity in real time, and says verification usually takes only a few minutes.";
const TAPTAP_VERIFY = "https://support.taptapsend.com/en/account-and-security/how-do-i-verify-my-identity-on-taptap-send";
const taptapTime: KycApprovalTime = { label: "A few minutes, sometimes a few hours", detail: "Taptap Send says most verifications complete in a few minutes, and some need a manual review that can take a few hours.", url: TAPTAP_VERIFY };
const SELFIE = "A selfie to confirm it is you, taken in the app.";

const xeTime = (): KycApprovalTime => ({ label: "A few minutes", detail: XE_TIME, url: XE_VERIFY });
const xeDocs = (identity: string[], address: string[]) => [...identity.map((d) => `Proof of identity: ${d}`), ...address.map((d) => `Proof of address, if asked: ${d}`), "A selfie, if asked, taken after you submit your identity document."];

export const PROVIDER_KYC: Record<string, readonly KycEntry[]> = {
  wise: [
    {
      for: "sender", profiles: PERSON,
      scope: "Wise’s general rules. The exact documents depend on your country, the amount and the currency you send.",
      documents: [
        "Photo ID that has not expired: a passport (photo page), a national ID card (both sides) or a driving licence (both sides).",
        "Sometimes a selfie, or a picture of you holding your ID.",
        "Proof of address if Wise asks, showing your full name and address: a utility bill or a bank or credit card statement from the last 3 months, a council tax bill from the last year, a tenancy agreement for the current year, or a letter from a government or financial institution from the last 12 months.",
        "For larger amounts, documents that show where the money came from.",
      ],
      documentsUrl: WISE_GUIDE,
      approvalTime: { label: "10 minutes to 2 working days", detail: "Wise says verifying your identity usually takes between 10 minutes and 1 day, and that once it has your documents it usually takes 1–2 working days to review them.", url: WISE_GUIDE },
    },
    {
      for: "account_holder", profiles: ["freelancer"], countries: ["IN"],
      scope: "Wise’s receiving details for freelancers in India.",
      documents: [],
      documentsNote: "Your personal PAN and an INR bank account in your own name, with identity verification. Wise may ask for an invoice or matched payment request.",
      documentsUrl: "https://wise.com/help/articles/6Kpm9pXlJW79OGAktSnHos/how-to-verify-your-indian-business-to-receive-payments",
      approvalTime: { label: "10 minutes to 2 working days", detail: "Wise says verifying your identity usually takes between 10 minutes and 1 day, and that once it has your documents it usually takes 1–2 working days to review them.", url: WISE_GUIDE },
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IN"],
      scope: "Wise Business for a business registered in India.",
      documents: [],
      documentsNote: "Wise asks for the documents that match your legal form: registration or incorporation papers, business PAN, bank ownership and owner or director identity.",
      documentsUrl: "https://wise.com/help/articles/6Kpm9pXlJW79OGAktSnHos/how-to-verify-your-indian-business-to-receive-payments",
      approvalTime: { label: "About 2 working days, up to 10", detail: "For an Indian sole trader Wise says the verification video call takes about 2 to 3 minutes and it confirms the account is ready within 2 working days. For any business, extra review after the fee or first transfer usually takes up to 10 working days.", url: WISE_BUSINESS },
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Wise Business, any country. Requirements vary by where the business is registered.",
      documents: [
        "Proof of business registration: a certificate of incorporation, articles of association or an official registry excerpt.",
        "Proof of address for the trading address: a recent utility bill, lease agreement or bank statement in the business’s name.",
        "Ownership documents: a recent shareholder register, operating agreement or partnership deed.",
        "Personal ID for the account administrator and possibly other directors or owners.",
        "Proof you are authorised to open the account (a signed letter, power of attorney or board resolution) if you are not a director.",
      ],
      documentsUrl: WISE_BUSINESS,
      approvalTime: { label: "Up to 10 working days", detail: "Wise says that when it needs more verification after you pay the one-time fee or fund a transfer, the review usually takes up to 10 working days. It emails you the specific documents it needs.", url: WISE_BUSINESS },
    },
  ],
  remitly: [
    {
      for: "sender", profiles: PERSON,
      scope: "Remitly’s guidance for senders in the United States. Other countries can ask for other documents.",
      documents: [
        "A government-issued photo ID showing your full name and date of birth: a driver’s license, passport or visa.",
        "In some cases a utility bill or a bank statement, for added security.",
        "Your answers about the purpose of the transfer or where the money came from, for large transfers.",
      ],
      documentsUrl: "https://remitly.com/us/en/money-transfer/large-amounts",
      approvalTime: { label: "Often within minutes", detail: "Remitly says most verification completes quickly, often within minutes for standard checks. More complex cases, such as confirming the source of funds on a high-value transfer, may take a little longer.", url: "https://remitly.com/blog/money-transfer/documents-required-for-large-international-money-transfers" },
    },
  ],
  xoom: [
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "Xoom, a PayPal service, for senders in the United States.",
      documents: [
        "Photo ID: a passport, driver’s license, national ID or residence card.",
        "Proof of address: a utility bill, phone bill, or bank or credit card statement.",
        "Proof of income or source of funds: a recent pay stub, a bank statement with salary deposits, or a tax return (W-2).",
        "Xoom asks for the extra documents only when it reviews a transfer. You upload them in the Xoom app or on xoom.com.",
      ],
      documentsUrl: "https://help.xoom.com/s/article/why-does-xoom-request-documents-for-verification?language=en_US",
      approvalTime: { label: "A few hours, up to 4 days", detail: "Xoom says most reviews finish within a few hours and some may take up to four days, depending on the documents and request volume.", url: "https://help.xoom.com/s/article/why-does-xoom-request-documents-for-verification?language=en_US" },
    },
  ],
  paypal: [
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "PayPal’s identity check (CIP) for personal accounts in the United States.",
      documents: [
        "Your driver’s license or another government-issued photo ID, scanned front and back and matched to a selfie in the PayPal app. You can confirm on a computer instead.",
        "Proof of address issued within the past 12 months, when PayPal asks for it.",
      ],
      documentsUrl: "https://paypal.com/us/cshelp/article/how-do-i-confirm-my-identity-cip-help606",
      approvalTime: { label: "Within 2 business days", detail: "PayPal says it tries to review your documents within 2 business days, but sometimes it takes longer.", url: "https://paypal.com/us/cshelp/article/how-do-i-confirm-my-identity-cip-help606" },
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "PayPal business accounts.",
      documents: [],
      documentsNote: "PayPal asks business accounts for business-related documents. Which ones depends on the type of business; PayPal lists them in its help centre.",
      documentsUrl: "https://paypal.com/us/cshelp/article/what-documents-can-i-upload-to-confirm-my-business-entity-help493",
      approvalTime: { label: "Within 2 business days", detail: "PayPal says it tries to review your documents within 2 business days, but sometimes it takes longer.", url: "https://paypal.com/us/cshelp/article/how-do-i-confirm-my-identity-cip-help606" },
    },
  ],
  revolut: [
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "Revolut personal accounts in the United States.",
      documents: [
        "An identity document of a type Revolut lists on the in-app submission screen. It must be up to date and the name must match your Revolut account.",
        "Proof of address, if Revolut asks: a PDF or a photo of a document issued in the last 2 months by a government authority, utility company or financial institution, in the Latin alphabet, showing a personal residential address that matches your account. Post office boxes, hotels and business addresses are not accepted.",
      ],
      documentsUrl: "https://help.revolut.com/en-US/help/profile-and-plan/profile-plan/verifying-identity/i-need-to-verify-my-address",
      approvalTime: { label: "Under 1 hour, up to 1 business day", detail: "Revolut says a proof-of-address check typically takes less than 1 hour and can take up to 1 business day for some cases.", url: "https://help.revolut.com/en-US/help/profile-and-plan/profile-plan/verifying-identity/i-need-to-verify-my-address" },
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["US"],
      scope: "Revolut Business for US-based companies.",
      documents: [
        "One of these identity documents, valid for at least 3 months: a US passport or card, a state ID, a driver’s license, an Employment Authorization Document, a Permanent Resident Card, a Consular Identification Card, a Diplomatic Identification Card, or a visa together with a non-US passport.",
      ],
      documentsUrl: "https://help.revolut.com/en-US/business/help/setting-up-an-account/onboarding/identity-verification/",
      approvalTime: { label: "Up to 5 business days", detail: "Revolut says identity verification for a Business account can take up to 5 business days. Check the in-app Home screen for further requests.", url: "https://help.revolut.com/en-US/business/help/setting-up-an-account/onboarding/identity-verification/" },
    },
  ],
  "western-union": [
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "Western Union for senders in the United States. ID verification is needed to send more than 3,000 USD.",
      documents: [
        "A government-issued photo ID, such as a driver’s license or passport, to verify your profile. You must be at least 18.",
        "When Western Union asks you to upload documents: at least one ID and one non-identification document.",
        "To send in person after starting online: the same government-issued ID, shown at the agent.",
      ],
      documentsUrl: "https://westernunion.com/us/en/frequently-asked-questions/faq-sending-money.html",
      approvalTime: null,
    },
    {
      for: "sender", profiles: PERSON, countries: ["GB"],
      scope: "Western Union for senders in the United Kingdom. Online ID verification starts when you reach £800 sent.",
      documents: [
        "A valid signed passport, a valid full driving licence (EU), a provisional driving licence (UK only), an EU national identity card (non-UK), an EU residency card, an emergency or temporary passport, emergency travel documents, or a ship’s passport.",
      ],
      documentsUrl: "https://www.westernunion.com/gb/en/identification.html",
      approvalTime: null,
    },
  ],
  moneygram: [
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "MoneyGram for senders in the United States. Requirements vary with the amount, destination and payment method.",
      documents: [
        "A valid, unexpired government-issued ID that matches the details you give for the transfer. MoneyGram lists, among others: a driver’s license, passport, state ID, military ID, tribal ID, resident alien card, border crossing card, Mexican electoral card and matrícula consular card.",
        "Also listed: a welfare ID, an inmate exit prison ID, a seafarer ID, a temporary resident card and an employment authorization card.",
        "Sometimes more information, for first-time senders, larger transfers or certain payment methods.",
      ],
      documentsUrl: "https://www.moneygram.com/blog/what-id-do-you-need-to-send-money-internationally",
      approvalTime: { label: "A few moments for most senders", detail: "MoneyGram says ID verification takes only a few moments for most senders. Extra review for a first transfer, a larger amount or a certain payment method can add time.", url: "https://www.moneygram.com/blog/what-id-do-you-need-to-send-money-internationally" },
    },
  ],
  "world-remit": [
    {
      for: "sender", profiles: PERSON,
      scope: "WorldRemit’s general rules. Verification depends on where you send from and how much, because each country has its own laws.",
      documents: [
        "A government-issued ID showing a document number, your photo, full name, date of birth and expiry date: a national ID card issued in the country you send from (front and back), or a passport. A driving licence is accepted only outside the EU.",
        "Sometimes the purpose of the transfer or the source of your funds.",
        "Customers sending from New Zealand also verify their address, with a utility bill (not a mobile phone bill), a driving licence or a bank statement from the last 3 months.",
      ],
      documentsUrl: "https://www.worldremit.com/en/faq/verification",
      approvalTime: { label: "Minutes, up to 24–48 hours", detail: "WorldRemit says the majority of checks happen within 5 minutes after you submit your documents, but to allow up to 24–48 hours for completion.", url: "https://www.worldremit.com/en/faq/verification" },
    },
  ],
  "taptap-send": [
    { for: "sender", profiles: PERSON, countries: ["US"], scope: "Taptap Send for people based in the United States.", documents: [
      "A passport (from any country) or a US passport card.",
      "A driving licence from the US, Guatemala, Mexico, Colombia, the UK, Switzerland or an EEA country.",
      "A national ID card from the US, Guatemala, Mexico or Colombia, including the Mexican INE and consular ID.",
      "A US permanent resident card, employment authorisation card, visa or other US government-issued photo ID, such as a military ID or refugee travel document.",
      SELFIE,
    ], documentsUrl: TAPTAP_VERIFY, approvalTime: taptapTime },
    { for: "sender", profiles: PERSON, countries: ["GB"], scope: "Taptap Send for people based in the United Kingdom.", documents: ["A passport (from any country), a travel visa or a driving licence.", SELFIE], documentsUrl: TAPTAP_VERIFY, approvalTime: taptapTime },
    { for: "sender", profiles: PERSON, countries: ["AE"], scope: "Taptap Send for people based in the UAE.", documents: ["An Emirates ID.", SELFIE], documentsUrl: TAPTAP_VERIFY, approvalTime: taptapTime },
    { for: "sender", profiles: PERSON, countries: ["AU", "CA"], scope: "Taptap Send for people based in Australia or Canada.", documents: ["A passport (from any country), a national ID, a resident permit, a travel visa or a driving licence.", SELFIE], documentsUrl: TAPTAP_VERIFY, approvalTime: taptapTime },
    { for: "sender", profiles: PERSON, countries: EEA, scope: "Taptap Send for people based in Europe.", documents: ["A passport (from any country), a national ID, a resident permit, a travel visa or a driving licence.", SELFIE], documentsUrl: TAPTAP_VERIFY, approvalTime: taptapTime },
  ],
  sendwave: [
    {
      for: "sender", profiles: PERSON,
      scope: "Sendwave. The ID it asks for depends on the information available when you create your account.",
      documents: [
        "Identification, often a driver’s licence, passport or visa from one of Sendwave’s sending countries.",
        "A photo of your government-issued ID and/or a selfie, uploaded securely in the Sendwave app.",
      ],
      documentsUrl: "https://www.sendwave.com/en/security/verifying-your-identity",
      approvalTime: { label: "Usually hours, up to 24 hours", detail: "Sendwave says verification usually completes within hours, though some cases may take up to 24 hours. Most checks are automatic, and documents that need extra review can take up to 24 hours.", url: "https://www.sendwave.com/en-us/blog/product/new-to-sendwave" },
    },
  ],
  lemfi: [
    {
      for: "sender", profiles: PERSON,
      scope: "LemFi. The accepted ID types depend on the country you sign up in.",
      documents: ["A clear photo of a valid government-issued ID, uploaded in the app when it prompts you."],
      documentsUrl: "https://support.lemfi.com/hc/en-us/articles/41458018877329-How-do-I-sign-up",
      approvalTime: { label: "Minutes; can take longer", detail: "LemFi says account setup usually takes a few minutes but verification may take longer. For its Global Account it says most accounts are set up within minutes and that verification can take longer in some cases.", url: "https://support.lemfi.com/hc/en-us/articles/41602057049873-How-do-I-open-a-Global-Account" },
    },
  ],
  aspora: [
    {
      for: "sender", profiles: PERSON, countries: ["AE"],
      scope: "Aspora for people in the UAE.",
      documents: ["Your Emirates ID.", "A live face scan."],
      documentsUrl: "https://www.aspora.com/help/ae/identity-verification",
      approvalTime: { label: "Usually instant, up to 2 hours", detail: "Aspora says submitting your details takes a couple of minutes, your identity is usually verified instantly, and in some cases it may take up to 2 hours.", url: "https://www.aspora.com/help/ae/identity-verification" },
    },
  ],
  xe: [
    { for: "sender", profiles: PERSON, countries: ["US"], scope: "Xe for senders in the United States. Documents must be in colour and show the full page; address documents must be dated in the last 3 months.", documents: xeDocs(["a passport (photo and signature pages), a driver’s license or an ID card."], ["a utility bill, a current lease agreement, a bank statement of a checking or savings account, or a statement from a US federal or state government body."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
    { for: "sender", profiles: PERSON, countries: ["GB"], scope: "Xe for senders in the United Kingdom. Address documents must be dated in the last 3 months unless stated.", documents: xeDocs(["a passport (photo and signature pages), a photo driving licence, a national identity card with a photo, or a residence permit."], ["a utility bill, a bank statement, a council tax bill for the current tax year, an income tax self-assessment letter, a letter from a tax authority, or an electoral register entry."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
    { for: "sender", profiles: PERSON, countries: ["CA"], scope: "Xe for senders in Canada.", documents: xeDocs(["a passport (photo and signature pages), a driver’s license, a national identity card with a photo, or a residence permit."], ["a statement from a Canadian government body, a CRA Notice of Assessment, a GST refund letter, a utility bill from the last 3 months, a T4 statement, or an investment account statement (RRSP, GIC and similar)."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
    { for: "sender", profiles: PERSON, countries: ["AU"], scope: "Xe for senders in Australia. Address documents must be dated in the last 12 months.", documents: xeDocs(["a passport (photo and signature pages), a driver’s license or a national identity card with a photo."], ["a utility bill, a letter from a government agency, a council rates notice or valuation, or a statement from a bank, building society or credit union."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
    { for: "sender", profiles: PERSON, countries: ["NZ"], scope: "Xe for senders in New Zealand. Xe may ask for a certified copy of your identity document.", documents: xeDocs(["a passport (photo and signature pages) or a driver’s license."], ["a utility bill, a letter from a government agency, a council rates notice or valuation, or a statement from a bank, building society or credit union."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
    { for: "sender", profiles: PERSON, countries: EEA, scope: "Xe for senders in the European Union. Address documents must be dated in the last 3 months.", documents: xeDocs(["a passport (photo and signature pages), a photo driving licence, a national identity card with a photo, or a residence permit."], ["a utility bill, a bank statement, a letter from a local or national tax authority, or a solicitor’s letter confirming a recent house purchase."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
  ],
  ria: [
    {
      for: "sender", profiles: PERSON,
      scope: "Ria. It asks for more documents only when it reviews a transfer; if you can’t provide them within 7 days the transfer is cancelled.",
      documents: [
        "Proof of identity: a government-issued ID (a passport, driver’s license or national ID), or residency permit or immigration documents where they apply.",
        "Proof of funds, if asked: a bank statement issued within the last 90 days, your three most recent pay slips or pay statements, a loan letter that shows your income, or another official document that proves your income.",
        "Proof of the purpose of the transfer, if asked: an invoice or bill, a legal contract or agreement, or another document that shows why you are making the transfer.",
      ],
      documentsUrl: "https://help.riamoneytransfer.com/hc/en-us/articles/30822077749009-What-documents-do-you-accept-and-how-do-I-provide-them",
      approvalTime: { label: "About 1 hour", detail: "Ria says reviews of the documents it asks for typically take 1 hour, and sometimes longer. Your transfer is on hold during the review.", url: "https://help.riamoneytransfer.com/hc/en-us/articles/30822077749009-What-documents-do-you-accept-and-how-do-I-provide-them" },
    },
  ],
  paysend: [
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "Paysend for customers in the United States.",
      documents: [
        "A valid identification document with your photo: a passport issued in the USA, an ID card issued in the USA, a driving license issued in the USA, or a residence permit issued in the USA together with an international passport issued in any country.",
        "A photo or video of your face, for some types of verification.",
        "Your SSN, to raise your sending limits.",
      ],
      documentsUrl: "https://help.paysend.com/hc/en-us/articles/19780970552861-How-to-verify-my-identity",
      approvalTime: { label: "Moments, up to about 24 hours", detail: "Paysend says automated verification usually takes a few moments, and more in-depth verification may take about 24 hours.", url: "https://help.paysend.com/hc/en-us/articles/6061236616349-How-long-will-it-take-to-review-my-documents" },
    },
  ],
  instarem: [
    {
      for: "sender", profiles: PERSON, countries: ["IN"],
      scope: "Instarem for people sending money abroad from India.",
      documents: [
        "A valid government ID: an Aadhaar card or passport, plus your PAN card, whatever the reason for the transfer.",
        "University fees or hostel payments: the university offer or admission letter, a visa copy or I-20 form, the student’s PAN and passport, and bank account details.",
        "Blocked account funding or a GIC: the blocked account or GIC letter, the university offer or admission letter, the student’s PAN and passport, and bank account details.",
        "Employment and emigration: a copy of your passport, the employment offer letter, a copy of your PAN, and the emigration payment invoice.",
        "Visa fees: a copy of your passport, the visa fees invoice and a copy of your PAN.",
      ],
      documentsUrl: "https://www.instarem.com/help-personal/faqs/kyc-documents-send-from-india/",
      approvalTime: { label: "Video KYC within 48 hours", detail: "Instarem says you complete video KYC within 48 hours of e-signing the transaction form, and that your first transaction is not processed without it. It says most accounts are verified quickly when documents are clear and complete, but publishes no approval time.", url: "https://instarem.com/help-personal/faqs/video-verification-time-limit-india" },
    },
  ],
  ofx: [
    {
      for: "sender", profiles: ANYONE,
      scope: "OFX. It tells you what it needs for your account type and registration country.",
      documents: [],
      documentsNote: "OFX does not publish a fixed list. For individuals it verifies electronically and asks for documents only if needed. For a business account the documents depend on the type of business and where it is registered, and the OFX team tells you on your first call.",
      documentsUrl: "https://ofx.com/en-us/faqs/how-long-does-it-take-to-verify-my-identity",
      approvalTime: { label: "Minutes, then a few business days", detail: "OFX says registration takes no more than 10 minutes and it can usually verify your identity electronically. Where it needs documents, it aims to respond within a few business days of receiving them. For online sellers it says accounts are normally approved within 4 business days.", url: "https://ofx.com/en-us/faqs/how-long-does-it-take-to-verify-my-identity" },
    },
  ],
  airwallex: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Airwallex business accounts. The questions and documents depend on the country and structure of your business.",
      documents: [
        "Your business details and the registration documents for your country and business structure. Airwallex publishes a document guide for each region.",
        "Personal details and verification documents for the authorised person and, where required, for anyone who owns or controls the business.",
      ],
      documentsUrl: "https://help.airwallex.com/hc/en-gb/articles/900001757026-Eligibility-to-open-an-account",
      approvalTime: { label: "1–3 business days", detail: "Airwallex says that after you submit all required business information, processing takes 1–3 business days, depending on complexity. Its onboarding team may email you for more information.", url: "https://help.airwallex.com/hc/en-gb/articles/900001757026-Eligibility-to-open-an-account" },
    },
  ],
  payoneer: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Payoneer. The Verification Center in your account shows exactly which documents your account needs.",
      documents: [
        "A government-issued photo ID that has not expired: a national ID card, passport or driver’s license, with copies of both sides, in colour if you can.",
        "The Global Payment Service questionnaire about your business, with a link to your store, your own website or your freelance marketplace profile (active and showing a job history).",
        "Any other identity, business or payment document Payoneer asks for in the Verification Center.",
      ],
      documentsUrl: "https://www.payoneer.com/resources/business/how-to-submit-your-required-documents-to-use-payoneers-global-payment-service/",
      approvalTime: { label: "1–3 business days", detail: "Payoneer says most approvals happen within 1 to 3 business days when documents are correct. Its country guides say extra document checks can take 5–7 business days.", url: "https://pubs.payoneer.com/docs/generic-onboarding-guide.pdf" },
    },
  ],
  circle: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Circle Mint for businesses and financial institutions.",
      documents: [
        "Proof of business address: a utility bill, bank statement or lease agreement issued in the last 90 days.",
        "Identification for the authorised representative, such as a passport.",
      ],
      documentsNote: "Circle lists further entity documents by institution type in its help centre.",
      documentsUrl: "https://help.circle.com/support?id=kb_article_view&sysparm_article=KB0010694",
      approvalTime: { label: "A day to a week or more", detail: "Circle says it runs thorough background checks (ID verification, KYC and sanctions screening) and processing can vary from one day to a week or more. Its Circle Mint page says it can take a few weeks or more.", url: "https://www.circle.com/circle-mint" },
    },
  ],
  skydo: [
    {
      for: "account_holder", profiles: [...BUSINESS, "freelancer"], countries: ["IN"],
      scope: "Skydo for exporters and freelancers in India.",
      documents: [
        "PAN, Aadhaar and business documents, such as a GST certificate and an IEC if you have one.",
        "Your bank account details. Keep your PAN handy for the video KYC.",
        "Skydo verifies alternative business documents manually before you can start receiving payments.",
      ],
      documentsUrl: "https://skydo.com/compare/skydo-vs-remitly",
      approvalTime: { label: "Typically within 24 hours", detail: "Skydo says India-based onboarding typically completes verification within 24 hours, often within the same business day. Its help centre warns not to treat a short estimate as a promise: alternative documents need manual verification first.", url: "https://skydo.com/compare/skydo-vs-remitly" },
    },
  ],
  infinity: [
    {
      for: "account_holder", profiles: [...BUSINESS, "freelancer"], countries: ["IN"],
      scope: "Infinity for businesses and individuals in India.",
      documents: ["Individuals: PAN and Aadhaar.", "Businesses also: a GST certificate or an incorporation document."],
      documentsUrl: "https://www.infinityapp.in/faqs/articles/completing-your-kyc",
      approvalTime: { label: "Within 1 working day", detail: "Infinity says most KYC checks are completed within one working day, and that it emails you if anything else is needed.", url: "https://www.infinityapp.in/faqs/articles/completing-your-kyc" },
    },
  ],
  mulya: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN"],
      scope: "Mulya for people and businesses in India.",
      documents: [],
      documentsNote: "Mulya’s checklist depends on whether you are an individual or freelancer, a sole proprietor or a company. You give your Indian bank account number and IFSC (no bank statement), a business description, purpose code and proof of an online presence.",
      documentsUrl: "https://support.mulya.co/kyc/fPR7ejW8NvfjDbV7e7tPCA",
      approvalTime: { label: "About 2 business days", detail: "Mulya says that after you submit all the required KYC documents it typically takes 2 business days to complete the process and set up your virtual accounts.", url: "https://support.mulya.co/kyc/fPR7ejW8NvfjDbV7e7tPCA/how-long-does-it-take-to-get-my-mulya-virtual-accounts-after-registration/m5Saw2ZS316eHTLdFURR7B" },
    },
  ],
  payglocal: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IN"],
      scope: "PayGlocal for Indian businesses.",
      documents: [],
      documentsNote: "Incorporation documents, PAN, GST registration, bank account proof, and director or partner KYC, plus video KYC.",
      documentsUrl: "https://payglocal.in/multi-currency-accounts",
      approvalTime: { label: "Within 24 hours after video KYC", detail: "PayGlocal says an exporter’s account is made live within 24 hours once video KYC is completed. This is stated on its international payment gateway page; its multi-currency account page lists the same video KYC step.", url: "https://payglocal.in/international-payment-gateway" },
    },
  ],
  winvesta: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN"],
      scope: "Winvesta Global Collections Account for people in India.",
      documents: ["PAN and address proof, uploaded for KYC.", "A website or professional profile link, and your bank account number and IFSC."],
      documentsUrl: "https://www.winvesta.in/faqs/global-collections-account/how-do-i-check-my-kyc-verification-status",
      approvalTime: { label: "About 2–4 hours", detail: "Winvesta’s KYC status guide gives 2–4 hours for documents under review. If a review is still pending after 24 hours it says it fast-tracks it, with a reply within 4 hours.", url: "https://www.winvesta.in/faqs/global-collections-account/how-do-i-check-my-kyc-verification-status" },
    },
  ],
  xflow: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IN"],
      scope: "Xflow for Indian businesses.",
      documents: [
        "Your entity registration, PAN and GST details where applicable, and the bank account you want settlements paid into.",
        "A sole proprietor, an LLP and a private limited company each submit the documents that match their entity type.",
      ],
      documentsUrl: "https://www.xflowpay.com/blog/faqs-on-xflow-compliance",
      approvalTime: { label: "Next business day, usually", detail: "Xflow says an operations review activates the account after you submit your entity type and KYC documents, and you can usually transact from the next business day. Its small-business page promises activation in under 24 hours.", url: "https://www.xflowpay.com/blog/faqs-on-xflow-compliance" },
    },
  ],
  payzoll: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IN"],
      scope: "PayZoll business accounts.",
      documents: ["The business legal name, PAN or tax identification, and business registration information.", "GST information where applicable, authorised representative details, and settlement bank account details."],
      documentsUrl: "https://payzoll.finance/docs/faq/account",
      approvalTime: { label: "Generally 1–2 business days", detail: "PayZoll says account activation generally takes 1–2 business days and in some cases longer, depending on the review and partner requirements.", url: "https://payzoll.finance/docs/faq/account" },
    },
    {
      for: "account_holder", profiles: PERSON, countries: ["IN"],
      scope: "PayZoll individual accounts.",
      documents: ["An email address, a PAN card and your payout bank details."],
      documentsUrl: "https://payzoll.finance/docs/faq/account",
      approvalTime: { label: "Generally 1–2 business days", detail: "PayZoll says account activation generally takes 1–2 business days and in some cases longer, depending on the review and partner requirements.", url: "https://payzoll.finance/docs/faq/account" },
    },
  ],
  dashx: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "DashX. Its partners run the KYC and KYB checks.",
      documents: ["Individuals: ID, a liveness check, sanctions screening and a politically-exposed-person check.", "Businesses: registration documents, ultimate beneficial owner details, and director and sanctions screening."],
      documentsUrl: "https://dashx.xyz/agencies",
      approvalTime: { label: "Account details the same day", detail: "DashX says that once you complete KYC and choose the currency your client pays in, your account details are ready the same day. It publishes no approval time for the KYC review itself.", url: "https://dashx.xyz/virtual-accounts" },
    },
  ],
  briskpe: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IN"],
      scope: "BRISKPE for Indian businesses.",
      documents: [
        "PAN and Aadhaar. BRISKPE says to have both ready before you start.",
        "For companies and firms: an address proof such as a utility bill or rental agreement, a board resolution authorising onboarding and bank linkage, KYC documents of the directors or partners, and bank account proof in the business name.",
      ],
      documentsUrl: "https://briskpe.com/documentation-required-for-cross-border-merchant-onboarding-in-india",
      approvalTime: { label: "Same-day onboarding advertised", detail: "BRISKPE advertises digital, same-day onboarding and a 5-minute setup. It publishes no separate approval time.", url: "https://www.briskpe.com/" },
    },
  ],
  karbon: [
    {
      for: "account_holder", profiles: PERSON, countries: ["IN"],
      scope: "Karbon for freelancers in India.",
      documents: ["PAN and a masked Aadhaar.", "Bank statements for the last 3 months.", "Proof of freelance work, such as an Upwork or LinkedIn profile, a portfolio, contracts or an Instagram page."],
      documentsUrl: "https://karboncard.com/blog/kyc-documents-checklist-indian-freelancers",
      approvalTime: { label: "24–48 hours (help centre), 2–4 working days (blog)", detail: "Karbon’s help centre says its compliance team reviews documents within 24–48 hours. Its freelancer guides say clean submissions are typically approved in 2 to 4 working days.", url: "https://docs.karboncard.com/getting-started" },
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IN"],
      scope: "Karbon Business.",
      documents: ["Incorporation documents as applicable, PAN, and a GST certificate if registered.", "The rest of the list depends on your business type; Karbon’s help centre lists it."],
      documentsUrl: "https://www.karboncard.com/account-information-help-centre",
      approvalTime: { label: "24–48 hours", detail: "Karbon’s help centre says its compliance team reviews and verifies your details within 24–48 hours of you submitting documents.", url: "https://docs.karboncard.com/getting-started" },
    },
  ],
  cashfree: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IN"],
      scope: "Cashfree international payments for Indian businesses.",
      documents: [],
      documentsNote: "Cashfree lists the documents for your business type during its paperless onboarding.",
      documentsUrl: "https://cashfree.com/docs/payments/international-payments/global-collections/introduction",
      approvalTime: { label: "24–48 hours", detail: "Cashfree says you can start accepting international payments only after it reviews your documents, which typically takes around 24–48 hours. Account activation itself typically takes 24 working hours after you submit all documents.", url: "https://cashfree.com/docs/payments/international-payments/global-collections/introduction" },
    },
  ],
  pingpong: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN"],
      scope: "PingPong India.",
      documents: [
        "One of: a PAN card, Aadhaar card, passport or GST certificate, to verify identity.",
        "Your bank details, with a cancelled cheque or the beneficiary bank account’s online statement for the last week.",
        "Sometimes a store link or other documents, through questions in the PingPong portal.",
      ],
      documentsUrl: "https://in.pingpongx.com/blog/how-to-complete-pingpongs-kyc-to-receive-international-payments",
      approvalTime: { label: "1–2 days", detail: "PingPong India’s registration guide says verification is processed within 1–2 days and the result is emailed. It may ask for supplementary documents during the review.", url: "https://in.pingpongx.com/in/blog/untitled-6" },
    },
  ],
  razorpay: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IN"],
      scope: "Razorpay international payments for Indian businesses.",
      documents: ["Business details, business documents and authorised signatory details.", "Video KYC with your Aadhaar and PAN card: a live video call with a Razorpay agent."],
      documentsUrl: "https://razorpay.com/docs/payments/international-payments",
      approvalTime: null,
    },
  ],
  refrens: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN"],
      scope: "Refrens international payments.",
      documents: [],
      documentsNote: "Refrens asks for PAN, Aadhaar and similar documents for KYC. Its other requirements are listed under the Indian receiving evidence.",
      documentsUrl: "https://refrens.com/receive-international-payments-india",
      approvalTime: null,
    },
  ],
};

const ALIASES: Record<string, string> = { worldremit: "world-remit", "wise-business": "wise", "xoom-paypal": "xoom" };

/** The reader's profile matched to the profiles an entry was written for, most specific first. */
function profileOrder(profile: KycProfile): KycProfile[] {
  if (profile === "freelancer") return ["freelancer", "personal"];
  if (profile === "sole_proprietor") return ["sole_proprietor", "business"];
  return [profile];
}

/** The provider's published KYC facts that fit this reader, or null when Railor has none. */
export function kycFor(slug: string, context: Pick<CustomerContext, "profile" | "country" | "direction">): ProviderKyc | null {
  const key = slug.replace(/^market:/, "").toLowerCase();
  const entries = PROVIDER_KYC[ALIASES[key] ?? key];
  if (!entries) return null;
  const profiles = profileOrder(context.profile);
  const sides: KycEntry["for"][] = context.direction === "receive" ? ["account_holder", "sender"] : ["sender", "account_holder"];
  const fitting = entries
    .filter((entry) => entry.profiles.some((profile) => profiles.includes(profile)))
    .map((entry) => ({
      entry,
      side: sides.indexOf(entry.for),
      match: entry.countries?.includes(context.country) ? 0 : entry.countries ? 2 : 1,
      profile: Math.min(...entry.profiles.map((profile) => profiles.indexOf(profile)).filter((index) => index >= 0)),
    }))
    .sort((a, b) => a.side - b.side || a.match - b.match || a.profile - b.profile);
  const best = fitting[0];
  if (!best) return null;
  const { entry } = best;
  return {
    appliesTo: entry.for === "sender" && context.direction === "receive" ? "sender" : "you",
    scope: entry.scope,
    match: best.match === 0 ? "country" : best.match === 1 ? "general" : "other_country",
    documents: [...entry.documents],
    ...(entry.documentsNote ? { documentsNote: entry.documentsNote } : {}),
    documentsUrl: entry.documentsUrl,
    approvalTime: entry.approvalTime,
    reviewedAt: KYC_REVIEWED_AT,
  };
}

/** Railor's own placeholders for "no provider-specific list": the exact documents from the provider's page replace them. */
const GENERIC_VERIFICATION = [
  /^Confirm legal form, ownership checks and account-name requirements with the provider\.$/,
  /^Provider onboarding, identity\/business checks and bank ownership verification apply\./,
];

/**
 * Adds the provider's published KYC facts to an assessment. A provider-specific
 * document list already on the assessment (the Indian receiving evidence) is
 * kept; only Railor's generic "ask the provider" placeholder is replaced.
 */
export function withKycFacts(assessment: ProviderProfileAssessment, slug: string, context: CustomerContext): ProviderProfileAssessment {
  if (assessment.status === "not_supported") return assessment;
  const kyc = kycFor(slug, context);
  if (!kyc) return assessment;
  const generic = assessment.verification.length === 0 || assessment.verification.every((line) => GENERIC_VERIFICATION.some((pattern) => pattern.test(line)));
  const sources = [...assessment.sources];
  if (!sources.some((source) => source.url === kyc.documentsUrl)) sources.push({ label: "Provider KYC documents", url: kyc.documentsUrl });
  return {
    ...assessment,
    kyc,
    verification: generic ? (kyc.documents.length ? kyc.documents : kyc.documentsNote ? [kyc.documentsNote] : assessment.verification) : assessment.verification,
    sources,
  };
}
