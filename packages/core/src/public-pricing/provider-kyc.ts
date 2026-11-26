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
    {
      for: "sender", profiles: PERSON, countries: ["GB", ...EEA],
      scope: "Remitly for senders in the United Kingdom and Europe (EEA).",
      documents: [
        "A valid government-issued photo ID: passport, national ID card or driving licence — or two secondary documents showing your full name plus address or date of birth (such as a utility bill or official bank/government letter).",
        "Source-of-funds documents for high-value transfers, if asked.",
      ],
      documentsUrl: "https://remitly.com/us/en/money-transfer/large-amounts",
      approvalTime: { label: "Often within minutes", detail: "Remitly says standard identity verification usually finishes within minutes; source-of-funds checks on large transfers can take longer.", url: "https://remitly.com/blog/money-transfer/documents-required-for-large-international-money-transfers" },
    },
    {
      for: "sender", profiles: PERSON, countries: ["CA"],
      scope: "Remitly for senders in Canada (FINTRAC rules).",
      documents: [
        "A valid Canadian or foreign passport, Canadian driver’s licence, Permanent Resident card or provincial photo ID.",
        "Proof of address or source of funds for larger transfers, if asked.",
      ],
      documentsUrl: "https://remitly.com/us/en/money-transfer/large-amounts",
      approvalTime: { label: "Often within minutes", detail: "Remitly says standard identity verification usually finishes within minutes; extra checks on large transfers can take longer.", url: "https://remitly.com/blog/money-transfer/documents-required-for-large-international-money-transfers" },
    },
    {
      for: "sender", profiles: PERSON, countries: ["AU"],
      scope: "Remitly for senders in Australia (AUSTRAC rules).",
      documents: [
        "A valid Australian driver’s licence, valid passport (Australian or foreign) or approved Australian state photo ID.",
        "Source-of-funds documents for larger transfers, if asked.",
      ],
      documentsUrl: "https://remitly.com/us/en/money-transfer/large-amounts",
      approvalTime: { label: "Often within minutes", detail: "Remitly says standard identity verification usually finishes within minutes; extra checks on large transfers can take longer.", url: "https://remitly.com/blog/money-transfer/documents-required-for-large-international-money-transfers" },
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
    {
      for: "sender", profiles: PERSON, countries: ["GB", "CA", ...EEA],
      scope: "Xoom, a PayPal service, for senders in the United Kingdom, Canada and Europe (EEA).",
      documents: [
        "Photo ID: a passport, driver’s licence, national ID or residence card (clear photo showing all four corners).",
        "Proof of address (PDF): a utility, phone or internet bill, bank or credit card statement, or government tax notice issued within the last 3–6 months.",
        "Proof of income or source of funds for Level 3 limits: a recent pay stub or bank statement showing salary deposits.",
      ],
      documentsUrl: "https://help.xoom.com/s/article/why-does-xoom-request-documents-for-verification?language=en_US",
      approvalTime: { label: "A few hours, up to 4 days", detail: "Xoom says most document reviews finish within a few hours and some can take up to four days; pending transfers are cancelled if requested documents are not uploaded within 4 days.", url: "https://help.xoom.com/s/article/why-does-xoom-request-documents-for-verification?language=en_US" },
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
      for: "sender", profiles: PERSON, countries: ["GB", ...EEA],
      scope: "PayPal personal accounts in the United Kingdom and Europe (EEA).",
      documents: [
        "A government-issued photo ID (passport, national ID card or driving licence) matched to a live facial selfie in the app or browser.",
        "Proof of address issued within the last 12 months (utility bill or bank statement), if asked.",
      ],
      documentsUrl: "https://paypal.com/us/cshelp/article/how-do-i-confirm-my-identity-cip-help606",
      approvalTime: { label: "Within 2 business days", detail: "Automated checks can clear quickly; PayPal says it aims to review submitted documents within 2 business days, though complex reviews can take longer.", url: "https://paypal.com/us/cshelp/article/how-do-i-confirm-my-identity-cip-help606" },
    },
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN"],
      scope: "PayPal India accounts receiving international payments.",
      documents: [
        "Your PAN card and an Indian bank account linked for automatic INR settlement.",
        "An RBI Purpose Code declaration matching your export or service category.",
        "Digital Aadhaar/DigiLocker identity check and a live Video KYC call.",
        "For companies and firms: business registration documents and director or signatory KYC.",
      ],
      documentsUrl: "https://www.paypal.com/in/business/paypal-business-fees",
      approvalTime: { label: "1–2 business days", detail: "PayPal India says verification typically takes about 1 business day for individual accounts and 1–2 business days for business entities after completing Video KYC.", url: "https://paypal.com/us/cshelp/article/how-do-i-confirm-my-identity-cip-help606" },
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
      for: "sender", profiles: PERSON, countries: ["GB", ...EEA, "CH"],
      scope: "Revolut personal accounts in the United Kingdom, EEA and Switzerland.",
      documents: [
        "A valid passport, national ID card or UK/EEA/Swiss driving licence, plus a live selfie in the app.",
        "If you are not a UK/EEA/Swiss citizen: a valid visa or residence permit with at least 3 months’ validity remaining (or UK EUSS/immigration online share code).",
        "Proof of address or source of funds, if Revolut asks for higher limits or compliance checks.",
      ],
      documentsUrl: "https://help.revolut.com/help/profile/verifying-identity/identity-verification-requirements/",
      approvalTime: { label: "Usually 1 business day, up to 7", detail: "Revolut says personal identity checks in the UK and EEA usually complete within 1 business day, and can take up to 7 business days in some cases.", url: "https://help.revolut.com/help/profile/verifying-identity/identity-verification-requirements/" },
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
    {
      for: "account_holder", profiles: BUSINESS, countries: ["GB", ...EEA, "CH"],
      scope: "Revolut Business for companies registered in the UK, EEA or Switzerland.",
      documents: [
        "Company registration details (entity type, registration number, tax ID, registered address), certificate/articles of incorporation and a registry extract less than 3 months old.",
        "Personal photo ID (passport, national ID or UK/EEA/Swiss driving licence, plus residence permit/share code for non-citizens) for directors and beneficial owners.",
      ],
      documentsUrl: "https://help.revolut.com/en-US/business/help/setting-up-an-account/onboarding/identity-verification/",
      approvalTime: { label: "Up to 5 business days", detail: "Revolut says Business account onboarding and identity verification can take up to 5 business days.", url: "https://help.revolut.com/en-US/business/help/setting-up-an-account/onboarding/identity-verification/" },
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
    {
      for: "sender", profiles: PERSON, countries: EEA,
      scope: "Western Union for senders in Europe (EEA). Online ID verification typically starts at €1,000.",
      documents: [
        "A valid passport, EU/EEA national identity card (both sides) or photocard driving licence; some EU countries also offer video-chat or postal verification.",
      ],
      documentsUrl: "https://www.westernunion.com/gb/en/identification.html",
      approvalTime: null,
    },
    {
      for: "sender", profiles: PERSON, countries: ["CA", "AU"],
      scope: "Western Union for senders in Canada and Australia (FINTRAC/AUSTRAC rules).",
      documents: [
        "A valid government-issued photo ID such as a passport or local driver’s licence.",
      ],
      documentsUrl: "https://westernunion.com/us/en/frequently-asked-questions/faq-sending-money.html",
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
    {
      for: "sender", profiles: PERSON, countries: ["GB", ...EEA],
      scope: "MoneyGram for senders in the United Kingdom and Europe (EEA).",
      documents: [
        "A valid government-issued photo ID (passport, EU/EEA national ID card or driving licence) when triggered by transfer amount or compliance review.",
        "Proof of address (utility bill or bank statement) or source of funds for high-value transfers, if asked.",
      ],
      documentsUrl: "https://www.moneygram.com/blog/what-id-do-you-need-to-send-money-internationally",
      approvalTime: { label: "A few moments for most senders", detail: "MoneyGram says automated digital ID checks clear in moments for most senders; manual or high-value reviews can take longer.", url: "https://www.moneygram.com/blog/what-id-do-you-need-to-send-money-internationally" },
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
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "Aspora for senders in the United States.",
      documents: [
        "Basic verification: your Social Security Number (SSN).",
        "Full verification: a US driver’s license or passport and a live selfie.",
        "Source-of-funds documents for large transfers (such as above 10,000 USD), if asked.",
      ],
      documentsUrl: "https://www.aspora.com/help/us/transfers",
      approvalTime: { label: "Usually instant, up to 2 hours", detail: "Aspora says verification usually completes instantly in a few minutes, though manual reviews can take up to 2 hours.", url: "https://www.aspora.com/help/us/transfers" },
    },
    {
      for: "sender", profiles: PERSON, countries: ["GB"],
      scope: "Aspora for senders in the United Kingdom.",
      documents: [
        "A valid government-issued photo ID (passport or UK driving licence) and a live selfie.",
        "Proof of address (utility bill or bank statement) and source-of-funds documents for higher amounts, if asked.",
      ],
      documentsUrl: "https://www.aspora.com/help/gb/transfers",
      approvalTime: { label: "Usually instant, up to 2 hours", detail: "Aspora says verification usually completes instantly in a few minutes, though manual reviews can take up to 2 hours.", url: "https://www.aspora.com/help/gb/transfers" },
    },
  ],
  xe: [
    { for: "sender", profiles: PERSON, countries: ["US"], scope: "Xe for senders in the United States. Documents must be in colour and show the full page; address documents must be dated in the last 3 months.", documents: xeDocs(["a passport (photo and signature pages), a driver’s license or an ID card."], ["a utility bill, a current lease agreement, a bank statement of a checking or savings account, or a statement from a US federal or state government body."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
    { for: "sender", profiles: PERSON, countries: ["GB"], scope: "Xe for senders in the United Kingdom. Address documents must be dated in the last 3 months unless stated.", documents: xeDocs(["a passport (photo and signature pages), a photo driving licence, a national identity card with a photo, or a residence permit."], ["a utility bill, a bank statement, a council tax bill for the current tax year, an income tax self-assessment letter, a letter from a tax authority, or an electoral register entry."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
    { for: "sender", profiles: PERSON, countries: ["CA"], scope: "Xe for senders in Canada.", documents: xeDocs(["a passport (photo and signature pages), a driver’s license, a national identity card with a photo, or a residence permit."], ["a statement from a Canadian government body, a CRA Notice of Assessment, a GST refund letter, a utility bill from the last 3 months, a T4 statement, or an investment account statement (RRSP, GIC and similar)."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
    { for: "sender", profiles: PERSON, countries: ["AU"], scope: "Xe for senders in Australia. Address documents must be dated in the last 12 months.", documents: xeDocs(["a passport (photo and signature pages), a driver’s license or a national identity card with a photo."], ["a utility bill, a letter from a government agency, a council rates notice or valuation, or a statement from a bank, building society or credit union."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
    { for: "sender", profiles: PERSON, countries: ["NZ"], scope: "Xe for senders in New Zealand. Xe may ask for a certified copy of your identity document.", documents: xeDocs(["a passport (photo and signature pages) or a driver’s license."], ["a utility bill, a letter from a government agency, a council rates notice or valuation, or a statement from a bank, building society or credit union."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
    { for: "sender", profiles: PERSON, countries: EEA, scope: "Xe for senders in the European Union. Address documents must be dated in the last 3 months.", documents: xeDocs(["a passport (photo and signature pages), a photo driving licence, a national identity card with a photo, or a residence permit."], ["a utility bill, a bank statement, a letter from a local or national tax authority, or a solicitor’s letter confirming a recent house purchase."]), documentsUrl: XE_VERIFY, approvalTime: xeTime() },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Xe Business accounts (US, UK, Canada, Australia, New Zealand and Europe).",
      documents: [
        "Business activity description, destination countries and expected transfer profile.",
        "Full name, date of birth and address for directors and all beneficial owners (25% or more).",
        "For UK companies incorporated under 18 months: a supplier invoice and a business bank statement.",
      ],
      documentsUrl: "https://help.xe.com/hc/en-gb/articles/360019914837-How-do-I-register-for-a-business-account",
      approvalTime: null,
    },
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
    {
      for: "sender", profiles: PERSON, countries: ["GB", ...EEA],
      scope: "Paysend for customers in the United Kingdom and Europe (EEA).",
      documents: [
        "A valid photo ID: international passport, national ID card issued in your registration country, local driving licence or Biometric Residence Permit, plus a live selfie check.",
        "Proof of address (utility bill or bank statement) and source-of-funds documents to unlock Level 2 limits, if asked.",
      ],
      documentsUrl: "https://help.paysend.com/hc/en-us/articles/19780970552861-How-to-verify-my-identity",
      approvalTime: { label: "Moments, up to about 24 hours", detail: "Paysend says automated verification usually takes a few moments, and manual document review can take about 24 hours.", url: "https://help.paysend.com/hc/en-us/articles/6061236616349-How-long-will-it-take-to-review-my-documents" },
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
    {
      for: "sender", profiles: PERSON, countries: ["SG"],
      scope: "Instarem for personal senders in Singapore.",
      documents: [
        "Instant digital verification via Singpass MyInfo — or manual upload of a passport/NRIC and proof of address.",
      ],
      documentsUrl: "https://www.instarem.com/",
      approvalTime: { label: "Instant via Singpass MyInfo", detail: "Instarem supports instant eKYC via Singpass MyInfo in Singapore; manual document uploads take longer.", url: "https://www.instarem.com/" },
    },
    {
      for: "sender", profiles: PERSON, countries: ["US", "AU", "GB", ...EEA, "CA", "HK", "MY"],
      scope: "Instarem for personal senders in the US, Australia, UK, Europe, Canada, Hong Kong and Malaysia.",
      documents: [
        "A valid government-issued photo ID (passport, national ID card or local driver’s licence) and a live facial check.",
        "Proof of address (utility bill, bank statement or tax letter from the last 3 months) and source-of-funds documents for larger transfers, if asked.",
      ],
      documentsUrl: "https://www.instarem.com/",
      approvalTime: { label: "Minutes to 1 business day", detail: "Instarem says electronic verification usually clears within minutes to 1 business day (24 hours) when documents are clear.", url: "https://www.instarem.com/" },
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
      approvalTime: { label: "1–2 business days (international activation)", detail: "Razorpay says enabling international payments on a KYC-verified merchant account typically takes 1–2 business days after submitting business details and purpose codes. Partner-bank instant international transfers can take 15–20 business days.", url: "https://razorpay.com/docs/payments/international-payments" },
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
  salt: [
    {
      for: "account_holder", profiles: [...BUSINESS, "freelancer"], countries: ["IN"],
      scope: "Salt for Indian exporters and freelancers.",
      documents: [],
      documentsNote: "Salt does not publish a fixed public KYC checklist; onboarding requires Indian PAN, GST registration where applicable, business entity proof and signatory identity documents.",
      documentsUrl: "https://www.salt.pe/international-payments",
      approvalTime: null,
    },
  ],
  // --- UAE & GCC ---
  "careem-pay": [
    {
      for: "sender", profiles: PERSON, countries: ["AE"],
      scope: "Careem Pay Send Abroad for residents in the UAE.",
      documents: ["Original Emirates ID (front and back photos, or digital PDF from the ICP app).", "Valid UAE residency visa.", "A live facial liveness video check in the Careem app."],
      documentsUrl: "https://www.careem.com/en-AE/send-money-faqs/",
      approvalTime: { label: "Up to 3 working days", detail: "Careem Pay says identity verification typically takes up to 3 working days. You can start a transfer while pending and it stays queued until approved.", url: "https://www.careem.com/en-AE/send-money-faqs/" },
    },
  ],
  "al-ansari-exchange": [
    {
      for: "sender", profiles: PERSON, countries: ["AE"],
      scope: "Al Ansari Exchange for UAE residents (age 21+).",
      documents: ["Valid original Emirates ID (digital e-KYC supported via UAE PASS).", "Proof of source of funds for higher-value transfers, if asked under UAE AML rules."],
      documentsUrl: "https://alansariexchange.com/service/remittances/",
      approvalTime: null,
    },
  ],
  "lulu-exchange": [
    {
      for: "sender", profiles: PERSON, countries: ["AE"],
      scope: "LuLu Exchange / LuLu Money for UAE residents (age 21+).",
      documents: ["Valid original Emirates ID for digital eKYC in the LuLu Money app, or in-person verification at a LuLu Exchange branch if flagged."],
      documentsUrl: "https://luluexchange.com/services/money-transfer/",
      approvalTime: { label: "Short digital review, or ~2 minutes in-branch", detail: "LuLu Money sends an SMS, email or in-app notification once digital eKYC completes, and says bringing your original Emirates ID to a branch takes about 2 minutes for instant activation.", url: "https://luluexchange.com/services/money-transfer/" },
    },
  ],
  botim: [
    {
      for: "sender", profiles: PERSON, countries: ["AE"],
      scope: "Botim Money (PayBy) for UAE residents.",
      documents: ["Valid UAE mobile number (+971) and Emirates ID scanned in the Botim app.", "Additional KYC or source-of-funds documents for higher limits, if asked."],
      documentsUrl: "https://botim.me/international-transfer/",
      approvalTime: null,
    },
  ],
  "eand-money": [
    {
      for: "sender", profiles: PERSON, countries: ["AE"],
      scope: "e& money for UAE citizens and residents (age 18+).",
      documents: ["Valid Emirates ID scanned in the e& money app."],
      documentsUrl: "https://www.eandmoney.com/en/more/terms-conditions.html",
      approvalTime: null,
    },
  ],
  wio: [
    {
      for: "account_holder", profiles: PERSON, countries: ["AE"],
      scope: "Wio Personal bank accounts in the UAE.",
      documents: ["Valid Emirates ID and live selfie (or valid passport and UAE entry visa for newcomers), plus a UAE mobile number."],
      documentsUrl: "https://wio.io/pay-and-get-paid",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["AE"],
      scope: "Wio Business accounts for UAE-registered companies.",
      documents: ["Valid UAE Trade License (Mainland or Free Zone) and Memorandum/Articles of Association.", "Unexpired passport and Emirates ID for all shareholders and authorised signatories.", "Business profile/website and proof of business address (tenancy or utility bill), if asked."],
      documentsUrl: "https://desk.wio.io/support/solutions/articles/501000414617-wio-business-managing-transfers-beneficiaries-limits-payment-tracking-troubleshooting",
      approvalTime: null,
    },
  ],
  hubpay: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["AE"],
      scope: "Hubpay ADGM-regulated SME accounts in the UAE.",
      documents: ["Active UAE Trade License, MOA/AOA, and proof of business address (Ejari, lease or DEWA utility bill within 90 days).", "Company bank statement (or 6-month UBO personal statement for startups).", "Passport, Emirates ID (if UAE resident) and CV or LinkedIn profile for 25%+ UBOs and signatories."],
      documentsUrl: "https://hubpay.io",
      approvalTime: { label: "Within 1 business day", detail: "Hubpay says digital onboarding typically goes live within 1 business day after document submission and compliance verification.", url: "https://hubpay.io" },
    },
  ],
  "stc-bank": [
    {
      for: "sender", profiles: PERSON, countries: ["SA"],
      scope: "STC Bank (formerly STC Pay) for senders in Saudi Arabia.",
      documents: ["Saudi National ID or valid Iqama, verified via biometric Nafath authentication."],
      documentsUrl: "https://stcbank.com.sa",
      approvalTime: null,
    },
  ],
  "ooredoo-money": [
    {
      for: "sender", profiles: PERSON, countries: ["QA"],
      scope: "Ooredoo Money for senders in Qatar.",
      documents: ["Valid Qatar ID (QID), registered Ooredoo mobile number, and QID scan plus selfie video in the app (Full Wallet upgrades may require in-person QID verification at a shop)."],
      documentsUrl: "https://www.ooredoo.qa",
      approvalTime: null,
    },
  ],
  "beyon-money": [
    {
      for: "sender", profiles: PERSON, countries: ["BH"],
      scope: "Beyon Money for senders in Bahrain.",
      documents: ["Valid Bahraini CPR number and mobile OTP verification in the app or via BenefitPay."],
      documentsUrl: "https://www.beyonmoney.com",
      approvalTime: null,
    },
  ],
  "al-mulla-exchange": [
    {
      for: "sender", profiles: PERSON, countries: ["KW"],
      scope: "Al Mulla Exchange for senders in Kuwait.",
      documents: ["Valid Kuwait Civil ID (PACI) verified via Kuwait Mobile ID."],
      documentsUrl: "https://www.almullaexchange.com",
      approvalTime: null,
    },
  ],
  "al-muzaini": [
    {
      for: "sender", profiles: PERSON, countries: ["KW"],
      scope: "Al Muzaini Exchange for senders in Kuwait.",
      documents: ["Valid unexpired Kuwait Civil ID, passport or GCC Card (driver’s licences are not accepted)."],
      documentsUrl: "https://www.muzaini.com",
      approvalTime: null,
    },
  ],
  walletii: [
    {
      for: "sender", profiles: PERSON, countries: ["OM"],
      scope: "walletii by Ooredoo for senders in Oman.",
      documents: ["Valid Omani Civil ID, Resident ID or National ID verified in the walletii app."],
      documentsUrl: "https://www.walletii.om",
      approvalTime: null,
    },
  ],
  // --- South Asia & MENA Underdogs ---
  eximpe: [
    {
      for: "account_holder", profiles: [...BUSINESS, "freelancer"], countries: ["IN"],
      scope: "EximPe (RBI PA-CB authorised) for Indian exporters and merchants.",
      documents: ["Business registration proofs, corporate structure and beneficial owner (UBO) details.", "Transaction invoices, transport documents (if goods) and RBI purpose codes."],
      documentsUrl: "https://eximpe.com",
      approvalTime: { label: "Within 24 hours", detail: "EximPe says profile and compliance document reviews generally complete within 24 hours.", url: "https://eximpe.com" },
    },
  ],
  "toucan-payments": [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IN"],
      scope: "Toucan Payments (CrossStream) for Indian exporters.",
      documents: [],
      documentsNote: "Toucan Payments does not publish a fixed public KYC document checklist; Indian business KYC/KYB and AD-I partner bank verification apply during onboarding.",
      documentsUrl: "https://toucanpay.in",
      approvalTime: null,
    },
  ],
  hiwipay: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN"],
      scope: "HiWiPay for Indian exporters, freelancers and outward student remittances.",
      documents: ["Exporters and freelancers: PAN, IEC (where applicable), export invoices, client agreements and RBI purpose codes.", "Students sending abroad: PAN, ID/address KYC and university invoice or fee statement."],
      documentsUrl: "https://hiwipay.com",
      approvalTime: null,
    },
  ],
  hopremit: [
    {
      for: "sender", profiles: PERSON, countries: ["IN"],
      scope: "HOPRemit by moneyHOP for outward LRS transfers from India.",
      documents: ["Mandatory PAN card.", "One proof of address: Aadhaar, passport, Voter ID or driving licence, with Video KYC and Aadhaar e-sign.", "Purpose proof such as a university offer letter and visa for education transfers."],
      documentsUrl: "https://moneyhop.co",
      approvalTime: { label: "Real-time / a few minutes", detail: "moneyHOP says digital Video KYC and e-sign verification completes in real time within a few minutes.", url: "https://moneyhop.co" },
    },
  ],
  bookmyforex: [
    {
      for: "sender", profiles: PERSON, countries: ["IN"],
      scope: "BookMyForex for outward LRS wire transfers from India.",
      documents: ["PAN card and photo/address ID (Aadhaar, passport or Voter ID).", "Signed Form A2-cum-LRS declaration and purpose proof (university invoice, hospital estimate or relationship proof)."],
      documentsUrl: "https://www.bookmyforex.com/money-transfer/",
      approvalTime: null,
    },
  ],
  copperx: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Copperx Payouts for stablecoin-to-fiat payouts (Copperx Checkout is shut down).",
      documents: ["Individuals: government-issued photo ID and proof of address.", "Businesses: incorporation documents, proof of business address and director/UBO identity verification."],
      documentsUrl: "https://copperx.io",
      approvalTime: null,
    },
  ],
  transfi: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "TransFi enterprise stablecoin and fiat cross-border infrastructure.",
      documents: ["Corporate KYB registration documents, beneficial ownership disclosures and compliance onboarding.", "End-user payouts require government photo ID and selfie verification (via Sumsub)."],
      documentsUrl: "https://www.transfi.com",
      approvalTime: { label: "1–14 business days (Business KYB)", detail: "TransFi says business KYB onboarding takes 1 to 14 business days, with production API keys provisioned within 24 hours after approval.", url: "https://www.transfi.com" },
    },
  ],
  "elevate-pay": [
    {
      for: "account_holder", profiles: [...PERSON, ...BUSINESS], countries: ["PK", "BD", "EG", "PH"],
      scope: "Elevate Pay USD receiving accounts (PK, BD, EG, PH and supported markets).",
      documents: ["Valid government-issued photo ID (CNIC/NID, passport or driving licence depending on country) and live selfie.", "Proof of address (utility bill or bank statement) and employment contract or freelance profile link if asked."],
      documentsUrl: "https://www.elevatepay.co",
      approvalTime: { label: "1–3 business days", detail: "Elevate Pay says identity and account verification typically takes 1–3 business days, and can take longer during high volume or secondary reviews.", url: "https://www.elevatepay.co" },
    },
  ],
  nsave: [
    {
      for: "account_holder", profiles: PERSON, countries: ["PK", "BD", "EG", "MA", "TR", "AE", "QA", "SA"],
      scope: "nSave personal multi-currency accounts (excludes India and the US).",
      documents: ["Valid passport or national ID card (must be age 18+).", "Proof of address dated within the last 3 months (utility bill or bank statement)."],
      documentsUrl: "https://www.nsave.com",
      approvalTime: { label: "Under 10 minutes, up to 1 business day", detail: "nSave says automated personal KYC completes in under 10 minutes, and manual reviews can take up to 1 business day.", url: "https://www.nsave.com" },
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["PK", "BD", "EG", "MA", "TR", "AE", "QA", "SA"],
      scope: "nSave business multi-currency accounts.",
      documents: ["Company registration documents, source-of-funds details and compliance questionnaire, plus UBO/director IDs."],
      documentsUrl: "https://www.nsave.com",
      approvalTime: null,
    },
  ],
  "priyo-pay": [
    {
      for: "account_holder", profiles: PERSON, countries: ["BD"],
      scope: "Priyo Pay personal USD receiving accounts for Bangladesh and global freelancers.",
      documents: ["Valid passport (mandatory for the personal USD account tier; NID/driving licence alone is not accepted).", "Proof of address, live selfie and occupation/source-of-funds declaration."],
      documentsUrl: "https://pay.priyo.com",
      approvalTime: { label: "Minutes to 24 hours", detail: "Priyo Pay says verification completes in minutes to a few hours during US business hours, or up to 24 hours outside business hours.", url: "https://pay.priyo.com" },
    },
  ],
  cenoa: [
    {
      for: "account_holder", profiles: PERSON, countries: ["TR", "PK", "EG", "NG"],
      scope: "Cenoa digital USD accounts (TR, PK, EG, NG and 40+ markets).",
      documents: ["Valid government-issued photo ID (passport, national ID card or driver’s licence) plus occupation and income details."],
      documentsUrl: "https://www.cenoa.com",
      approvalTime: { label: "Within minutes", detail: "Cenoa says in-app KYC verification typically completes within minutes (often 5–10 minutes).", url: "https://www.cenoa.com" },
    },
  ],
  uption: [
    {
      for: "account_holder", profiles: PERSON, countries: ["TR"],
      scope: "UPTION global wallet and European SEPA account in Turkey.",
      documents: ["Valid Turkish National ID (T.C. Kimlik) or Turkish residency permit, scanned in-app with facial verification."],
      documentsUrl: "https://www.uption.com.tr",
      approvalTime: { label: "Seconds to a few minutes", detail: "UPTION says digital ID and facial verification in the app completes in seconds to a few minutes.", url: "https://www.uption.com.tr" },
    },
  ],
  ruul: [
    {
      for: "account_holder", profiles: ["freelancer", "personal"],
      scope: "Ruul freelancer invoicing and payout accounts (digital services only).",
      documents: ["Valid government photo ID (ID card, driving licence, passport or residence permit) and a live selfie before your first payout."],
      documentsUrl: "https://ruul.io",
      approvalTime: { label: "10–15 minutes", detail: "Ruul says automated freelancer identity verification typically takes 10–15 minutes.", url: "https://ruul.io" },
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Ruul business client accounts.",
      documents: [],
      documentsNote: "Ruul runs a business KYB check around the first invoice payment and prompts for entity details in the portal.",
      documentsUrl: "https://ruul.io",
      approvalTime: { label: "1–3 business days", detail: "Ruul says business KYB verification typically takes 1–3 business days.", url: "https://ruul.io" },
    },
  ],
  clearshift: [
    {
      for: "account_holder", profiles: PERSON, countries: ["IL", "US"],
      scope: "Clearshift individual same-owner FX accounts (Israel and US).",
      documents: ["Valid passport or government ID, proof of address and source-of-funds documents (especially for real estate transfers)."],
      documentsUrl: "https://www.clearshiftinc.com",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IL", "US"],
      scope: "Clearshift business accounts.",
      documents: ["Company incorporation certificate, Israel Companies Authority status letter (or local registry filing), board resolution and UBO details."],
      documentsUrl: "https://www.clearshiftinc.com",
      approvalTime: null,
    },
  ],
  "covercy-pay": [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IL", "GB", ...EEA, "US"],
      scope: "Covercy Pay cross-border accounts (Israel CMA and UK FCA regulated).",
      documents: ["Individuals: passport (photo page), national ID card (both sides) or driver’s licence.", "Businesses: corporate registration documents, proof of address and beneficial owner (UBO) IDs."],
      documentsUrl: "https://www.covercypay.com",
      approvalTime: null,
    },
  ],
  // --- Europe, UK, Switzerland, NA & Oceania ---
  "atlantic-money": [
    {
      for: "sender", profiles: PERSON, countries: ["GB", ...EEA],
      scope: "Atlantic Money for senders in the UK and 30 EEA countries.",
      documents: ["Plus Tier: government-issued photo ID, live selfie and brief account questions.", "Advanced Tier (up to £1M / €1M): source-of-funds documents such as payslips or bank statements, plus transfer purpose."],
      documentsUrl: "https://support.atlantic.money/",
      approvalTime: { label: "Within 1 business day", detail: "Atlantic Money says it aims to review and approve submitted verification documents within 1 business day, and often faster.", url: "https://support.atlantic.money/" },
    },
  ],
  transfergo: [
    {
      for: "sender", profiles: PERSON, countries: ["GB", ...EEA],
      scope: "TransferGo personal accounts in the UK and Europe. Verification is triggered at €1,000+ on the first transfer or on the second transfer.",
      documents: ["Valid international passport, plastic EU/EEA national ID card, UK or Turkish driving licence, or Lithuania/Turkey residence permit, plus a live selfie via Veriff.", "Source-of-funds documents for larger transfers, if asked."],
      documentsUrl: "https://support.transfergo.com/hc/en-gb/articles/4410793635346-How-do-I-verify-my-identity",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["GB", ...EEA],
      scope: "TransferGo Business accounts.",
      documents: ["Certificate of incorporation, articles of association, ownership structure details and director/shareholder photo IDs."],
      documentsUrl: "https://support.transfergo.com/hc/en-gb/articles/4410793635346-How-do-I-verify-my-identity",
      approvalTime: null,
    },
  ],
  orbitremit: [
    {
      for: "sender", profiles: ANYONE, countries: ["AU", "NZ", "GB"],
      scope: "OrbitRemit for senders in Australia, New Zealand and the UK.",
      documents: ["One-time biometric verification before your first transfer: valid passport, accepted driver’s licence or Australian Photo ID Card, plus a live selfie.", "Source-of-funds proof (payslips, tax returns, sale contracts or bank statements) for transfers over AUD/NZD 10,000.", "Businesses: business registration proof and director/UBO IDs."],
      documentsUrl: "https://support.orbitremit.com/hc/en-us/sections/360003714537-Verification",
      approvalTime: { label: "Minutes, up to 1 business day", detail: "OrbitRemit says automated biometric ID checks clear in minutes, and manual or source-of-funds reviews typically take up to 1 business day.", url: "https://support.orbitremit.com/hc/en-us/sections/360003714537-Verification" },
    },
  ],
  profee: [
    {
      for: "sender", profiles: PERSON, countries: ["GB", "CH", ...EEA],
      scope: "Profee for senders in Europe, the UK and Switzerland (Basic €1k, Plus €30k/yr, Premium €100k/yr).",
      documents: ["Plus Tier: government-issued photo ID (passport, national ID or EU/EEA driving licence) and proof of residency (utility bill, bank statement or government letter).", "Premium Tier: proof of source of wealth (payslips, tax returns or sale deeds)."],
      documentsUrl: "https://www.profee.com",
      approvalTime: null,
    },
  ],
  remitbee: [
    {
      for: "sender", profiles: PERSON, countries: ["CA"],
      scope: "RemitBee personal accounts in Canada (Levels 1–4).",
      documents: ["Government-issued photo ID (Canadian driver’s licence, passport or PR card).", "Proof of address and proof of income to unlock Level 3–4 limits (up to 20,000 CAD/day)."],
      documentsUrl: "https://www.remitbee.com/help/which-level-of-verification-should-i-need-to-complete",
      approvalTime: null,
    },
    {
      for: "sender", profiles: BUSINESS, countries: ["CA"],
      scope: "RemitBee Business accounts (Canadian-registered businesses only; MSBs excluded).",
      documents: ["Official Canadian incorporation or business registration documents.", "Proof of business address (utility bill or bank statement) and owner/director photo ID."],
      documentsUrl: "https://www.remitbee.com/help/what-are-the-requirement-to-open-a-remitbee-business-account",
      approvalTime: { label: "Within 24 hours", detail: "RemitBee says online business verification submissions are reviewed within 24 hours.", url: "https://www.remitbee.com/help/what-are-the-requirement-to-open-a-remitbee-business-account" },
    },
  ],
  "sling-money": [
    {
      for: "account_holder", profiles: PERSON,
      scope: "Morse (formerly Sling Money) accounts across 140+ countries.",
      documents: ["Valid government-issued photo ID (passport, national ID or driver’s licence) and live biometric selfie verification.", "Proof of address if prompted by your jurisdiction or limit tier."],
      documentsUrl: "https://help.morsemoney.com",
      approvalTime: null,
    },
  ],
  sokin: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Sokin business and personal multi-currency accounts.",
      documents: ["Businesses: proof of incorporation/registration, operating structure and beneficial owner (UBO) ID verification.", "Individuals/sole traders: government-issued photo ID and proof of address."],
      documentsUrl: "https://sokin.com",
      approvalTime: null,
    },
  ],
  verto: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Verto (formerly VertoFX) B2B multi-currency accounts.",
      documents: ["Certificate of incorporation, registration number, registered address and business activity/volume details.", "Passport or national ID plus proof of address for directors, beneficial owners (UBOs) and account admins."],
      documentsUrl: "https://help.verto.co/en/collections/3932731-opening-an-account",
      approvalTime: null,
    },
  ],
  currencyfair: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "CurrencyFair personal and business accounts.",
      documents: ["Individuals: valid passport and/or driver’s licence, mobile selfie check, and proof of address (utility bill, bank statement or government letter within 3 months) if asked.", "Businesses: entity registration documents, registered address proof and director/UBO IDs."],
      documentsUrl: "https://support.currencyfair.com/hc/en-us/articles/360018525098-Profile-Verification",
      approvalTime: null,
    },
  ],
  "b-sharpe": [
    {
      for: "account_holder", profiles: ANYONE, countries: ["CH", ...EEA],
      scope: "b-sharpe for Swiss and European cross-border accounts.",
      documents: ["Individuals: valid passport or national ID card and proof of residential address.", "Businesses: company registration/UID number, proof of existence and IDs for authorised signatories and UBOs."],
      documentsUrl: "https://www.b-sharpe.com/en/help-and-support-centre/",
      approvalTime: { label: "Within 24 working hours", detail: "b-sharpe says account activation typically completes within 24 working hours (excluding weekends and public holidays) after complete document submission.", url: "https://www.b-sharpe.com/en/help-and-support-centre/" },
    },
  ],
  alpian: [
    {
      for: "account_holder", profiles: PERSON, countries: ["CH"],
      scope: "Alpian Swiss digital bank accounts (Swiss residents only).",
      documents: ["Valid Swiss ID card, passport or Swiss residence permit (B/C), plus in-app biometric/video identification."],
      documentsUrl: "https://www.alpian.com",
      approvalTime: null,
    },
  ],
  venn: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["CA"],
      scope: "Venn (formerly Vault) business accounts for Canadian companies.",
      documents: ["Canadian business registration or Articles of Incorporation and proof of business address.", "Government photo ID for directors, beneficial owners (25%+) and the account admin."],
      documentsUrl: "https://www.venn.ca/pricing",
      approvalTime: null,
    },
  ],
  loop: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["CA"],
      scope: "Loop Financial accounts for Canadian businesses.",
      documents: ["Canadian Articles of Incorporation / Business Number and proof of operating address.", "Government photo ID for directors, beneficial owners (25%+) and authorised users."],
      documentsUrl: "https://support.bankonloop.com/article/onboarding-faqs",
      approvalTime: null,
    },
  ],
  "knightsbridge-fx": [
    {
      for: "account_holder", profiles: ANYONE, countries: ["CA", "US"],
      scope: "Knightsbridge FX for Canadian and US currency exchanges (CAD 2,000 minimum).",
      documents: ["Individuals: valid government photo ID (passport or driver’s licence) and Canadian/US bank account details.", "Businesses: corporate incorporation documents and authorised officer/UBO IDs."],
      documentsUrl: "https://www.knightsbridgefx.com",
      approvalTime: null,
    },
  ],
  "flash-payments": [
    {
      for: "sender", profiles: ANYONE, countries: ["AU"],
      scope: "Flash Payments (AUSTRAC/AFSL regulated) for senders in Australia.",
      documents: ["Individuals: valid Australian driver’s licence or passport verified online.", "Businesses: ACN/ABN registration details and director/UBO identity verification."],
      documentsUrl: "https://www.flash-payments.com",
      approvalTime: null,
    },
  ],
  bcremit: [
    {
      for: "sender", profiles: PERSON, countries: ["GB", "US", "CA", ...EEA],
      scope: "BCRemit for diaspora transfers to the Philippines.",
      documents: ["Valid government-issued photo ID (passport, driving licence or residence permit) and selfie check.", "Proof of address or source of funds for higher transfer tiers, if asked."],
      documentsUrl: "https://www.bcremit.com",
      approvalTime: null,
    },
  ],
  // --- APAC (HK, SG, PH, ID, MY, CN, KR, TH) ---
  currenxie: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Currenxie Global Account for businesses (does not support personal accounts, sole traders or US-incorporated entities).",
      documents: ["Business Registration Certificate or Certificate of Incorporation.", "Government photo ID (passport or national ID) and proof of address for the signing director and every 25%+ beneficial owner.", "Company website URL or description of commercial activities."],
      documentsUrl: "https://www.currenxie.com/en/support/what-documents-s-are-needed-for-opening-a-global-account",
      approvalTime: { label: "Within 3 business days", detail: "Currenxie says completed Global Account applications are typically reviewed and approved within 3 business days.", url: "https://www.currenxie.com/en/support/how-long-does-it-take-to-get-approved" },
    },
  ],
  statrys: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["HK", "SG"],
      scope: "Statrys business accounts for Hong Kong, Singapore and BVI registered companies.",
      documents: ["Certificate of Incorporation, Business Registration/License and Articles of Association.", "Valid passports/IDs and proof of residential address (under 3 months old) for directors, UBOs and authorised users.", "Operational business proof (website, client/supplier contracts, invoices or business plan)."],
      documentsUrl: "https://statrys.com/help/what-documents-do-i-need-to-open-a-statrys-account",
      approvalTime: { label: "1–3 business days", detail: "Statrys says business account opening typically takes 1–3 business days after complete online KYB submission.", url: "https://statrys.com/help/what-documents-do-i-need-to-open-a-statrys-account" },
    },
  ],
  worldfirst: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "WorldFirst World Account for businesses and e-commerce sellers.",
      documents: ["Certificate of incorporation, articles of association and proof of registered business address.", "Passport or national ID plus proof of address for directors and 25%+ beneficial owners.", "Active trade proof: website URL, marketplace store profile, supplier invoices or contracts."],
      documentsUrl: "https://www.worldfirst.com/uk/help-centre/onboarding/onboarding-requirements/",
      approvalTime: null,
    },
  ],
  tazapay: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Tazapay cross-border business collection and payout accounts.",
      documents: ["Certificate of incorporation, memorandum and articles of association, shareholding structure and proof of operating address.", "Government ID and address proof for directors, officers and 25%+ UBOs, plus website/bank statements or invoices."],
      documentsUrl: "https://support.tazapay.com/",
      approvalTime: { label: "3–5 business days", detail: "Tazapay says business KYB review typically takes 3–5 business days once complete documents are submitted.", url: "https://tazapay.com" },
    },
  ],
  straitsx: [
    {
      for: "account_holder", profiles: PERSON, countries: ["SG"],
      scope: "StraitsX personal accounts in Singapore (XSGD/XUSD).",
      documents: ["Singapore Citizens, PRs and FIN holders: instant eKYC via Singpass MyInfo.", "International users: valid passport and proof of address (utility/telco bill or bank statement)."],
      documentsUrl: "https://support.straitsx.com/",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "StraitsX business accounts.",
      documents: ["Company incorporation documents, corporate ownership structure and director/UBO photo ID and address proof."],
      documentsUrl: "https://support.straitsx.com/",
      approvalTime: null,
    },
  ],
  aspire: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["SG", "ID", "HK"],
      scope: "Aspire business accounts in Singapore and Southeast Asia.",
      documents: ["Business registration (e.g. ACRA BizFile in Singapore), constitution/shareholding records and director/UBO identity verification (Singpass MyInfo supported for SG directors)."],
      documentsUrl: "https://aspireapp.com",
      approvalTime: null,
    },
  ],
  "coins-ph": [
    {
      for: "account_holder", profiles: PERSON, countries: ["PH"],
      scope: "Coins.ph BSP-licensed accounts in the Philippines.",
      documents: ["Valid government-issued photo ID (Philippine National ID, passport, driver’s licence, UMID or PRC ID) and live selfie verification.", "Proof of address and source of funds for higher Level 3 limits."],
      documentsUrl: "https://coins.ph",
      approvalTime: null,
    },
  ],
  flip: [
    {
      for: "sender", profiles: ANYONE, countries: ["ID"],
      scope: "Flip Globe (powered by Wise Platform) for transfers from Indonesia.",
      documents: ["Indonesian KTP (e-KTP) or valid passport/KITAS for foreign residents, plus a live selfie in the Flip app.", "Flip for Business: Indonesian company legal documents (NIB/NPWP/deed) and director ID."],
      documentsUrl: "https://flip.id",
      approvalTime: null,
    },
  ],
  topremit: [
    {
      for: "sender", profiles: PERSON, countries: ["ID"],
      scope: "Topremit (Bank Indonesia licensed) for transfers from Indonesia.",
      documents: ["Valid Indonesian e-KTP (or passport + KITAS/KITAP for foreigners) and a live selfie in the app."],
      documentsUrl: "https://topremit.com",
      approvalTime: null,
    },
  ],
  "sunway-money": [
    {
      for: "sender", profiles: PERSON, countries: ["MY"],
      scope: "Sunway Money (BNM licensed) for senders in Malaysia.",
      documents: ["Malaysian MyKad (or valid passport with work/residence pass for non-Malaysians) and live eKYC selfie."],
      documentsUrl: "https://sunwaymoney.com",
      approvalTime: null,
    },
  ],
  pandaremit: [
    {
      for: "sender", profiles: PERSON,
      scope: "PandaRemit for personal cross-border transfers (including to China Alipay/WeChat/UnionPay).",
      documents: ["Valid government-issued photo ID (passport, driver’s licence or national ID) and live eKYC selfie via Jumio."],
      documentsUrl: "https://www.pandaremit.com",
      approvalTime: null,
    },
  ],
  sentbe: [
    {
      for: "sender", profiles: PERSON, countries: ["KR"],
      scope: "SentBe for personal senders in South Korea.",
      documents: ["South Korean Resident Registration Card, Driver’s Licence or Foreigner Registration Card (ARC), plus Korean bank account verification."],
      documentsUrl: "https://www.sentbe.com",
      approvalTime: null,
    },
  ],
  wirebarley: [
    {
      for: "sender", profiles: ANYONE, countries: ["KR", "US", "AU", "NZ", "CA", "HK"],
      scope: "WireBarley for personal and business senders (Korea, US, Australia, NZ, Canada, HK).",
      documents: ["Valid government-issued photo ID (passport, driver’s licence or ARC in South Korea) and local bank account verification.", "Business accounts: company registration papers and authorised representative ID."],
      documentsUrl: "https://www.wirebarley.com",
      approvalTime: null,
    },
  ],
  deemoney: [
    {
      for: "sender", profiles: ANYONE, countries: ["TH"],
      scope: "DeeMoney (Bank of Thailand licensed) for senders in Thailand.",
      documents: ["Thai National ID card (for Thai nationals) or valid passport plus work permit/long-stay visa (for foreign residents), verified in-app.", "DeeBusiness: Thai company DBD registration documents and authorised director IDs."],
      documentsUrl: "https://www.deemoney.com",
      approvalTime: null,
    },
  ],
  // --- Africa ---
  nala: [
    {
      for: "sender", profiles: PERSON, countries: ["US", "GB", ...EEA],
      scope: "NALA personal remittances from the US, UK and Europe to Africa.",
      documents: ["Valid government-issued photo ID (passport, national ID card or driver’s licence).", "Live biometric selfie taken in the NALA app.", "Proof of address or supplemental documents for limit increases, if asked."],
      documentsUrl: "https://help.nala.com",
      approvalTime: { label: "Minutes; 24–72 hours if manual review", detail: "NALA says automated KYC verification typically clears in seconds or minutes, while manual compliance reviews can take 24 to 72 hours.", url: "https://help.nala.com" },
    },
  ],
  flutterwave: [
    {
      for: "sender", profiles: PERSON,
      scope: "Send App by Flutterwave for personal cross-border transfers.",
      documents: ["Valid government-issued photo ID captured live in-app (international passport, driver’s licence or national ID/NIN slip in Nigeria).", "Proof of address (utility bill) for higher sending tiers, if asked."],
      documentsUrl: "https://flutterwave.com",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Flutterwave Business merchant and payout accounts.",
      documents: ["Certificate of incorporation / business registration documents and memorandum/articles of association (e.g. CAC forms in Nigeria).", "Valid government photo ID for directors/owners and settlement bank account details."],
      documentsUrl: "https://flutterwave.com",
      approvalTime: null,
    },
  ],
  "yellow-card": [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Yellow Card B2B institutional accounts only (consumer retail app shut down December 31, 2025).",
      documents: ["Official corporate registration/incorporation documents and tax identification numbers.", "Proof of business operating address, UBO disclosures and authorised representative IDs for AML/Travel Rule compliance."],
      documentsUrl: "https://yellowcard.io",
      approvalTime: null,
    },
  ],
  raenest: [
    {
      for: "account_holder", profiles: PERSON, countries: ["NG", "KE", "GH", "ZA", "UG", "TZ", "RW"],
      scope: "Raenest (formerly Geegpay) personal and freelancer accounts (KYC Levels 1–6).",
      documents: ["Valid government-issued photo ID matching your profile (NG: passport, NIN/National ID or driver’s licence; KE/GH/ZA/UG/TZ/RW: National ID, Voter’s Card where accepted, driver’s licence or passport).", "Live selfie verification and proof of address (utility bill or bank statement).", "Employment details or freelance profile links (Upwork, Fiverr, LinkedIn) and local payout bank details."],
      documentsUrl: "https://help.raenest.com",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Raenest Business accounts.",
      documents: [],
      documentsNote: "Requires legal entity incorporation/registration documents, owner/director IDs and business bank details via Raenest Business onboarding.",
      documentsUrl: "https://help.raenest.com",
      approvalTime: null,
    },
  ],
  grey: [
    {
      for: "account_holder", profiles: PERSON, countries: ["NG", "KE", "GH", "UG", "TZ", "ZA", "EG", "IN"],
      scope: "Grey personal and freelancer multi-currency accounts.",
      documents: ["Valid government-issued photo ID matching your sign-up name letter-for-letter (passport, national ID card, driver’s licence, voter’s card or NIN slip in Nigeria).", "Live in-app video selfie check.", "Proof of address (utility bill or bank statement within 3 months) or source of funds for limit upgrades, if asked."],
      documentsUrl: "https://support.grey.co",
      approvalTime: { label: "A few minutes, up to 24 hours", detail: "Grey says personal KYC typically completes within a few minutes automatically, and manual reviews can take up to 24 hours.", url: "https://support.grey.co" },
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Grey Business accounts.",
      documents: ["Corporate registration documents (such as CAC certificate in Nigeria or local business registration in Kenya/Ghana).", "Director and beneficial owner (UBO) identity verification."],
      documentsUrl: "https://support.grey.co",
      approvalTime: { label: "1–3 business days", detail: "Grey says Business KYB corporate document verification takes approximately 1 to 3 business days.", url: "https://support.grey.co" },
    },
  ],
  cleva: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["NG", "GH", "UG"],
      scope: "Cleva USD receiving accounts (Kenya is explicitly excluded on Cleva’s prohibited countries list).",
      documents: ["In Nigeria: Bank Verification Number (BVN) matching your submitted government ID.", "Valid government-issued photo ID (international passport, NIN, voter’s card or driver’s licence) and live facial liveness check.", "Proof of address, employment letters or client invoices for tier upgrades or third-party deposit checks, if asked."],
      documentsUrl: "https://help.getcleva.com/",
      approvalTime: null,
    },
  ],
  afriex: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Afriex personal remittances and AFX Business accounts (includes Ethiopia and Ivory Coast corridors).",
      documents: ["Personal: valid government-issued ID (passport, driver’s licence or national ID), residential address and live selfie.", "Business (AFX): business registration documents and source-of-funds details."],
      documentsUrl: "https://www.afriex.com",
      approvalTime: null,
    },
  ],
  eversend: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["UG", "KE", "RW", "NG", "GH", "TZ", "ZA", "CI", "SN"],
      scope: "Eversend multi-currency wallets and virtual accounts.",
      documents: ["Original valid government-issued photo ID with at least 3 months’ validity remaining (passport, national ID card or driver’s licence).", "Short live video selfie matching the submitted ID."],
      documentsUrl: "https://support.eversend.co",
      approvalTime: { label: "Within 5 minutes", detail: "Eversend says most identity verifications process and approve automatically within 5 minutes.", url: "https://support.eversend.co" },
    },
  ],
  shyft: [
    {
      for: "account_holder", profiles: PERSON, countries: ["ZA"],
      scope: "Shyft by Standard Bank (FICA/KYC for South African residents age 18+; foreign nationals in ZA need an active Standard Bank account).",
      documents: ["Valid South African green barcoded ID book, Smart ID card or valid passport.", "Live in-app biometric selfie verification.", "Proof of residence and SARS tax number where required (e.g. FIA clearance)."],
      documentsUrl: "https://www.shyft.co.za",
      approvalTime: null,
    },
  ],
  futureforex: [
    {
      for: "account_holder", profiles: PERSON, countries: ["ZA"],
      scope: "Future Forex personal FICA/KYC in South Africa (R100,000 typical minimum).",
      documents: ["Valid South African ID / Smart ID card (or foreign passport for non-residents).", "Proof of residential address (utility bill or bank statement under 3 months old).", "Source-of-funds documents and SARS AIT tax clearance pin when exceeding the annual SDA."],
      documentsUrl: "https://futureforex.co.za/faqs",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["ZA"],
      scope: "Future Forex business FICA/KYB in South Africa.",
      documents: ["CIPC company registration documents and Memorandum of Incorporation.", "Proof of business address, director/representative resolution and FICA IDs, plus commercial invoices."],
      documentsUrl: "https://futureforex.co.za/faqs",
      approvalTime: null,
    },
  ],
  "mama-money": [
    {
      for: "sender", profiles: PERSON, countries: ["ZA"],
      scope: "Mama Money FICA/KYC for senders in South Africa.",
      documents: ["Standard tier: biometric selfie plus South African ID, valid passport, valid foreign national ID (except Kenya), refugee/asylum document or accepted voter’s card.", "Higher limit (SA ID): proof of address under 6 months old.", "Higher limit (non-SA ID): proof of permit (for passport holders) and proof of income (payslip or 3 months’ bank statements)."],
      documentsUrl: "https://www.mamamoney.co.za/blog-posts/mama-money-limits-how-much-you-can-send",
      approvalTime: null,
    },
  ],
  // --- LatAm ---
  global66: [
    {
      for: "account_holder", profiles: PERSON, countries: ["CL", "CO", "PE", "MX", "AR", "BR"],
      scope: "Global66 personal accounts in Chile, Colombia, Peru, Mexico, Argentina and Brazil.",
      documents: ["Valid government-issued photo ID (Cédula in CL/CO, DNI in PE/AR, INE in MX or valid passport).", "Mobile SMS check and live facial biometric selfie in the Global66 app.", "Proof of address and source-of-funds documentation if exceeding 20,000 USD."],
      documentsUrl: "https://ayuda.global66.com/",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["CL", "CO", "PE", "MX", "AR", "BR"],
      scope: "Global66 Business accounts.",
      documents: ["Company incorporation documents and local tax ID (RUT, NIT, RUC, RFC, CUIT or CNPJ).", "Proof of legal representation, UBO disclosures and commercial activity details."],
      documentsUrl: "https://ayuda.global66.com/",
      approvalTime: null,
    },
  ],
  arq: [
    {
      for: "account_holder", profiles: PERSON, countries: ["MX", "AR", "CO", "BR"],
      scope: "ARQ (formerly DolarApp) personal accounts in Mexico, Argentina, Colombia and Brazil.",
      documents: ["Valid government-issued photo ID (passport, national ID card, driver’s licence or residence permit) and local tax ID where required (e.g. CPF in Brazil).", "In-app facial biometric selfie check.", "Proof of address, employment details and source of funds if requested."],
      documentsUrl: "https://www.arqfinance.com/help/cant-access-account/",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["MX", "AR", "CO", "BR"],
      scope: "ARQ Business accounts.",
      documents: ["Corporate legal registration documents, company tax ID and proof of active status.", "Legal representative ID verification and UBO disclosures."],
      documentsUrl: "https://www.arqfinance.com/help/cant-access-account/",
      approvalTime: null,
    },
  ],
  "felix-pago": [
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "Félix Pago WhatsApp remittance senders in the United States.",
      documents: ["Basic profile: full name, date of birth, email, physical US address and phone number.", "Government-issued photo ID (US driver’s license, passport or consular ID) required to raise limits and mandatory at 3,000 USD or more."],
      documentsUrl: "https://www.felixpago.com",
      approvalTime: null,
    },
  ],
  bitso: [
    {
      for: "account_holder", profiles: PERSON, countries: ["MX", "AR", "CO"],
      scope: "Bitso personal accounts in Mexico, Argentina and Colombia (Brazil retail transitioned to Mercado Bitcoin; Bitso Business remains active).",
      documents: ["Valid government-issued photo ID and facial biometric verification.", "Proof of residential address (utility bill) and proof of income (tax return or payslips) for higher deposit/withdrawal limits."],
      documentsUrl: "https://support.bitso.com",
      approvalTime: { label: "Limit increases within 72 hours", detail: "Bitso says compliance review of supplemental documents for higher deposit/withdrawal tiers takes up to 72 hours. Initial basic KYC has no fixed public SLA.", url: "https://support.bitso.com" },
    },
  ],
  blindpay: [
    {
      for: "account_holder", profiles: PERSON,
      scope: "BlindPay KYC Standard and KYC Enhanced (higher-risk jurisdictions).",
      documents: ["Standard: full name, date of birth, tax ID, address and valid passport or national ID card.", "Enhanced: passport or national ID card plus source of funds and transaction purpose."],
      documentsUrl: "https://docs.blindpay.com/docs/compliance-faq-kyc-kyb-limits-and-rfis",
      approvalTime: { label: "~60 seconds (Standard) / 3h–1 biz day (Enhanced)", detail: "BlindPay’s compliance docs state ~60 seconds automated review for KYC Standard and 3 hours to 1 business day manual review for KYC Enhanced.", url: "https://docs.blindpay.com/docs/compliance-faq-kyc-kyb-limits-and-rfis" },
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "BlindPay KYB Standard.",
      documents: ["Incorporation documents, company tax ID, registered address, proof of ownership/address and UBO details for all >25% owners."],
      documentsUrl: "https://docs.blindpay.com/docs/compliance-faq-kyc-kyb-limits-and-rfis",
      approvalTime: { label: "3 hours to 1 business day", detail: "BlindPay’s compliance docs state manual compliance review for KYB Standard takes 3 hours to 1 business day.", url: "https://docs.blindpay.com/docs/compliance-faq-kyc-kyb-limits-and-rfis" },
    },
  ],
  "mural-pay": [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Mural Pay business organizations (sales-gated production access).",
      documents: ["Legal corporate registration documents, corporate structure details and beneficial ownership disclosures via Mural Pay’s hosted KYB flow."],
      documentsUrl: "https://developers.muralpay.com/reference/get-a-hosted-kyc-link-for-an-organization-v2",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: PERSON,
      scope: "Mural Pay individual contractor sub-accounts.",
      documents: ["Standard Tier: government-issued photo ID, proof of residence, tax information, and selfie or source-of-funds check if asked."],
      documentsUrl: "https://developers.muralpay.com/reference/get-a-hosted-kyc-link-for-an-organization-v2",
      approvalTime: null,
    },
  ],
  dlocal: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "dLocal and dLocal Go merchant KYB onboarding.",
      documents: ["Corporate incorporation documents and local tax ID (EIN, CNPJ, CUIT, RFC, RUT, NIT, etc.).", "Director and beneficial owner (UBO) identity documents, active business website and settlement bank details."],
      documentsUrl: "https://helpcenter.dlocalgo.com/en/collections/393282-account-setting",
      approvalTime: null,
    },
  ],
  higlobe: [
    {
      for: "account_holder", profiles: PERSON, countries: ["MX", "BR", "AR", "CO", "PH", "IN"],
      scope: "Higlobe personal and freelancer USD receiving accounts.",
      documents: ["Mexico: INE, valid passport + CURP, resident visa or Matrícula Consular; Brazil: RG, CNH or CRNM; Argentina: valid passport and DNI; Colombia: Cédula de Ciudadanía, Cédula de Extranjería or driver’s licence; Philippines/India: valid government photo ID."],
      documentsUrl: "https://www.higlobe.com/faq",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["MX", "BR", "AR", "CO", "PH", "IN"],
      scope: "Higlobe Business accounts.",
      documents: ["Official corporate formation documents showing ownership structure (e.g. full Contrato Social in Brazil; CNPJ lookup alone is not accepted).", "Government ID for beneficial owners and authorised representatives."],
      documentsUrl: "https://www.higlobe.com/faq",
      approvalTime: null,
    },
  ],
  grabrfi: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["AR", "BR", "CL", "CO", "MX", "PE", "NG", "GH"],
      scope: "GrabrFi US dollar accounts for LatAm and Africa (age 18+).",
      documents: ["Permanent valid government-issued photo ID (passport, national ID card or driver’s licence; temporary IDs rejected) and personal Tax ID.", "Live in-app biometric facial scan.", "Proof of residential address under 3 months old (utility bill, bank statement or lease), if asked; businesses add corporate formation docs and director/UBO IDs."],
      documentsUrl: "https://helpcenter.grabrfi.com/en/support/solutions/articles/103000204732-is-it-free-to-open-an-account-",
      approvalTime: null,
    },
  ],
  husky: [
    {
      for: "account_holder", profiles: PERSON, countries: ["BR"],
      scope: "Husky by Nomad PF (individual) accounts in Brazil.",
      documents: ["Brazilian CPF and valid photo ID (RG, CNH or passport).", "Local Brazilian bank account under the same CPF (verified via R$0.01 deposit) and service contracts if raising limits."],
      documentsUrl: "https://help.husky.io/hc/en-us/categories/360002599733-For-Users",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["BR"],
      scope: "Husky by Nomad PJ (corporate) accounts in Brazil.",
      documents: ["Active Brazilian CNPJ, Contrato Social/bylaws and proof of business address.", "Corporate Brazilian bank account under the same CNPJ and international service invoices where requested."],
      documentsUrl: "https://help.husky.io/hc/en-us/categories/360002599733-For-Users",
      approvalTime: null,
    },
  ],
  "remessa-online": [
    {
      for: "account_holder", profiles: PERSON, countries: ["BR"],
      scope: "Remessa Online PF (individual) accounts in Brazil.",
      documents: ["Cadastro Simples: Brazilian CPF and valid photo ID (RG or CNH).", "Cadastro Completo (higher limits): latest IRPF income tax declaration and filing receipt."],
      documentsUrl: "https://ajuda.remessaonline.com.br/hc/pt-br",
      approvalTime: null,
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["BR"],
      scope: "Remessa Online PJ (business) accounts in Brazil.",
      documents: ["Consolidated Contrato Social or Estatuto Social, CNPJ card and proof of business address.", "RG/CNH and CPF of legal administrators and majority shareholders, plus recent revenue statements for volume limits."],
      documentsUrl: "https://ajuda.remessaonline.com.br/hc/pt-br",
      approvalTime: { label: "Up to 2 business days (PJ)", detail: "Remessa Online says corporate PJ document and compliance analysis typically takes up to 2 business days.", url: "https://ajuda.remessaonline.com.br/hc/pt-br" },
    },
  ],
  techfx: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["BR"],
      scope: "TechFX PJ accounts (Brazilian CNPJ legal entities exporting services only).",
      documents: ["Active Brazilian CNPJ with compatible service activity (CNAE) and updated Contrato Social.", "Legal representative’s RG, CPF and proof of residential address, plus international service contracts."],
      documentsUrl: "https://www.techfx.com.br/guia-de-recebimentos-internacionais/",
      approvalTime: { label: "1–3 business days", detail: "TechFX says PJ document review and account approval typically takes 1 to 3 business days after submission.", url: "https://www.techfx.com.br/guia-de-recebimentos-internacionais/" },
    },
  ],
  takenos: [
    {
      for: "account_holder", profiles: PERSON, countries: ["AR", "CO", "CL", "PE", "BR"],
      scope: "Takenos individual accounts in LatAm (age 18+).",
      documents: ["Valid government-issued photo ID (DNI, Cédula de Identidad or valid passport) and in-app biometric selfie.", "Proof of funds if requesting monthly limits above 10,000 USD."],
      documentsUrl: "https://help.takenos.com/",
      approvalTime: { label: "Limit increases up to 72 business hours", detail: "Takenos says compliance reviews for monthly limit increases take up to 72 business hours; initial automated KYC has no fixed public SLA.", url: "https://help.takenos.com/" },
    },
  ],
  wallbit: [
    {
      for: "account_holder", profiles: PERSON, countries: ["AR", "CO", "MX", "BR", "CL", "PE"],
      scope: "Wallbit US bank and brokerage accounts for LatAm remote workers.",
      documents: ["Valid government-issued photo ID (passport or local national ID: DNI, Cédula, INE), biometric selfie and local tax/occupation details."],
      documentsUrl: "https://help.wallbit.io/",
      approvalTime: null,
    },
  ],
  "vita-wallet": [
    {
      for: "account_holder", profiles: ANYONE, countries: ["CL", "CO", "MX", "AR", "PE"],
      scope: "Vita Wallet accounts across Chile, Colombia, Mexico, Argentina and Peru.",
      documents: ["Valid local government-issued photo ID (Cédula in CL/CO/PE, DNI in AR, INE/passport in MX) and in-app facial biometric selfie.", "Source-of-funds documents for monthly limits above 5,000 USD (2,500 USD in Argentina)."],
      documentsUrl: "https://vitawallet.io",
      approvalTime: { label: "A few minutes", detail: "Vita Wallet says its digital automated identity verification processes within a few minutes.", url: "https://vitawallet.io" },
    },
  ],
  belo: [
    {
      for: "account_holder", profiles: PERSON, countries: ["AR", "CO", "MX"],
      scope: "Belo personal digital-dollar accounts.",
      documents: ["Valid government-issued photo ID (DNI, passport or local Cédula) and in-app biometric selfie.", "Proof of funds if requesting expanded fiat or crypto limits."],
      documentsUrl: "https://help.belo.app/es/articles/5362779-terminos-y-condiciones-generales",
      approvalTime: null,
    },
  ],
  // --- Indian Banks ---
  "hdfc-bank": [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN"],
      scope: "HDFC Bank RemitNow outward LRS and inward foreign remittances (existing KYC-compliant HDFC account required).",
      documents: ["Permanent Account Number (PAN) linked to your HDFC Bank account and valid passport.", "FEMA / LRS declaration and purpose-specific proof (university admission letter, travel ticket, family relationship or export invoice for inward commercial receipts)."],
      documentsUrl: "https://www.hdfc.bank.in",
      approvalTime: null,
    },
  ],
  "icici-bank": [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN"],
      scope: "ICICI Bank Money2World outward LRS and inward export/personal remittances.",
      documents: ["Permanent Account Number (PAN), Form A2 / FEMA LRS declaration and purpose-of-remittance supporting documents.", "KYC-compliant ICICI Bank account (or valid ID/Video KYC for Money2India senders abroad)."],
      documentsUrl: "https://www.icici.bank.in",
      approvalTime: null,
    },
  ],
  "state-bank-of-india": [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN"],
      scope: "State Bank of India (SBI) outward FxOut/SWIFT and inward foreign remittances.",
      documents: ["KYC-compliant SBI savings or current account with linked Permanent Account Number (PAN).", "Form A2 declaration and purpose-of-remittance proof (education, medical, family maintenance or export invoice)."],
      documentsUrl: "https://sbi.co.in",
      approvalTime: null,
    },
  ],
  "idfc-first-bank": [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN"],
      scope: "IDFC FIRST Bank Pay Abroad outward LRS and inward SWIFT remittances.",
      documents: ["KYC-compliant IDFC FIRST Bank account, Permanent Account Number (PAN) and digital Form A2 declaration.", "Purpose-specific supporting documents (or inward disposal instructions and export invoice for commercial receipts)."],
      documentsUrl: "https://www.idfcfirst.bank.in",
      approvalTime: null,
    },
  ],
  "canara-bank": [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN"],
      scope: "Canara Bank outward LRS SWIFT and inward foreign remittances.",
      documents: ["KYC-compliant Canara Bank account, Permanent Account Number (PAN) and Form A2 / FEMA declaration.", "Purpose-of-remittance supporting documents (or export documentation for commercial inward remittances)."],
      documentsUrl: "https://www.canarabank.bank.in",
      approvalTime: null,
    },
  ],
  // --- Core On/Off-Ramps, Stablecoin & B2B Payment Infrastructure ---
  transak: [
    {
      for: "account_holder", profiles: PERSON,
      scope: "Transak personal fiat-to-crypto on/off-ramp (Lite $10–$200, Standard up to $20k–$25k, Enhanced $75k+).",
      documents: ["Lite KYC: legal name, phone number, date of birth and residential address.", "Standard KYC: valid government-issued photo ID, proof of address dated within 3 months and a live selfie.", "Enhanced KYC: source-of-funds verification for higher limits."],
      documentsUrl: "https://transak.com",
      approvalTime: { label: "30 seconds to 48 hours", detail: "Transak says Lite KYC clears in ~30 seconds, Standard KYC in ~10 minutes (up to 4 hours), and Enhanced KYC in 1–2 days.", url: "https://transak.com" },
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Transak KYB business accounts.",
      documents: ["Corporate registration documents, proof of business address, beneficial ownership (UBO) details and director/UBO government IDs."],
      documentsUrl: "https://transak.com",
      approvalTime: { label: "1–2 business days", detail: "Transak says Enhanced and business KYB verification reviews typically complete within 1–2 business days.", url: "https://transak.com" },
    },
  ],
  moonpay: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "MoonPay fiat on-ramp and off-ramp accounts.",
      documents: ["Valid government-issued photo ID (with at least 1 month remaining validity) and a 3D live selfie check.", "Proof of address dated within 3 months (utility bill or bank statement) if prompted by your tier or region."],
      documentsUrl: "https://www.moonpay.com",
      approvalTime: { label: "Minutes to a few days", detail: "MoonPay says automated identity checks usually clear in minutes, while manual reviews can take up to a few days.", url: "https://www.moonpay.com" },
    },
  ],
  "ramp-network": [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Ramp Network fiat-to-crypto on/off-ramp.",
      documents: ["Valid government-issued photo ID and live selfie verification.", "US threshold checks: proof of address above 5,000 USD, source of wealth above 10,000 USD and source of funds above 20,000 USD."],
      documentsUrl: "https://rampnetwork.com",
      approvalTime: { label: "Seconds (automated regions)", detail: "Ramp Network says document-free automated verification in supported regions completes in seconds; manual reviews take longer.", url: "https://rampnetwork.com" },
    },
  ],
  banxa: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Banxa fiat-to-crypto on/off-ramp.",
      documents: ["Personal details (name, date of birth and address), valid government-issued photo ID and a liveness selfie check."],
      documentsUrl: "https://banxa.com",
      approvalTime: { label: "A few minutes (automated)", detail: "Banxa says standard automated identity verification completes within a few minutes.", url: "https://banxa.com" },
    },
  ],
  mercuryo: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Mercuryo fiat-crypto ramps (Fast Track no-KYC cap €700 outside the US).",
      documents: ["Valid government-issued photo ID with at least 3 months validity remaining (US residents: driver’s licence or state ID only) and a live selfie.", "Proof of address and SSN/tax ID if requested by region or higher volume tier."],
      documentsUrl: "https://mercuryo.io",
      approvalTime: null,
    },
  ],
  "alchemy-pay": [
    {
      for: "account_holder", profiles: PERSON,
      scope: "Alchemy Pay personal fiat-crypto ramp.",
      documents: ["Valid government-issued photo ID and live selfie check."],
      documentsUrl: "https://alchemypay.org",
      approvalTime: { label: "1 minute to 24 hours", detail: "Alchemy Pay says automated personal KYC completes in about 1 minute and up to 24 hours when manual review is needed.", url: "https://alchemypay.org" },
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Alchemy Pay business KYB integration.",
      documents: ["Certificate of incorporation, certificate of incumbency, government IDs for 25%+ UBOs and proof of address dated within 3 months."],
      documentsUrl: "https://alchemypay.org",
      approvalTime: { label: "Up to 5 working days", detail: "Alchemy Pay says corporate KYB onboarding reviews take up to 5 working days once all documents are submitted.", url: "https://alchemypay.org" },
    },
  ],
  guardarian: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Guardarian fiat-crypto on/off-ramp.",
      documents: ["Low-tier threshold: email confirmation.", "Full KYC: valid government-issued photo ID and facial liveness verification."],
      documentsUrl: "https://guardarian.com",
      approvalTime: null,
    },
  ],
  stripe: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Stripe business payment and Connect payout accounts.",
      documents: ["Government-issued photo ID for the account representative and beneficial owners.", "Tax/entity registration (US SSN/EIN via IRS Letter 147C/SS-4, or local company incorporation and tax/GST registration) plus bank account proof."],
      documentsUrl: "https://stripe.com",
      approvalTime: { label: "Instant to 3 business days", detail: "Stripe says automated business verification often completes instantly and manual document reviews typically finish within 1–3 business days.", url: "https://stripe.com" },
    },
  ],
  coinbase: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Coinbase personal and business exchange/stablecoin accounts.",
      documents: ["Valid government-issued photo ID, tax ID (such as US SSN) and live selfie check.", "Proof of address or business formation/UBO documents if prompted by jurisdiction or account type."],
      documentsUrl: "https://www.coinbase.com",
      approvalTime: null,
    },
  ],
  bridge: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Bridge (Stripe) stablecoin orchestration and virtual-account APIs.",
      documents: ["Individuals: legal name, date of birth, residential address, tax ID/SSN and government photo ID.", "Businesses: entity formation documents, tax ID and beneficial owner (UBO) identification."],
      documentsUrl: "https://www.bridge.xyz",
      approvalTime: null,
    },
  ],
  nium: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Nium B2B global payout and real-time payment APIs.",
      documents: ["Certificate of incorporation / business registry extract and ownership/UBO structure.", "Operating proof (website or commercial invoices) plus government photo IDs and proof of address for UBOs and directors."],
      documentsUrl: "https://www.nium.com",
      approvalTime: { label: "Real-time (eKYC/eKYB)", detail: "Nium says automated eKYC/eKYB verification completes in real time for standard eligible entities; complex structures undergo manual compliance review.", url: "https://www.nium.com" },
    },
  ],
  thunes: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Thunes Direct Global Network B2B cross-border payout infrastructure.",
      documents: ["Corporate KYB and AML compliance documentation plus stakeholder/UBO government IDs submitted via the Thunes Business Hub."],
      documentsUrl: "https://www.thunes.com",
      approvalTime: null,
    },
  ],
  rapyd: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Rapyd global fintech and payout platform for businesses.",
      documents: ["Certificate of incorporation, proof of business address, UBO shareholding chart, representative photo ID and corporate bank statement."],
      documentsUrl: "https://www.rapyd.net",
      approvalTime: { label: "Instant up to 30 days", detail: "Rapyd says automated onboarding can approve eligible low-risk businesses immediately, while full underwriting reviews can take up to 30 days.", url: "https://www.rapyd.net" },
    },
  ],
  bvnk: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "BVNK enterprise stablecoin and fiat payment accounts.",
      documents: ["Corporate formation documents, proof of registered/operating address, and government photo IDs plus selfies for directors and UBOs."],
      documentsUrl: "https://bvnk.com",
      approvalTime: null,
    },
  ],
  conduit: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Conduit B2B stablecoin and cross-border FX liquidity.",
      documents: ["Entity registration certificate, corporate tax ID and identification for all 25%+ beneficial owners (UBOs)."],
      documentsUrl: "https://www.conduit.financial",
      approvalTime: null,
    },
  ],
  currencycloud: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Currencycloud (Visa) B2B wholesale FX and cross-border infrastructure.",
      documents: ["Entity registration documents, beneficial ownership (UBO) structure and authorised user identity checks (plus penny-test bank validation in the EEA)."],
      documentsUrl: "https://www.currencycloud.com",
      approvalTime: { label: "1–2 hours (bank activation)", detail: "Currencycloud says bank validation activation typically completes within 1–2 hours after KYB compliance onboarding is cleared.", url: "https://www.currencycloud.com" },
    },
  ],
  "checkout-com": [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Checkout.com enterprise acquiring and card payout platform.",
      documents: ["Certificate of incorporation, proof of business address, and government photo IDs plus proof of address for directors and 25%+ UBOs."],
      documentsUrl: "https://www.checkout.com",
      approvalTime: null,
    },
  ],
  paxos: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Paxos regulated stablecoin issuance and institutional settlement.",
      documents: ["Individuals: valid government-issued photo ID and address verification.", "Institutions: corporate formation documents plus government IDs for beneficial owners and control persons."],
      documentsUrl: "https://www.paxos.com",
      approvalTime: { label: "1 day to several weeks (KYB)", detail: "Paxos says institutional KYB onboarding ranges from about a day for simple entities to several weeks for complex structures.", url: "https://www.paxos.com" },
    },
  ],
  "mastercard-move": [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Mastercard Move institutional cross-border money movement network.",
      documents: ["Principal financial-institution sponsorship plus corporate licensing, AML program and beneficial ownership (UBO) due diligence."],
      documentsUrl: "https://www.mastercard.com",
      approvalTime: null,
    },
  ],
  "visa-direct": [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Visa Direct real-time push-to-card and account payout network.",
      documents: ["Sponsoring Visa acquiring BIN relationship plus corporate KYB, UBO verification and Visa compliance (VCMS) onboarding."],
      documentsUrl: "https://www.visa.com",
      approvalTime: null,
    },
  ],
  ripple: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Ripple Payments enterprise cross-border settlement.",
      documents: ["Corporate incorporation records, regulatory licences, beneficial ownership (UBO) details and AML / Travel Rule compliance documentation."],
      documentsUrl: "https://ripple.com",
      approvalTime: { label: "Several weeks", detail: "Ripple says enterprise compliance, licensing and technical onboarding typically spans several weeks.", url: "https://ripple.com" },
    },
  ],
  dtcpay: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "dtcpay (MAS Major Payment Institution) fiat and stablecoin accounts.",
      documents: ["Individuals: valid government photo ID and live selfie.", "Businesses: corporate incorporation documents, UBO government IDs and 3 months of source-of-funds statements."],
      documentsUrl: "https://dtcpay.com",
      approvalTime: null,
    },
  ],
  "fomo-pay": [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "FOMO Pay (MAS licensed) B2B treasury and digital payment accounts.",
      documents: ["Completed registration form, certificate of incorporation, Memorandum & Articles of Association, UBO/representative IDs, proof of address and corporate bank proof."],
      documentsUrl: "https://www.fomopay.com",
      approvalTime: { label: "Within 14 working days", detail: "FOMO Pay says business KYB onboarding reviews are typically completed within 14 working days after submitting complete documents.", url: "https://www.fomopay.com" },
    },
  ],
  "triple-a": [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Triple-A licensed crypto-to-fiat business settlement accounts.",
      documents: ["Certificate of incorporation, M&AA / ACRA profile, shareholding chart, proof of address, and ID, proof of address and source of wealth for 25%+ UBOs."],
      documentsUrl: "https://triple-a.io",
      approvalTime: { label: "3–14 business days (KYB)", detail: "Triple-A says business KYB takes 3–14 business days, while end-customer checkout KYC completes in under 1 minute.", url: "https://triple-a.io" },
    },
  ],
  clickpesa: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["TZ", "KE", "UG", "RW"],
      scope: "ClickPesa East Africa business collections and payouts.",
      documents: ["Business registration certificate, TIN/VAT tax registration, government IDs for directors and UBOs, and board resolution."],
      documentsUrl: "https://clickpesa.com",
      approvalTime: { label: "2–3 business days", detail: "ClickPesa says business KYB verification typically completes within 2–3 business days after document upload.", url: "https://clickpesa.com" },
    },
  ],
  fonbnk: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Fonbnk emerging-market mobile-money and stablecoin on/off-ramp.",
      documents: ["Basic KYC: legal name, date of birth and national ID number.", "Advanced KYC: government photo ID (or BVN in Nigeria) plus a live selfie."],
      documentsUrl: "https://fonbnk.com",
      approvalTime: { label: "In seconds (Basic KYC)", detail: "Fonbnk says Basic KYC verification completes in seconds; higher-tier document reviews take longer.", url: "https://fonbnk.com" },
    },
  ],
  koywe: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Koywe LatAm fiat-to-stablecoin and cross-border API rails.",
      documents: ["Businesses: corporate and tax registration (such as RUC), articles of incorporation, proof of address and legal representative photo ID.", "Individuals: unverified cap of 300 USD; full ID verification unlocks unlimited volume."],
      documentsUrl: "https://www.koywe.com",
      approvalTime: null,
    },
  ],
  onafriq: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Onafriq (formerly MFS Africa) pan-African B2B payout network.",
      documents: ["Corporate registration documents, applicable payment/financial licences, and photo ID plus proof of address for 25%+ UBOs and authorised representatives."],
      documentsUrl: "https://onafriq.com",
      approvalTime: null,
    },
  ],
  openpayd: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "OpenPayd embedded finance, virtual IBAN and FX APIs.",
      documents: [],
      documentsNote: "OpenPayd conducts case-by-case corporate KYB and enhanced due diligence (EDD) tailored to each business's jurisdiction, licence and payment flows.",
      documentsUrl: "https://www.openpayd.com",
      approvalTime: { label: "As little as 2 weeks", detail: "OpenPayd says streamlined corporate KYB onboarding can complete in as little as 2 weeks depending on entity complexity.", url: "https://www.openpayd.com" },
    },
  ],
  "banking-circle": [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Banking Circle institutional clearing and multi-currency bank infrastructure.",
      documents: [],
      documentsNote: "Banking Circle serves regulated payment businesses and banks under institutional bank-grade KYB, licensing and AML review.",
      documentsUrl: "https://www.bankingcircle.com",
      approvalTime: null,
    },
  ],
  unlimit: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Unlimit global payment acquiring, payouts and BaaS accounts.",
      documents: ["Corporate registration documents, business activity questionnaire, beneficial ownership (UBO) details and matching corporate bank proof."],
      documentsUrl: "https://www.unlimit.com",
      approvalTime: { label: "1-day path (eligible merchants)", detail: "Unlimit publishes a 1-day fast-track onboarding path for eligible standard merchants; complex business models take longer.", url: "https://www.unlimit.com" },
    },
  ],
  "zero-hash": [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Zero Hash crypto and stablecoin settlement infrastructure.",
      documents: ["Individuals: government-issued photo ID plus SSN and W-9 or W-8BEN tax form.", "Businesses: corporate formation documents and beneficial ownership (UBO) verification."],
      documentsUrl: "https://zerohash.com",
      approvalTime: null,
    },
  ],
  "1money": [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "1Money enterprise stablecoin payment and global payout rails.",
      documents: ["Corporate registration documents, beneficial ownership (UBO) structure, proof of business address, representative photo ID and EIN/tax registration."],
      documentsUrl: "https://www.1money.com",
      approvalTime: null,
    },
  ],
  sphere: [
    {
      for: "account_holder", profiles: PERSON,
      scope: "Sphere personal fiat-to-stablecoin accounts.",
      documents: ["Valid government-issued photo ID, phone/email OTP verification and a live selfie check."],
      documentsUrl: "https://spherepay.co",
      approvalTime: { label: "0–2 business days", detail: "Sphere says personal KYC verification completes in 0–2 business days.", url: "https://spherepay.co" },
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Sphere business stablecoin treasury and cross-border APIs.",
      documents: ["Certificate of incorporation, corporate tax ID and identity verification for all 25%+ beneficial owners (UBOs)."],
      documentsUrl: "https://spherepay.co",
      approvalTime: { label: "2–7 business days", detail: "Sphere says business KYB onboarding typically completes within 2–7 business days.", url: "https://spherepay.co" },
    },
  ],
  brale: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Brale regulated stablecoin issuance and Instant Treasury APIs.",
      documents: ["BSA/AML corporate identity, beneficial ownership and sanctions compliance verification across 100+ supported countries."],
      documentsUrl: "https://brale.xyz",
      approvalTime: { label: "Minutes (automated)", detail: "Brale says automated business onboarding clears in minutes rather than weeks for eligible entities.", url: "https://brale.xyz" },
    },
  ],
  // --- Established FX Brokers & Remitters ---
  "currencies-direct": [
    {
      for: "account_holder", profiles: PERSON,
      scope: "Currencies Direct personal international transfer accounts.",
      documents: ["Valid government-issued photo ID (passport or driver’s licence) and proof of residential address (utility bill or bank statement).", "Source-of-funds documents (such as property sale contracts or payslips) for large transfers."],
      documentsUrl: "https://www.currenciesdirect.com",
      approvalTime: { label: "Minutes to 24 hours", detail: "Currencies Direct says automated digital verification completes in minutes and manual compliance reviews generally complete within 24 hours.", url: "https://www.currenciesdirect.com" },
    },
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Currencies Direct business FX accounts.",
      documents: ["Corporate registration documents and beneficial ownership (UBO) identification."],
      documentsUrl: "https://www.currenciesdirect.com",
      approvalTime: { label: "Minutes to 24 hours", detail: "Currencies Direct says standard digital checks finish in minutes and manual reviews typically finish within 24 hours.", url: "https://www.currenciesdirect.com" },
    },
  ],
  torfx: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "TorFX personal and business currency transfers.",
      documents: ["Valid government-issued photo ID (passport or driver’s licence) and proof of residential address (recent utility bill or bank statement).", "Source-of-funds documentation for very large transfers (such as property sales or inheritance)."],
      documentsUrl: "https://www.torfx.com",
      approvalTime: null,
    },
  ],
  moneycorp: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Moneycorp international payments accounts.",
      documents: ["Valid government-issued photo ID (passport, national ID or photocard driving licence).", "Proof of address dated within 3 months (utility bill, council tax bill or bank statement) plus source of funds for transfers of 10,000 GBP or more."],
      documentsUrl: "https://www.moneycorp.com",
      approvalTime: { label: "Instant (automated)", detail: "Moneycorp says electronic identity verification passes immediately online when details match public records.", url: "https://www.moneycorp.com" },
    },
  ],
  transfermate: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "TransferMate global business and personal cross-border payments.",
      documents: ["Businesses: company registration details, corporate structure and beneficial ownership info, plus invoices/IDs for regulated corridors (CN, IN, BR).", "Individuals: identity or supporting documents requested when triggered by compliance or restricted-corridor rules."],
      documentsUrl: "https://www.transfermate.com",
      approvalTime: { label: "Instant (automated)", detail: "TransferMate says automated API/partner compliance onboarding unlocks transactions immediately once checks pass.", url: "https://www.transfermate.com" },
    },
  ],
  "equals-money": [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Equals Money business FX and expense accounts.",
      documents: ["Company registration number, registered/trading addresses, directors and 25%+ UBOs, plus expected payment volumes.", "Valid photo ID (passport or driving licence) and proof of residence for the applicant/signatory."],
      documentsUrl: "https://equalsmoney.com",
      approvalTime: null,
    },
  ],
  caxton: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Caxton personal and business international transfers.",
      documents: ["Clear photo of valid passport, national ID or driving licence (all four corners visible).", "Proof of address dated within 3 months (gas, electric, water or council tax bill, or bank/building society statement; mobile/credit card bills excluded)."],
      documentsUrl: "https://www.caxton.io",
      approvalTime: { label: "Within 24 hours (urgent business)", detail: "Caxton says electronic checks run automatically and urgent business onboarding can be expedited within 24 hours.", url: "https://www.caxton.io" },
    },
  ],
  fairfx: [
    {
      for: "account_holder", profiles: PERSON, countries: ["GB"],
      scope: "FairFX personal multi-currency accounts and cards (UK).",
      documents: ["UK/international passport or UK driver’s licence (plus verification photo/video selfie if requested).", "Proof of address dated within 3 months (utility/council tax bill, bank statement or tenancy agreement) if the electronic soft check needs backup."],
      documentsUrl: "https://www.fairfx.com",
      approvalTime: null,
    },
  ],
  dahabshiil: [
    {
      for: "sender", profiles: ANYONE,
      scope: "Dahabshiil international money transfers.",
      documents: ["Valid government-issued photo ID (passport or driving licence) plus full name, residential address, date of birth and phone number.", "Live photo/video biometric check, plus proof of address or source of funds for higher limits."],
      documentsUrl: "https://www.dahabshiil.com",
      approvalTime: { label: "Minutes (digital onboarding)", detail: "Dahabshiil says digital registration and automated verification let senders begin transferring within minutes.", url: "https://www.dahabshiil.com" },
    },
  ],
  pangea: [
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "Pangea Money Transfer personal sends from the US (Levels 1–3).",
      documents: ["Level 1 (up to 1,000 USD/day): basic profile details and SMS verification.", "Higher limits (over 3,000 USD): US SSN/ITIN and/or valid government-issued photo ID (driver’s licence, passport or state ID)."],
      documentsUrl: "https://pangeamoneytransfer.com",
      approvalTime: null,
    },
  ],
  "boss-money": [
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "BOSS Money personal transfers from the US.",
      documents: ["Full legal name, residential address, phone number and email.", "Government-issued photo ID and secondary compliance verification when triggered by amount or volume."],
      documentsUrl: "https://www.bossrevolution.com/en-us/services/money-transfer",
      approvalTime: null,
    },
  ],
  talkremit: [
    {
      for: "sender", profiles: PERSON,
      scope: "TalkRemit personal international transfers.",
      documents: ["Clear government-issued photo ID (showing ID number, photo, full name, date of birth and nationality) and a live photo or video selfie.", "Proof of address (utility bill or bank statement) and source-of-funds proof for limit increases."],
      documentsUrl: "https://www.talkremit.com",
      approvalTime: null,
    },
  ],
  "kabayan-remit": [
    {
      for: "sender", profiles: PERSON, countries: ["GB", "CA", "US"],
      scope: "Kabayan Remit personal transfers to the Philippines.",
      documents: ["Valid government photo ID (passport, driving licence, residence permit/card, Philippine National ID or US visa) plus a matching selfie.", "Proof of address if requested (primarily for US customers)."],
      documentsUrl: "https://www.kabayanremit.com",
      approvalTime: null,
    },
  ],
  "opal-transfer": [
    {
      for: "sender", profiles: PERSON, countries: ["GB", ...EEA],
      scope: "Opal Transfer personal sends from the UK and Europe (90-day tiers: £1.5k / £5k / £5k+).",
      documents: ["Valid national ID card or passport with electronic/liveness verification.", "Proof of address dated within 3 months for >1,500 GBP per 90 days; payslips, bank statements or sales contracts for >5,000 GBP per 90 days."],
      documentsUrl: "https://www.opaltransfer.com",
      approvalTime: { label: "Within 24 hours", detail: "Opal Transfer says uploaded KYC documents showing Awaiting Approval are generally reviewed and approved within 24 hours.", url: "https://www.opaltransfer.com" },
    },
  ],
  passto: [
    {
      for: "sender", profiles: PERSON, countries: ["GB"],
      scope: "Passto personal remittances from the UK.",
      documents: ["Valid photo ID (passport or photocard driving licence), live biometric selfie, residential address and nationality."],
      documentsUrl: "https://www.passto.co.uk",
      approvalTime: null,
    },
  ],
  paga: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["NG"],
      scope: "Paga Nigeria wallet tiers (CBN Levels 1–3).",
      documents: ["Level 1: NIN, full name, phone, date of birth, address and live selfie.", "Level 2: BVN linkage. Level 3: government photo ID (passport, voter’s card or driver’s licence), proof of address, BVN and NIN."],
      documentsUrl: "https://www.mypaga.com",
      approvalTime: null,
    },
  ],
  bancoli: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Bancoli Global Business Accounts.",
      documents: ["Corporate registration documents, tax ID, proof of business address and government photo IDs for directors and beneficial owners (UBOs)."],
      documentsUrl: "https://bancoli.com",
      approvalTime: null,
    },
  ],
  multipass: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "MultiPass corporate multi-currency accounts.",
      documents: ["Certificate of incorporation/registration documents plus business model, trading partners and expected flows.", "Valid passport/photo ID, proof of address dated within 3 months and biometric scan (+ video call within 3 months) for directors, controllers and UBOs."],
      documentsUrl: "https://multipass.co",
      approvalTime: { label: "Within 1 day", detail: "MultiPass says applications with complete information and primary IDs can be approved within 1 day.", url: "https://multipass.co" },
    },
  ],
  "ifx-payments": [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "IFX Payments corporate FX and ibanq accounts.",
      documents: ["Corporate incorporation/structure documents, passports/IDs for UBOs and controllers, and source-of-funds/wealth proof for complex structures."],
      documentsUrl: "https://www.ifxpayments.com",
      approvalTime: null,
    },
  ],
  lumon: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Lumon FCA-regulated personal and corporate currency transfers.",
      documents: ["Standard FCA identity verification (government photo ID and proof of residential address).", "Source-of-funds or source-of-wealth documentation for high-value transfers."],
      documentsUrl: "https://www.lumonpay.com",
      approvalTime: null,
    },
  ],
  "sterling-fx": [
    {
      for: "account_holder", profiles: PERSON, countries: ["GB"],
      scope: "Sterling FX UK personal foreign exchange orders.",
      documents: ["Electronic UK identity verification for residents aged 18+ (photo ID and proof of address requested if electronic verification needs backup)."],
      documentsUrl: "https://www.sterlingfx.co.uk",
      approvalTime: null,
    },
  ],
  "key-currency": [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Key Currency personal and business transfers.",
      documents: ["Proof of identity (valid passport or photo ID) and proof of residential address (recent utility bill or bank statement)."],
      documentsUrl: "https://www.keycurrency.co.uk",
      approvalTime: { label: "Same working day (sometimes under 1 hour)", detail: "Key Currency says registration and ID verification are often completed the same working day, sometimes in under an hour, once documents are received.", url: "https://www.keycurrency.co.uk" },
    },
  ],
  "smart-currency-exchange": [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Smart Currency Exchange FCA-regulated FX accounts.",
      documents: [],
      documentsNote: "Smart Currency Exchange completes FCA-regulated AML/KYC onboarding online or by phone with an account manager and requests ID/address verification during setup.",
      documentsUrl: "https://www.smartcurrencyexchange.com",
      approvalTime: null,
    },
  ],
  "regency-fx": [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Regency FX personal and business transfers.",
      documents: ["Automated electronic identity checks at registration, plus manual photo ID, proof of address or source-of-funds proof if required by AML checks."],
      documentsUrl: "https://www.regencyfx.com",
      approvalTime: null,
    },
  ],
  // --- Regional Underdogs ---
  easebuzz: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IN"],
      scope: "Easebuzz Atlas cross-border PA-CB export collections (India).",
      documents: ["Certificate of incorporation / partnership deed / sole prop registration, GSTIN certificate, cancelled cheque/bank statement and export proof (website, invoices or contracts).", "Promoter/director PAN card plus Aadhaar, passport or voter ID."],
      documentsUrl: "https://easebuzz.in",
      approvalTime: null,
    },
  ],
  pay10: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["IN"],
      scope: "Pay10 RBI PA-CB-E export collections (India).",
      documents: ["Corporate registration (Certificate of Incorporation / Partnership Deed), PAN, GSTIN (+ LUT for zero-rated exports) and bank proof.", "CKYCR-aligned director/promoter/signatory ID and address proofs plus FEMA purpose codes."],
      documentsUrl: "https://pay10.in",
      approvalTime: { label: "Minutes to a few days", detail: "Pay10 says digital KYB onboarding can approve merchants in minutes to a few days when legal names match across PAN, GSTIN and bank records.", url: "https://pay10.in" },
    },
  ],
  "onramp-money": [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Onramp.money fiat-to-crypto ramp across 75+ countries.",
      documents: ["Valid government-issued photo ID (75+ countries supported).", "Bank statements or proof of funds for higher-tier Enhanced Due Diligence."],
      documentsUrl: "https://onramp.money",
      approvalTime: { label: "~3 minutes (basic KYC)", detail: "Onramp.money says basic automated identity verification typically completes in roughly 3 minutes.", url: "https://onramp.money" },
    },
  ],
  onmeta: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["IN", "PH"],
      scope: "Onmeta fiat-to-crypto ramp (India & Philippines).",
      documents: ["India: 10-character PAN, 10-digit Aadhaar-linked mobile number for DigiLocker OTP and a live liveness selfie."],
      documentsUrl: "https://onmeta.in",
      approvalTime: { label: "Under 60 seconds (automated) / ~15 min manual", detail: "Onmeta publishes automated KYC decisions in under 60 seconds, with manual fallback targeting 15 minutes.", url: "https://onmeta.in" },
    },
  ],
  abound: [
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "Abound personal US→India remittances.",
      documents: [],
      documentsNote: "Abound verifies US senders under FinCEN MSB rules inside the app and requires the sender to be a named holder on the US funding bank account.",
      documentsUrl: "https://www.joinabound.com",
      approvalTime: null,
    },
  ],
  remit2any: [
    {
      for: "sender", profiles: PERSON, countries: ["US"],
      scope: "Remit2Any personal US→India remittances.",
      documents: ["US sender: US driver’s licence, state ID or US passport (or foreign passport plus valid US visa/status proof).", "India recipient: valid PAN plus secondary ID (Aadhaar, voter ID, driver’s licence or passport) if requested."],
      documentsUrl: "https://www.remit2any.com",
      approvalTime: null,
    },
  ],
  rupeeflo: [
    {
      for: "account_holder", profiles: PERSON,
      scope: "Rupeeflo NRI banking and remittance onboarding.",
      documents: ["Valid passport, visa/OCI/PIO card, overseas proof of address, PAN (or Form 60), passport photo and FATCA/CRS declarations.", "10–15 minute live video call with a licensed notary on the platform."],
      documentsUrl: "https://www.rupeeflo.com",
      approvalTime: { label: "~1 working day + 2h notarisation", detail: "Rupeeflo says initial document upload review takes about 1 working day and notarised documents are ready within 2 hours of the video call.", url: "https://www.rupeeflo.com" },
    },
  ],
  payhere: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["LK"],
      scope: "PayHere Sri Lanka merchant accounts.",
      documents: ["Sri Lankan bank account in the business/proprietor name and business registration (or active website/social business profile for freelancers/home businesses)."],
      documentsUrl: "https://www.payhere.lk",
      approvalTime: { label: "A few business days", detail: "PayHere says merchant applications and KYB documents are manually reviewed with acquiring banks over a few business days.", url: "https://www.payhere.lk" },
    },
  ],
  "mobily-pay": [
    {
      for: "sender", profiles: PERSON, countries: ["SA"],
      scope: "Mobily Pay personal Saudi digital wallet.",
      documents: [],
      documentsNote: "Mobily Pay uses SAMA-regulated digital onboarding inside the app; exact document prompts appear during registration.",
      documentsUrl: "https://mobilypay.sa",
      approvalTime: null,
    },
  ],
  d360: [
    {
      for: "sender", profiles: PERSON, countries: ["SA"],
      scope: "D360 Bank personal Saudi digital bank accounts.",
      documents: [],
      documentsNote: "D360 Bank uses SAMA-regulated digital onboarding inside the app; exact identity prompts appear during sign-up.",
      documentsUrl: "https://d360.com",
      approvalTime: null,
    },
  ],
  "bfc-pay": [
    {
      for: "sender", profiles: ANYONE, countries: ["BH", "IN"],
      scope: "BFC Pay (Bahrain) and BFC Forex outward remittances.",
      documents: ["Bahrain: valid Bahraini CPR card or passport via the BFC Pay app.", "Outward LRS (BFC Forex): government photo ID with address proof, PAN (for India) and signed purpose/KYC forms."],
      documentsUrl: "https://bfcpay.com",
      approvalTime: null,
    },
  ],
  thawani: [
    {
      for: "sender", profiles: PERSON, countries: ["OM"],
      scope: "Thawani Pay personal Oman wallet.",
      documents: ["Mandatory in-app KYC verification tied to Omani National ID or Resident ID card."],
      documentsUrl: "https://thawani.om",
      approvalTime: null,
    },
  ],
  neema: [
    {
      for: "sender", profiles: PERSON, countries: ["IL"],
      scope: "Neema personal international remittance accounts (Israel).",
      documents: ["App registration plus a mandatory one-time in-person visual ID check at an authorised Neema agent/deposit location.", "Salary slips, employment contracts, visa/residency details or bank statements if requested for higher limits."],
      documentsUrl: "https://www.getneema.com",
      approvalTime: null,
    },
  ],
  okoora: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Okoora B2B multi-currency FX accounts.",
      documents: ["Legal entity registration number and registry extract, beneficial ownership (UBO) structure and director/representative photo IDs."],
      documentsUrl: "https://www.okoora.com",
      approvalTime: null,
    },
  ],
  "chipper-cash": [
    {
      for: "account_holder", profiles: ANYONE, countries: ["NG", "GH", "UG", "US", "GB"],
      scope: "Chipper Cash personal and business wallets.",
      documents: ["Nigeria: BVN and NIN mandatory (plus international passport or driver’s licence for virtual cards/US stocks).", "Ghana: Ghana Card; Uganda: National ID or passport; US: Green Card, passport card or work permit."],
      documentsUrl: "https://chippercash.com",
      approvalTime: { label: "24–48 business hours (up to 72h)", detail: "Chipper Cash says BVN and ID verification reviews typically take 24–48 business hours and up to 72 hours during high volume.", url: "https://chippercash.com" },
    },
  ],
  mukuru: [
    {
      for: "sender", profiles: PERSON, countries: ["ZA", "GB"],
      scope: "Mukuru personal remittance tiers (Lite / Core / Max).",
      documents: ["Proof of identity (national ID, passport or driver’s licence) plus proof of residency (utility bill or lease) for Core limits.", "Proof of income (payslip, bank statements or employment confirmation) to unlock Max limits."],
      documentsUrl: "https://www.mukuru.com",
      approvalTime: null,
    },
  ],
  accrue: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["NG", "GH", "KE", "ZA"],
      scope: "Accrue personal and business African multi-currency accounts.",
      documents: ["Personal details plus valid government ID (international passport, national ID/NIN slip or voter’s card) and live selfie via Persona.", "Nigeria BVN or proof of address (utility bill / GhanaPost GPS) for virtual USD account requests."],
      documentsUrl: "https://useaccrue.com",
      approvalTime: null,
    },
  ],
  valr: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["ZA"],
      scope: "VALR fiat and stablecoin exchange accounts (South Africa & global).",
      documents: ["Fully-Verified: government-issued photo ID (ID card/book, passport or driver’s licence) and tax information.", "Fully-Verified PLUS (100 BTC/day equivalent): authenticator-app 2FA enabled."],
      documentsUrl: "https://www.valr.com",
      approvalTime: null,
    },
  ],
  fincra: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "Fincra B2B African and global payment infrastructure.",
      documents: ["Certificate of incorporation, Memorandum & Articles of Association and proof of business address.", "Government photo IDs (passport, national ID or driver’s licence) and proof of address for directors and UBOs (plus BVN where applicable)."],
      documentsUrl: "https://fincra.com",
      approvalTime: null,
    },
  ],
  leatherback: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Leatherback FCA-regulated personal and business cross-border accounts.",
      documents: ["Individuals: valid government photo ID, proof of address and liveness check.", "Businesses: company registration documents plus official IDs for directors, UBOs and authorised users."],
      documentsUrl: "https://leatherback.co",
      approvalTime: null,
    },
  ],
  nomad: [
    {
      for: "account_holder", profiles: PERSON, countries: ["BR"],
      scope: "Nomad global USD accounts for Brazilian residents (18+).",
      documents: ["Valid CPF, Brazilian residential address, Brazilian RG, CNH or Brazilian passport, and in-app selfie."],
      documentsUrl: "https://www.nomadglobal.com",
      approvalTime: null,
    },
  ],
  littio: [
    {
      for: "account_holder", profiles: PERSON, countries: ["CO", "MX"],
      scope: "Littio Global Accounts and cards (LatAm).",
      documents: [],
      documentsNote: "Littio requires full in-app KYC verification to activate a Global Account or Littio Card; exact ID prompts appear in the app.",
      documentsUrl: "https://www.littio.co",
      approvalTime: null,
    },
  ],
  "el-dorado": [
    {
      for: "account_holder", profiles: PERSON, countries: ["AR", "CO", "PE", "BR", "VE", "BO"],
      scope: "El Dorado P2P and digital-dollar accounts (Levels 2–4).",
      documents: ["Level 2 (Sumsub, up to 10k USDT/mo): national ID (DNI), passport, residence permit or accepted driver’s licence plus live selfie.", "Level 3 (250k USDT/mo): economic activity and source-of-funds form; Level 4 (1M USDT/mo): additional compliance documents."],
      documentsUrl: "https://eldorado.io",
      approvalTime: null,
    },
  ],
  utoppia: [
    {
      for: "account_holder", profiles: PERSON,
      scope: "Utoppia personal USD accounts for international remote workers.",
      documents: ["Valid government-issued photo ID (passport or accepted local ID) and live video selfie/liveness check.", "Proof of address or tax/contact details depending on residence country."],
      documentsUrl: "https://www.utoppia.com",
      approvalTime: { label: "Instant to 24 hours", detail: "Utoppia says account identity verification and approval generally take from instant up to 24 hours.", url: "https://www.utoppia.com" },
    },
  ],
  airtm: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "Airtm personal digital-dollar wallets and Enterprise API accounts.",
      documents: ["Valid government-issued photo ID (national ID, passport or driver’s licence) and live camera selfie.", "Proof of address, employment details or source of funds (payslips, invoices, bank statements) for EEA, US Virtual Accounts or higher limits."],
      documentsUrl: "https://www.airtm.com",
      approvalTime: { label: "~15 minutes (automated) / up to 72h manual", detail: "Airtm says automated KYC usually clears in ~15 minutes (often 5–10 minutes), while manual reviews take up to 72 hours.", url: "https://www.airtm.com" },
    },
  ],
  astropay: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "AstroPay global digital wallets and merchant accounts.",
      documents: ["Valid government-issued photo ID (passport or national ID card) and live facial-recognition selfie.", "Proof of address (utility bill or bank statement) if prompted."],
      documentsUrl: "https://www.astropay.com",
      approvalTime: null,
    },
  ],
  prex: [
    {
      for: "account_holder", profiles: PERSON, countries: ["UY", "AR", "PE", "CL"],
      scope: "Prex personal LatAm cross-border accounts.",
      documents: ["Valid national identity document for your country (Cédula de Identidad in Uruguay, DNI in Argentina) plus in-app onboarding verification photos."],
      documentsUrl: "https://www.prexcard.com",
      approvalTime: { label: "Up to 24 business hours", detail: "Prex says data validation and personal account approval typically complete within 24 business hours.", url: "https://www.prexcard.com" },
    },
  ],
  rextie: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["PE"],
      scope: "Rextie Peru online USD↔PEN currency exchange.",
      documents: ["Peruvian DNI (nationals) or passport, Carné de Extranjería or PTP (foreign residents), plus source-of-funds support for high amounts under SBS UIF rules."],
      documentsUrl: "https://www.rextie.com",
      approvalTime: { label: "Automatic / immediate", detail: "Rextie says registration validates automatically against ID databases when details match.", url: "https://www.rextie.com" },
    },
  ],
  moneymatch: [
    {
      for: "account_holder", profiles: PERSON, countries: ["MY", "AU", "BN"],
      scope: "MoneyMatch personal e-KYC transfers.",
      documents: ["Malaysian MyKad or valid passport (plus visa/employment details for non-citizen residents)."],
      documentsUrl: "https://moneymatch.co",
      approvalTime: { label: "Up to 1 business day", detail: "MoneyMatch says personal digital e-KYC submissions typically receive approval within 1 business day.", url: "https://moneymatch.co" },
    },
    {
      for: "account_holder", profiles: BUSINESS, countries: ["MY", "AU", "BN"],
      scope: "MoneyMatch Pulse business accounts.",
      documents: ["Corporate registration/licence certificates, director and UBO details, corporate contact info and proof of business address."],
      documentsUrl: "https://moneymatch.co",
      approvalTime: null,
    },
  ],
  merchantrade: [
    {
      for: "sender", profiles: PERSON, countries: ["MY"],
      scope: "Merchantrade Money personal wallet and remittance (Malaysia).",
      documents: ["Malaysian citizens: MyKad plus live selfie. Foreign residents: valid passport plus selfie (or branch/agent face-to-face check)."],
      documentsUrl: "https://www.merchantrademoney.com",
      approvalTime: null,
    },
  ],
  wallex: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["SG", "ID", "HK"],
      scope: "Wallex B2B APAC FX and cross-border accounts.",
      documents: ["Business registration/corporate filings, proof of business address, and IDs/details for UBOs, directors, shareholders and authorised users."],
      documentsUrl: "https://www.wallex.asia",
      approvalTime: null,
    },
  ],
  transwap: [
    {
      for: "account_holder", profiles: ANYONE,
      scope: "TranSwap personal and business cross-border accounts (MAS/FCA/BI/FINTRAC regulated).",
      documents: ["Individuals: unexpired government photo ID and proof of residential address (utility bill or bank statement).", "Businesses: corporate registry records, constitutional documents, UBO map and director/user IDs."],
      documentsUrl: "https://www.transwap.com",
      approvalTime: null,
    },
  ],
  youtrip: [
    {
      for: "account_holder", profiles: PERSON, countries: ["SG", "TH", "AU"],
      scope: "YouTrip personal multi-currency wallet and YouTrip Send.",
      documents: ["Singpass verification (in Singapore) or valid government photo ID submitted inside the YouTrip mobile app."],
      documentsUrl: "https://www.you.co",
      approvalTime: { label: "15 minutes to 1–2 working days", detail: "YouTrip says automated account verification completes in about 15 minutes, or 1–2 working days if manual review is needed.", url: "https://www.you.co" },
    },
  ],
  xtransfer: [
    {
      for: "account_holder", profiles: BUSINESS,
      scope: "XTransfer B2B global trade collection accounts.",
      documents: ["Business licence / certificate of incorporation plus IDs for directors, legal representatives and UBOs.", "Trade background documentation: commercial invoices, bills of lading, buyer/supplier contracts or transport documents."],
      documentsUrl: "https://www.xtransfer.com",
      approvalTime: { label: "As fast as 1 day", detail: "XTransfer says B2B account opening and vetting can be approved as fast as 1 day when complete documents are provided.", url: "https://www.xtransfer.com" },
    },
  ],
  hanpass: [
    {
      for: "sender", profiles: ANYONE, countries: ["KR", "AU"],
      scope: "Hanpass overseas remittance accounts (South Korea & Australia).",
      documents: ["South Korea: National ID card or driver’s licence (Korean nationals); Alien Registration Card (ARC) or passport (foreign nationals).", "Australia: valid government photo ID plus residence verification if requested."],
      documentsUrl: "https://www.hanpass.com",
      approvalTime: { label: "Up to 48 business hours", detail: "Hanpass says identity verification and KYC approval typically complete within 48 business hours (2 business days).", url: "https://www.hanpass.com.au" },
    },
  ],
  moin: [
    {
      for: "sender", profiles: ANYONE, countries: ["KR"],
      scope: "MOIN South Korea overseas remittance accounts.",
      documents: ["Licensed Korean KYC identity verification (government ID or passport plus sender details; student verification for student fee discounts)."],
      documentsUrl: "https://www.themoin.com",
      approvalTime: null,
    },
  ],
  "sbi-remit": [
    {
      for: "sender", profiles: ANYONE, countries: ["JP"],
      scope: "SBI Remit overseas transfers from Japan.",
      documents: ["Japanese nationals: Japanese driver’s licence (or accepted ID combination showing name, date of birth and current address).", "Foreign nationals: valid Residence Card (Zairyu Card) or Special Permanent Resident Certificate."],
      documentsUrl: "https://www.remit.co.jp",
      approvalTime: null,
    },
  ],
  "smiles-remit": [
    {
      for: "sender", profiles: PERSON, countries: ["JP", "CA", "SG"],
      scope: "Smiles Mobile Remittance personal accounts.",
      documents: ["Japan: Residence Card (Zairyu Card), Special Permanent Resident Certificate, Japanese driver’s licence or My Number Card plus selfie.", "Canada/Other: valid government photo ID (driver’s licence, passport, PR card or provincial ID) plus proof of address if not on ID."],
      documentsUrl: "https://www.smileswallet.com",
      approvalTime: { label: "12–72 hours (up to ~1 week)", detail: "Smiles Mobile Remittance says identity verification typically takes 12 to 72 hours, and up to about 1 week depending on checks.", url: "https://www.smileswallet.com" },
    },
  ],
  "kyodai-remittance": [
    {
      for: "sender", profiles: ANYONE, countries: ["JP"],
      scope: "Kyodai Remittance overseas transfers from Japan.",
      documents: ["Foreign residents in Japan: valid Residence Card (Zairyu Card) showing current address.", "Japanese nationals: Japanese driver’s licence or My Number Card via eKYC."],
      documentsUrl: "https://kyodairemittance.com",
      approvalTime: null,
    },
  ],
  yuh: [
    {
      for: "account_holder", profiles: PERSON, countries: ["CH", "AT", "LI"],
      scope: "Yuh personal Swiss multi-currency accounts (CH, AT, LI residents).",
      documents: ["Valid national ID or passport (plus physical Swiss residence permit card for foreign nationals in Switzerland).", "Proof of residence (tax bill or local authority letter; utility bills excluded) if asked, plus mandatory initial deposit from an own-name bank account."],
      documentsUrl: "https://www.yuh.com",
      approvalTime: null,
    },
  ],
  "neon-ch": [
    {
      for: "account_holder", profiles: PERSON, countries: ["CH"],
      scope: "neon Swiss personal bank accounts (Swiss-domiciled/tax-resident individuals 15+).",
      documents: ["Valid passport or national ID card (80+ countries supported) plus a valid Swiss B or C residence permit for non-Swiss nationals."],
      documentsUrl: "https://www.neon-free.ch",
      approvalTime: null,
    },
  ],
  qonto: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["FR", "DE", "IT", "ES", "NL", "BE", "PT", "AT"],
      scope: "Qonto European business accounts.",
      documents: ["Company registration/legal documents (such as corporate bylaws) and proof of business address if requested.", "National ID or passport with MRZ strip for UBOs/representatives plus a 5–10 minute selfie/video check (e.g. IDNow in Germany)."],
      documentsUrl: "https://qonto.com",
      approvalTime: { label: "Within 1 business day", detail: "Qonto says it aims to review and approve standard business registrations within 1 business day.", url: "https://qonto.com" },
    },
  ],
  finom: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["NL", "DE", "FR", "IT", "ES", "BE", "PT"],
      scope: "Finom European business accounts.",
      documents: ["Official company registration (such as Chamber of Commerce/KvK extract), stakeholder/UBO details and business activity.", "Passport or national ID, liveness selfie and €0.10 bank confirmation (or video call)."],
      documentsUrl: "https://finom.co",
      approvalTime: null,
    },
  ],
  "zen-com": [
    {
      for: "account_holder", profiles: ANYONE, countries: ["GB", ...EEA],
      scope: "ZEN.COM personal and business multi-currency accounts.",
      documents: ["Individuals: valid government photo ID (passport or national ID card) and live facial biometric selfie (proof of address if asked).", "Businesses: corporate registration documents, UBO structure, proof of business activity/address and representative IDs."],
      documentsUrl: "https://www.zen.com",
      approvalTime: null,
    },
  ],
  walutomat: [
    {
      for: "account_holder", profiles: ANYONE, countries: ["PL", ...EEA],
      scope: "Walutomat Polish and European currency exchange accounts.",
      documents: ["PESEL (Polish residents), ID card/passport/residence card details and a matching own-name bank account (ID scans or company documents if business/flagged)."],
      documentsUrl: "https://www.walutomat.pl",
      approvalTime: null,
    },
  ],
  "fin-do": [
    {
      for: "sender", profiles: PERSON,
      scope: "Fin.do card-to-card global money transfers.",
      documents: ["Personal details plus a photo of a valid government-issued ID (passport, driver’s licence or national ID card) submitted in-app."],
      documentsUrl: "https://www.fin.do",
      approvalTime: { label: "Up to 3 working days", detail: "Fin.do says identity verification reviews typically complete within up to 3 working days.", url: "https://www.fin.do" },
    },
  ],
  mercury: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["US"],
      scope: "Mercury US business banking accounts.",
      documents: ["Certificate of Formation / Articles of Organization or Incorporation plus IRS EIN confirmation (CP575, Letter 147C or SS-4).", "Government photo ID (international passport for non-US founders; US driver’s licence, state ID or passport for US founders) for 25%+ UBOs and control persons, physical operating address and website/business description."],
      documentsUrl: "https://mercury.com",
      approvalTime: { label: "0–2 business days", detail: "Mercury says applicants typically receive an onboarding decision within 0–2 business days (international or manual reviews can take longer).", url: "https://mercury.com" },
    },
  ],
  relay: [
    {
      for: "account_holder", profiles: BUSINESS, countries: ["US"],
      scope: "Relay US business banking accounts.",
      documents: ["IRS EIN confirmation (CP575 or Letter 147C; SSN for sole props without employees) plus Articles of Incorporation/Organization, Operating Agreement or DBA filing.", "Unexpired passport or driver’s licence, address, date of birth and SSN (or international passport for non-resident founders) for 25%+ owners."],
      documentsUrl: "https://relayfi.com",
      approvalTime: { label: "1–2 business days", detail: "Relay says most online business applications are reviewed and approved within 1–2 business days.", url: "https://relayfi.com" },
    },
  ],
};

const ALIASES: Record<string, string> = {
  worldremit: "world-remit",
  "wise-business": "wise",
  "xoom-paypal": "xoom",
  morse: "sling-money",
  dolarapp: "arq",
  geegpay: "raenest",
  vault: "venn",
  stcpay: "stc-bank",
  vance: "aspora",
  vertofx: "verto",
};

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
