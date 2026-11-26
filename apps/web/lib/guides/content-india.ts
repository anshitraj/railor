import type { Block, GuideContent, Section } from "./content";

/**
 * Guides for people in India: sending money abroad under the Liberalised
 * Remittance Scheme (LRS), and receiving money from abroad. Like every guide
 * they teach how it works and never quote a provider's fee or rate. The rules
 * are the Reserve Bank of India's (its LRS FAQs and Master Direction) and the
 * Income Tax Department's TCS pages; where a limit or a rate can change, the
 * guide says where to check instead of printing a number that goes stale.
 *
 * Text may carry **bold** and internal links written as [text](/path).
 */

const p = (text: string): Block => ({ type: "p", text });
const list = (items: string[], ordered = false): Block => ({ type: "list", items, ordered });
const tip = (title: string, text: string): Block => ({ type: "callout", tone: "tip", title, text });
const warn = (title: string, text: string): Block => ({ type: "callout", tone: "warning", title, text });

const RULES = "The Reserve Bank of India publishes the Liberalised Remittance Scheme (LRS) rules and a plain-language FAQ. Read the current version there before you send a large amount.";

/** The same check-before-you-send advice, in the same words, so every guide says the same thing about the rules. */
const checkRules = tip("Rules change. Check the source.", `${RULES} The Income Tax Department's TCS page lists the current tax collected at source on foreign remittances.`);

/** Sections every "send from India to X" guide shares: who may send, and the order of steps. */
const lrsSections = (destination: string): Section[] => [
  {
    id: "who",
    heading: "Who can send money abroad from India",
    blocks: [
      p("Resident individuals in India send money abroad under the **Liberalised Remittance Scheme (LRS)**. Under it, resident individuals, including minors, may remit up to **USD 250,000 per financial year** (April to March) for permitted purposes, in any freely convertible currency. A minor's form is countersigned by a guardian."),
      p("The scheme is for individuals. It is not available to companies, partnership firms, HUFs or trusts, which use other routes for business payments. A sole proprietor's remittance counts against the proprietor's own individual limit."),
      p("There is no limit on how often you send. The limit is cumulative across every bank, forex dealer and app you use in the financial year, so keep your own total."),
    ],
  },
  {
    id: "need",
    heading: "What you need before you send",
    blocks: [
      list([
        "**Your PAN.** It is mandatory for every LRS transaction made through an authorised person.",
        "**A declaration of purpose (Form A2).** You state why you are sending the money and that it is your own. The bank or dealer checks the purpose against the rules.",
        "**KYC with the sender.** Your bank, forex dealer or app verifies your identity before the first transfer.",
        `**The recipient's details in ${destination}.** Name exactly as on the account, the account details that country uses and the bank's SWIFT/BIC code. A wrong detail is the usual reason a transfer is delayed or returned.`,
        "**A permitted purpose.** Examples the RBI lists: maintenance of close relatives abroad, gifts, studies abroad, medical treatment, private visits, business travel and going abroad for employment.",
      ]),
    ],
  },
];

const tcsSection: Section = {
  id: "tcs",
  heading: "Tax collected at source (TCS)",
  blocks: [
    p("When remittances under LRS in a financial year go above the threshold on the Income Tax Department's TCS page, the authorised dealer collects **tax at source (TCS)** on the amount above it. The rate depends on the purpose, and some purposes such as education financed by a loan are treated differently."),
    p("TCS is not an extra fee kept by the provider. It is advance tax the bank or dealer collects and deposits in your name, and it appears in your tax records (the TCS certificate and Schedule TCS of your income tax return), where you can use it against your tax liability. Ask your tax adviser how it applies to you."),
    checkRules,
  ],
};

const stepsSection = (destination: string): Section => ({
  id: "steps",
  heading: "The steps, in order",
  blocks: [
    list([
      `Decide the purpose and the amount, and check your remaining LRS limit for the financial year.`,
      `Get the recipient's full name and bank details for ${destination}.`,
      "Compare what actually arrives, not the advertised fee: the same amount, the same purpose and the same way of paying. Use the comparison below.",
      "Choose an authorised bank, forex dealer or app, and complete KYC if it is your first time.",
      "Fill in the purpose declaration, pay from your own account and keep the reference.",
      "Share the reference with the recipient and check the delivery time shown for that provider.",
      "Keep the receipt and the TCS certificate, if any, with your tax records.",
    ], true),
  ],
});

const costSection = (currency: string): Section => ({
  id: "cost",
  heading: `What decides how many ${currency} arrive`,
  blocks: [
    p("Four things move the amount: the **fee**, the **exchange-rate markup** (the gap between the mid-market rate and the rate you are given), any **charges taken by banks along the way** and the **TCS** where it applies. Fees are easy to see. The markup is not, which is why a transfer advertised as having no fee can still deliver less."),
    p("The only fair comparison is the amount the recipient receives for the amount you send. [The real cost of sending money](/guides/real-cost-of-sending-money) shows how to work it out, and the comparison below does it for you with the source of each price."),
  ],
});

interface CountryGuideInput {
  name: string;
  currency: string;
  intro: string;
  detailsHeading: string;
  details: string[];
  localNote: string[];
  faq: Array<{ q: string; a: string }>;
}

function countryGuide(input: CountryGuideInput): GuideContent {
  return {
    intro: input.intro,
    sections: [
      ...lrsSections(input.name),
      { id: "recipient", heading: input.detailsHeading, blocks: [list(input.details), ...input.localNote.map(p)] },
      costSection(input.currency),
      tcsSection,
      stepsSection(input.name),
    ],
    faq: [
      { q: `How much can I send from India to ${input.name}?`, a: "Resident individuals can remit up to USD 250,000 per financial year under the Liberalised Remittance Scheme, across all banks and dealers combined. Companies and firms use other routes. Check the RBI's current LRS page before a large transfer." },
      { q: "Do I need a PAN to send money abroad?", a: "Yes. The RBI says a PAN is mandatory for every transaction under LRS made through an authorised person such as a bank or authorised forex dealer." },
      ...input.faq,
      { q: "Is the comparison on this page a quote?", a: "No. It ranks what each service delivers for the amount you choose, with the source and time of each price. Confirm the final figure with the provider before you pay." },
    ],
  };
}

export const INDIA_CONTENT: Record<string, GuideContent> = {
  "send-money-from-india-to-usa": {
    intro:
      "Sending money from India to the United States is allowed for individuals under the Reserve Bank of India's Liberalised Remittance Scheme, and it is simple once you know the limit, the paperwork and where the cost hides. This guide walks through the rules, what to ask the person receiving the money, the ways to send, and how to compare what actually arrives.",
    sections: [
      ...lrsSections("the United States"),
      {
        id: "us-details",
        heading: "What to ask the person in the US for",
        blocks: [
          list([
            "**Full name** exactly as it appears on their bank account.",
            "**Account number** and the **ABA routing number** (nine digits) of their US bank. The routing number identifies the bank for domestic transfers.",
            "**The bank's SWIFT/BIC code** if you are sending through a bank wire.",
            "**Account type** (checking or savings) and, for some providers, their address and a mobile number.",
          ]),
          p("US banks identify accounts with a routing number and an account number rather than an IBAN or an IFSC code. [IBAN, SWIFT, routing numbers and IFSC explained](/guides/iban-swift-bic-explained) shows what each country uses."),
        ],
      },
      {
        id: "ways",
        heading: "The ways to send money from India to the US",
        blocks: [
          p("There are three broad routes. Each is regulated, and each is available only through an **authorised person**: a bank that is an authorised dealer, or another authorised dealer or money transfer service operator."),
          list([
            "**Bank wire (SWIFT).** You instruct your bank to send USD to the recipient's US bank. It is familiar and works for large amounts, but banks often add their own fee and a margin on the exchange rate, and a bank in the middle can deduct a charge before the money arrives. See [SWIFT charges explained](/guides/swift-charges-our-sha-ben-explained).",
            "**Authorised forex dealers.** Some dealers can handle current-account remittances under LRS. They are an option for amounts and purposes they are authorised for.",
            "**Online remittance services.** Apps and websites that hold the authorisations they need let you pay from your Indian bank account and send to a US bank account. Compare them on the amount that arrives, and check that they are authorised before you send.",
          ]),
          tip("Start with the same inputs everywhere", "Compare using the same amount, the same purpose and the same way of paying, because each of them can change the price."),
        ],
      },
      costSection("US dollars"),
      {
        id: "purposes",
        heading: "Purposes that are allowed, and some that are not",
        blocks: [
          p("The RBI lists permitted purposes under LRS. Common ones are maintenance of close relatives abroad, gifts and donations, studies abroad, medical treatment, private visits, business travel and employment abroad. Other current-account purposes that are not prohibited are generally permitted too."),
          warn("Not allowed under LRS", "Lottery and sweepstake purchases, margin payments to overseas exchanges, trading in foreign exchange abroad, and remittances to people or entities the RBI has flagged are not permitted. Capital-account remittances to countries identified by the Financial Action Task Force as non-cooperative are also not permitted."),
          p("Choose the purpose that is true. The declaration is yours, and the responsibility for following the rules stays with you."),
        ],
      },
      tcsSection,
      stepsSection("the United States"),
      {
        id: "mistakes",
        heading: "Mistakes that delay or cost you",
        blocks: [
          list([
            "**Choosing a provider before comparing.** The advertised fee is only part of the cost.",
            "**A name that does not match the account.** The recipient's bank can hold or return the money.",
            "**Forgetting your running LRS total.** The limit counts every transfer in the financial year, whoever carried it.",
            "**Sending more than the first-transfer limit a provider allows.** New customers are often capped until their identity is verified.",
            "**Sending to a person or account you cannot verify.** Confirm by phone with someone you know. Scams ask for urgent transfers to new accounts.",
          ]),
        ],
      },
    ],
    faq: [
      { q: "How much money can I send from India to the USA?", a: "Resident individuals can remit up to USD 250,000 per financial year (April to March) under the Reserve Bank of India's Liberalised Remittance Scheme, across all banks and dealers combined, for permitted purposes. Check the RBI's current LRS page before a large transfer." },
      { q: "Do I need a PAN to send money from India to the US?", a: "Yes. A PAN is mandatory for every transaction under LRS made through an authorised person." },
      { q: "Can I send money to a friend or family member in the US?", a: "Yes, for a permitted purpose such as maintenance of a close relative or a gift. State the real purpose in the declaration." },
      { q: "What is the cheapest way to send money from India to the USA?", a: "The one that delivers the most US dollars for the same rupee amount, purpose and way of paying. It changes through the day, so compare live rather than trusting a fixed fee." },
      { q: "Is tax collected when I send money abroad?", a: "Tax collected at source (TCS) can apply once your remittances in a financial year pass the threshold on the Income Tax Department's TCS page. It is advance tax, not a provider fee, and the rate depends on the purpose." },
      { q: "How long does a transfer from India to the US take?", a: "It depends on the provider, the way you pay and the checks on the transfer. Each provider shows its own delivery time in the comparison, and first transfers can take longer while identity is verified." },
    ],
  },

  "best-money-transfer-app-in-india": {
    intro:
      "The best money transfer app in India is the one that delivers the most to your recipient for your amount, purpose and way of paying, is authorised to handle the transfer, and is easy enough that you will use it. No single app wins every route, so this guide shows how to judge them yourself and how to compare them on the same inputs.",
    sections: [
      {
        id: "kinds",
        heading: "The kinds of app and service",
        blocks: [
          p("Money transfer options in India fall into a few groups. Knowing which group you are looking at tells you what to expect."),
          list([
            "**Your bank's app or branch.** Familiar, and good for large or unusual transfers, but often with a bank fee and a margin on the exchange rate.",
            "**Authorised online remittance services.** Built for sending abroad, usually with clear delivery estimates. They differ widely in the rate they give.",
            "**Authorised forex dealers.** Useful for some purposes and amounts, often with in-person KYC.",
            "**Services built for freelancers and exporters.** These help you receive foreign payments in India, with invoicing and certificates, rather than send money out.",
          ]),
        ],
      },
      {
        id: "criteria",
        heading: "Eight things to check before you pick",
        blocks: [
          list([
            "**Authorisation.** The service must be able to handle LRS remittances legally. See [how to check a provider is authorised](/guides/is-this-money-transfer-service-safe-in-india).",
            "**What the recipient gets.** Compare the final amount, not the fee. [The real cost of sending money](/guides/real-cost-of-sending-money) explains why.",
            "**The exchange rate.** Compare it with the mid-market rate. The gap is the markup.",
            "**Speed.** Look at the delivery estimate for your route and your way of paying, and for first transfers.",
            "**Limits.** Some services cap a first transfer or a month. Large amounts often need extra documents.",
            "**How you pay.** A bank transfer, a card or UPI can each change the price and the speed.",
            "**Support and clarity.** You should be able to see the purpose declaration, the reference and the status of every transfer.",
            "**Receiving options.** Confirm the service can pay out the way the recipient needs: bank deposit, wallet or cash pickup.",
          ], true),
        ],
      },
      {
        id: "compare",
        heading: "How to compare apps fairly",
        blocks: [
          p("Use the same amount, the same destination, the same purpose and the same way of paying for every app, and compare what arrives. If one app shows a fee and another shows none, the rate is where the difference hides."),
          tip("Look at the time as well", "A price from a few hours ago may not be the price now. Railor shows when each price was collected and where it came from."),
        ],
      },
      {
        id: "avoid",
        heading: "Red flags",
        blocks: [
          list([
            "An app that asks you to send money to a personal account or a wallet you cannot verify.",
            "A rate that is far better than every other option with no explanation.",
            "No clear statement of who is authorised to provide the service.",
            "Pressure to send quickly.",
          ]),
        ],
      },
      stepsSection("the country you are sending to"),
    ],
    faq: [
      { q: "Which is the best money transfer app in India?", a: "It depends on the route, amount, purpose and how you pay. Compare the amount that arrives for your own inputs on the same day, and check that the service is authorised." },
      { q: "Are money transfer apps safe to use in India?", a: "Authorised services that follow the RBI's rules and verify your identity are regulated. Check authorisation before you send, never send to unverifiable accounts and keep your references." },
      { q: "Can I send money abroad using UPI?", a: "UPI is a domestic payment system. Some services let you pay for a foreign transfer from your Indian bank account; what you can do abroad with UPI depends on the service and the country. Check the details with the provider." },
      { q: "Is a no-fee transfer really free?", a: "Not necessarily. A provider can earn through the exchange rate. Compare what the recipient receives." },
    ],
  },

  "cheapest-way-to-send-money-abroad-from-india": {
    intro:
      "The cheapest way to send money abroad from India is the one that leaves the most with the recipient for the rupees you pay, after the fee, the exchange-rate markup, charges along the way and any tax collected at source. This guide shows where each cost comes from and how to compare without being misled by a low advertised fee.",
    sections: [
      {
        id: "parts",
        heading: "The four parts of the cost",
        blocks: [
          list([
            "**The fee.** What the provider states. It can be a flat amount, a percentage or both, and it can be zero.",
            "**The exchange-rate markup.** The mid-market rate is the real rate between two currencies. Providers usually give you a slightly worse one, and the gap is their margin. It is often the largest part of the cost.",
            "**Intermediary charges.** A bank in the middle of a wire can deduct a charge from the amount. [OUR, SHA and BEN explained](/guides/swift-charges-our-sha-ben-explained).",
            "**Tax collected at source (TCS).** Advance tax the bank or dealer collects above the threshold on the Income Tax Department's page. It is not a provider fee, but it changes how much of your money is available.",
          ]),
        ],
      },
      {
        id: "how",
        heading: "How to find the cheapest option for your transfer",
        blocks: [
          list([
            "Fix the inputs: the rupee amount, the destination, the purpose and how you will pay.",
            "Compare the **amount the recipient receives** for each provider, with the time each price was collected.",
            "Check the delivery time and whether a first-transfer offer applies to you.",
            "Check how you pay: a card can cost more than a bank transfer at the same provider.",
            "Re-check close to the time you send, because rates move through the day.",
          ], true),
          tip("The cheapest is not always the same one", "Fixed fees weigh more on small transfers and the exchange rate weighs more on large ones, so the ranking can change with the amount."),
        ],
      },
      {
        id: "trade",
        heading: "When the cheapest is not the best",
        blocks: [
          p("A slightly cheaper option that arrives days later, caps your amount or needs documents you do not have is not cheaper in practice. Pick the cheapest option that meets your deadline, your amount and the recipient's way of receiving."),
        ],
      },
      tcsSection,
      stepsSection("the country you are sending to"),
    ],
    faq: [
      { q: "What is the cheapest way to send money abroad from India?", a: "Whichever delivers the most to your recipient for your amount, purpose and way of paying on the day. Compare live on the same inputs." },
      { q: "Is bank transfer cheaper than an online service?", a: "Sometimes, and often not. Banks can add a fee and a margin on the rate. Compare the amount that arrives." },
      { q: "Does a bigger transfer cost less in percentage terms?", a: "Often a fixed fee matters less on a large amount, but the exchange-rate margin matters more. Compare at your actual amount." },
      { q: "Why does the rate change during the day?", a: "Currency markets move and providers refresh their rates. Railor shows when each price was collected." },
    ],
  },

  "lrs-limit-and-tcs-explained": {
    intro:
      "The Liberalised Remittance Scheme (LRS) decides how much money a resident individual in India can send abroad each year, and tax collected at source (TCS) can apply to what you send. This guide explains both in plain language, based on the Reserve Bank of India's LRS FAQs and the Income Tax Department's TCS pages, and tells you where to check the current numbers.",
    sections: [
      {
        id: "what",
        heading: "What LRS is",
        blocks: [
          p("Under LRS, all resident individuals, including minors, may freely remit up to **USD 250,000 per financial year** (April to March) for any permitted current or capital account transaction, or a combination of both. It began in 2004 with a much smaller limit and has been raised in stages."),
          p("It is for individuals only. Companies, partnership firms, HUFs and trusts are not covered by it."),
        ],
      },
      {
        id: "rules",
        heading: "The rules that matter day to day",
        blocks: [
          list([
            "**The limit is per person, per financial year, across every channel.** Add up transfers through all banks, dealers and apps.",
            "**No limit on frequency.** You can send as often as you like inside the total.",
            "**PAN is mandatory** for every LRS transaction through an authorised person.",
            "**You declare the purpose (Form A2).** The authorised dealer checks the transaction against the rules, but the responsibility for compliance stays with you.",
            "**Any freely convertible currency** can be used.",
            "**Family members can each use their own limit.** Remittances can be consolidated across family members for current-account purposes, but not for capital-account purposes like opening an overseas account or investing unless they are co-owners.",
            "**Sole proprietors** count against their own individual limit.",
          ]),
        ],
      },
      {
        id: "purposes",
        heading: "What you can send money for",
        blocks: [
          p("The RBI lists permitted purposes including private visits, gifts and donations, going abroad for employment, emigration, maintenance of close relatives abroad, business travel, conferences and training, medical treatment, studies abroad and other current-account transactions that are not prohibited."),
          warn("What LRS does not allow", "Purchase of lottery tickets and similar, margins or margin calls to overseas exchanges, trading in foreign exchange abroad, and remittances to countries or people the RBI has flagged are not permitted."),
        ],
      },
      tcsSection,
      {
        id: "records",
        heading: "What to keep",
        blocks: [
          list([
            "Your purpose declaration and the reference for every transfer.",
            "Your running total for the financial year.",
            "The TCS certificate for any tax collected.",
            "Proof of purpose, such as a fee invoice for study or a medical estimate, if you are ever asked.",
          ]),
        ],
      },
    ],
    faq: [
      { q: "What is the LRS limit?", a: "USD 250,000 per financial year for each resident individual, across all banks and dealers combined, for permitted purposes." },
      { q: "Does LRS apply to companies?", a: "No. The scheme is for resident individuals. Companies and firms use other routes for business payments." },
      { q: "Can I send more than the limit?", a: "Anything above the limit needs the Reserve Bank's permission. Ask your bank." },
      { q: "What is TCS on foreign remittance?", a: "Tax collected at source: advance tax that an authorised dealer collects on LRS remittances above the threshold on the Income Tax Department's TCS page. You can use it against your tax liability." },
      { q: "Where do I check the current TCS rate?", a: "On the Income Tax Department's TCS rates page. Rates depend on the purpose of the remittance and can change." },
      { q: "Do I need a PAN?", a: "Yes. A PAN is mandatory for LRS transactions through an authorised person." },
    ],
  },

  "receive-money-from-abroad-in-india": {
    intro:
      "Getting paid from abroad is different from sending money out: the money arrives in rupees in your bank account, and what matters is how much you receive, how long it takes, the paperwork you get for it and any tax that applies. This guide is for freelancers, small businesses and families receiving money from overseas.",
    sections: [
      {
        id: "ways",
        heading: "How money reaches an Indian bank account",
        blocks: [
          list([
            "**A bank wire (SWIFT).** The sender's bank pays your bank, often through a bank in the middle that can deduct a charge.",
            "**An international payment service.** The sender pays in their own currency and the service pays rupees into your account, often through local rails.",
            "**A collection account.** Some services give you a receiving account in another currency, so your client pays as if domestically and you convert afterwards.",
            "**A payment platform or marketplace payout.** Platforms that pay freelancers settle in rupees or hold a balance first.",
          ]),
        ],
      },
      {
        id: "cost",
        heading: "What decides how many rupees you get",
        blocks: [
          p("As with sending, four things matter: the fee, the exchange-rate markup, any charge taken along the way and conversion timing. Who pays the fee matters too: some services deduct it from the payout and others charge the sender. [The real cost of sending money](/guides/real-cost-of-sending-money) explains the markup."),
          tip("Ask the client how they will pay", "A payment sent as a bank wire, a card payment through a platform and a transfer-app payment can each reach you with different costs and delays."),
        ],
      },
      {
        id: "paperwork",
        heading: "The paperwork",
        blocks: [
          list([
            "**Proof of the inward remittance.** Banks can issue an inward remittance advice or certificate for the credit, often called a FIRC or FIRA. Ask your bank or service what it provides and whether it is automatic or on request.",
            "**An invoice that matches the payment**, with the client's name, the service, the amount and the date.",
            "**Purpose and PAN details** on the remittance, which your bank may ask for.",
            "**GST treatment of exported services.** Exports of services can be zero-rated for GST when the conditions are met, for example with a Letter of Undertaking. Confirm with a chartered accountant.",
          ]),
          warn("Tax is yours to settle", "Foreign income is income. Keep invoices and certificates for your income tax return and, if you are registered, your GST returns."),
        ],
      },
      {
        id: "compare",
        heading: "How to compare ways to get paid",
        blocks: [
          list([
            "Choose the amount your client will pay, in the client's currency.",
            "Compare the rupees you would receive from each service, and who pays the fee.",
            "Check the settlement time and whether the service issues the proof of remittance you need.",
            "Check which account types the service pays into and any limits.",
          ], true),
        ],
      },
    ],
    faq: [
      { q: "How do I receive money from abroad in India?", a: "Through a bank wire, an international payment service, a collection account or a platform payout. Compare the rupees you receive, the time it takes and the paperwork each gives you." },
      { q: "What is a FIRC or FIRA?", a: "A certificate or advice from the bank confirming an inward foreign remittance. It is often needed as proof of foreign income. Ask your bank or service how you get it." },
      { q: "Do I pay tax on money received from abroad?", a: "Foreign earnings are generally taxable income in India. How GST and income tax apply depends on what the money is for. Ask a chartered accountant." },
      { q: "Who pays the fee when I receive money?", a: "It depends on the service. Some deduct it from the payout, others charge the sender. Compare the rupees that arrive." },
    ],
  },

  "send-money-from-india-to-uk": countryGuide({
    name: "the United Kingdom", currency: "pounds",
    intro: "To send money from India to the United Kingdom, a resident individual uses an authorised bank, dealer or app under the RBI's Liberalised Remittance Scheme and sends to a UK bank account using its sort code and account number. This guide covers the rules, what to ask the recipient, and how to compare what arrives in pounds.",
    detailsHeading: "What to ask the person in the UK for",
    details: [
      "**Full name** exactly as it appears on the account.",
      "**Account number** (eight digits) and **sort code** (six digits).",
      "**IBAN and the bank's SWIFT/BIC code** for a bank wire. UK accounts have an IBAN.",
      "**The purpose** you will state, for example family support, study or a gift.",
    ],
    localNote: ["UK bank accounts are identified by a sort code and an account number. Some services pay out through the UK's domestic payment systems, which can be quicker than a wire, while a SWIFT wire may take longer and pick up charges from banks in the middle. The comparison shows each provider's delivery estimate."],
    faq: [
      { q: "What details do I need to send money to a UK bank account?", a: "The recipient's full name, the eight-digit account number and the six-digit sort code. For a bank wire, also the IBAN and the bank's SWIFT/BIC code." },
      { q: "Is it cheaper to send in rupees or pounds?", a: "You send rupees from India and the recipient receives pounds. Compare how many pounds arrive for the same rupee amount." },
    ],
  }),

  "send-money-from-india-to-canada": countryGuide({
    name: "Canada", currency: "Canadian dollars",
    intro: "To send money from India to Canada, a resident individual uses an authorised bank, dealer or app under the RBI's Liberalised Remittance Scheme and sends to a Canadian bank account using its transit, institution and account numbers. This guide covers the rules, what to ask the recipient, and how to compare what arrives in Canadian dollars.",
    detailsHeading: "What to ask the person in Canada for",
    details: [
      "**Full name** exactly as it appears on the account.",
      "**Transit number** (five digits, identifies the branch) and **institution number** (three digits, identifies the bank).",
      "**Account number**, and the bank's **SWIFT/BIC code** for a bank wire.",
      "**The purpose** you will state, for example family support or study.",
    ],
    localNote: ["Canadian accounts are identified by a transit number, an institution number and an account number rather than an IBAN. Domestic e-transfer systems in Canada are for transfers inside the country, so a transfer from India reaches the account through the provider's payout method or a bank wire."],
    faq: [
      { q: "What details do I need to send money to a Canadian bank account?", a: "The recipient's full name, the five-digit transit number, the three-digit institution number and the account number. For a bank wire, also the SWIFT/BIC code." },
      { q: "Can I send money to a student in Canada?", a: "Yes, for a permitted purpose such as maintenance of a close relative or studies abroad. See our guide on sending money abroad for study." },
    ],
  }),

  "send-money-from-india-to-australia": countryGuide({
    name: "Australia", currency: "Australian dollars",
    intro: "To send money from India to Australia, a resident individual uses an authorised bank, dealer or app under the RBI's Liberalised Remittance Scheme and sends to an Australian bank account using its BSB and account number. This guide covers the rules, what to ask the recipient, and how to compare what arrives in Australian dollars.",
    detailsHeading: "What to ask the person in Australia for",
    details: [
      "**Full name** exactly as it appears on the account.",
      "**BSB** (six digits, identifies the bank and branch) and **account number**.",
      "**The bank's SWIFT/BIC code** for a bank wire.",
      "**The purpose** you will state, for example family support or study.",
    ],
    localNote: ["Australian accounts use a BSB and an account number. Australia also has a domestic alias system for fast payments, but a transfer from India reaches the account through the provider's payout method or a bank wire, so ask the provider how it pays out and how long it says that takes."],
    faq: [
      { q: "What details do I need to send money to an Australian bank account?", a: "The recipient's full name, the six-digit BSB and the account number. For a bank wire, also the SWIFT/BIC code." },
      { q: "Why is the Australian dollar amount different from the advertised rate?", a: "Providers usually add a margin to the mid-market rate. Compare the Australian dollars that arrive." },
    ],
  }),

  "send-money-from-india-to-uae": countryGuide({
    name: "the United Arab Emirates", currency: "dirhams",
    intro: "To send money from India to the United Arab Emirates, a resident individual uses an authorised bank, dealer or app under the RBI's Liberalised Remittance Scheme and sends to a UAE bank account using its IBAN. This guide covers the rules, what to ask the recipient, and how to compare how many dirhams arrive.",
    detailsHeading: "What to ask the person in the UAE for",
    details: [
      "**Full name** exactly as it appears on the account.",
      "**IBAN.** UAE IBANs are 23 characters long and start with AE.",
      "**The bank's SWIFT/BIC code** for a bank wire.",
      "**The purpose** you will state, for example family support or a gift.",
    ],
    localNote: ["The dirham is pegged to the US dollar, so its movement against the rupee tracks the dollar's. Many people in the UAE also receive money through exchange houses and wallets; confirm how your recipient wants to be paid before you choose a provider, because not every service pays into every kind of account."],
    faq: [
      { q: "What details do I need to send money to a UAE bank account?", a: "The recipient's full name and their IBAN (23 characters, starting with AE). For a bank wire, also the bank's SWIFT/BIC code." },
      { q: "Is the dirham tied to the dollar?", a: "Yes, it is pegged to the US dollar, so the rupee-to-dirham rate tends to follow the rupee-to-dollar rate." },
    ],
  }),

  "send-money-from-india-to-singapore": countryGuide({
    name: "Singapore", currency: "Singapore dollars",
    intro: "To send money from India to Singapore, a resident individual uses an authorised bank, dealer or app under the RBI's Liberalised Remittance Scheme and sends to a Singapore bank account using the bank code and account number. This guide covers the rules, what to ask the recipient, and how to compare what arrives in Singapore dollars.",
    detailsHeading: "What to ask the person in Singapore for",
    details: [
      "**Full name** exactly as it appears on the account.",
      "**Account number** and the **bank code** (and branch code if the provider asks).",
      "**The bank's SWIFT/BIC code** for a bank wire.",
      "**The purpose** you will state, for example family support, study or a gift.",
    ],
    localNote: ["Singapore has a domestic fast-payment system for local transfers, but a transfer from India reaches the account through the provider's payout method or a bank wire. Ask the provider what it uses and what delivery time it states for first transfers."],
    faq: [
      { q: "What details do I need to send money to a Singapore bank account?", a: "The recipient's full name, the account number and the bank's code. For a bank wire, also the SWIFT/BIC code." },
      { q: "Can I send money to Singapore for study or work?", a: "Yes, for a permitted purpose such as studies abroad or going abroad for employment. State the true purpose in the declaration." },
    ],
  }),

  "send-money-abroad-for-study-from-india": {
    intro:
      "Paying for study abroad is one of the most common reasons Indian families send money overseas, and it is a permitted purpose under the Reserve Bank of India's Liberalised Remittance Scheme. This guide explains who can send, what you will be asked for, how tuition and living costs differ, and how to compare what actually arrives.",
    sections: [
      ...lrsSections("the country where the student is studying"),
      {
        id: "tuition",
        heading: "Tuition and living costs are different payments",
        blocks: [
          list([
            "**Tuition and university fees.** Often paid straight to the institution. Ask the institution for its bank details and the reference to quote, and check whether it accepts payments from overseas providers.",
            "**Living costs.** Usually sent to the student's own bank account abroad, as maintenance or education support.",
            "**Both count toward the LRS limit** of the person sending, within the financial year.",
          ]),
          p("A parent and a student who is a resident individual can each use their own limit. Keep a clear record of which payment used whose limit."),
        ],
      },
      {
        id: "documents",
        heading: "Documents banks and services commonly ask for",
        blocks: [
          list([
            "Your PAN and ID, and the student's details.",
            "The institution's offer or admission letter and its fee invoice, for a payment of fees.",
            "The institution's bank details exactly as stated on the invoice.",
            "The purpose declaration (Form A2) stating studies abroad.",
          ]),
          p("Exactly what is asked for varies by bank or provider. Ask before the deadline for fees."),
        ],
      },
      {
        id: "tax-study",
        heading: "Tax on education remittances",
        blocks: [
          p("Tax collected at source can apply to remittances above the threshold on the Income Tax Department's TCS page, and the rules treat education differently from other purposes, including education financed by a loan from certain lenders. Check the current rule and ask the lender or your tax adviser how it applies to you."),
          checkRules,
        ],
      },
      costSection("the student's currency"),
      stepsSection("the student's country"),
    ],
    faq: [
      { q: "Can I send money abroad for my child's education?", a: "Yes. Studies abroad is a permitted purpose under LRS. State it in the purpose declaration and keep the fee invoice." },
      { q: "Should I pay the university directly or send to the student?", a: "Tuition is often paid straight to the university using the bank details on its invoice. Living costs usually go to the student's account. Ask the university how it accepts payments." },
      { q: "Does tuition count toward the LRS limit?", a: "Yes. Education remittances by a resident individual count toward the USD 250,000 per financial year limit." },
      { q: "Is TCS charged on education payments?", a: "It can be, depending on the amount and how the education is funded. The Income Tax Department's TCS page lists the current treatment." },
    ],
  },

  "swift-charges-our-sha-ben-explained": {
    intro:
      "When you send money by bank wire, the SWIFT message carries an instruction about who pays the bank charges: OUR, SHA or BEN. The choice decides whether the recipient receives the full amount or a smaller one, and it is one of the least understood parts of an international transfer.",
    sections: [
      {
        id: "options",
        heading: "What OUR, SHA and BEN mean",
        blocks: [
          list([
            "**OUR.** You pay all the bank charges, including those of the receiving bank and any bank in the middle. The recipient receives the full amount you intended, though banks cannot always guarantee it.",
            "**SHA (shared).** You pay your bank's charges and the recipient pays the charges of their own bank. Intermediary charges are taken from the amount in transit.",
            "**BEN.** The recipient pays all the charges, which are deducted from the amount they receive.",
          ]),
          p("Charge instructions travel with the payment. They are a request between banks, so the exact treatment can vary, and intermediary banks may still deduct fees."),
        ],
      },
      {
        id: "why",
        heading: "Why the amount that arrives is sometimes smaller",
        blocks: [
          p("A wire from India to a bank abroad can pass through one or more correspondent banks. Each can charge a fee, and with SHA or BEN those fees reduce what arrives. The recipient may see a smaller credit than you expected, with the difference explained only in a bank statement note."),
          tip("If the exact amount matters, ask for OUR", "Tuition fees, rent and invoices that must be paid in full are good reasons to choose OUR, and to confirm the extra cost before you pay."),
        ],
      },
      {
        id: "avoid",
        heading: "Ways to avoid surprise deductions",
        blocks: [
          list([
            "Compare the amount the recipient receives, not the transfer amount you enter.",
            "Ask the bank or provider which charge option it uses and what it costs.",
            "For exact-amount payments, choose a service that guarantees the received amount or pay with OUR.",
            "Check the recipient's bank details and SWIFT/BIC code, because a wrong detail adds a repair charge.",
          ]),
          p("[IBAN, SWIFT, routing numbers and IFSC explained](/guides/iban-swift-bic-explained) covers the details to confirm, and [the real cost of sending money](/guides/real-cost-of-sending-money) shows how to compare options."),
        ],
      },
    ],
    faq: [
      { q: "What is the difference between OUR, SHA and BEN?", a: "OUR means the sender pays all bank charges, SHA means the sender and recipient each pay their own bank's charges, and BEN means the recipient pays all of them." },
      { q: "Which charge option is best?", a: "OUR if the recipient must receive an exact amount. SHA is the common default. BEN reduces what the recipient receives." },
      { q: "Why was the amount smaller than I sent?", a: "A bank in the middle or the receiving bank deducted a charge. The charge option and the route decide who pays." },
    ],
  },

  "is-this-money-transfer-service-safe-in-india": {
    intro:
      "Before you send a large amount abroad, check that the service is allowed to handle it. In India, foreign exchange business is regulated by the Reserve Bank of India, and a legitimate service can tell you who is authorised. This guide shows what to check and the warning signs of a scam.",
    sections: [
      {
        id: "authorised",
        heading: "Who is allowed to handle foreign remittances",
        blocks: [
          p("Remittances under the Liberalised Remittance Scheme go through **authorised persons**: banks that are authorised dealers, and other entities the Reserve Bank authorises to deal in foreign exchange, including authorised money changers for certain current-account transactions. An app can offer the service if it works with an authorised person or holds the authorisation itself."),
          p("The Foreign Exchange Management Act, 1999 (FEMA) is the law behind the rules, and the RBI publishes master directions and FAQs for the public."),
        ],
      },
      {
        id: "check",
        heading: "How to check a service",
        blocks: [
          list([
            "Look for a clear statement of who provides the foreign exchange service and under which authorisation.",
            "Check the RBI's website for the list of authorised entities and for its public warnings.",
            "Confirm that the service verifies your identity and asks for your PAN and the purpose of the remittance, as the rules require.",
            "Check that you pay from your own bank account and that the payment details are in the entity's own name.",
            "Read what happens if a transfer fails: it should be returned to you with a reference.",
          ], true),
        ],
      },
      {
        id: "scams",
        heading: "Warning signs",
        blocks: [
          list([
            "A request to pay into a personal account or an account in a different name.",
            "A rate that is far better than every other option, with pressure to act now.",
            "No identity or purpose checks.",
            "A request to share an OTP, your password or a screen.",
            "Unsolicited offers on messaging apps.",
          ]),
          warn("Stop if it feels wrong", "A legitimate provider never needs your OTP or your password. If something is off, stop and contact your bank."),
        ],
      },
      {
        id: "keep",
        heading: "Protect yourself after you send",
        blocks: [
          list([
            "Keep the reference, the receipt and the purpose declaration.",
            "Confirm with the recipient that the money arrived and for the amount you expected.",
            "Track your LRS total for the financial year.",
          ]),
        ],
      },
    ],
    faq: [
      { q: "How do I know a money transfer service is legal in India?", a: "It should be able to name the authorised entity behind the foreign exchange service, verify your identity, ask for your PAN and the purpose, and have you pay from your own account. Check the RBI's website for authorised entities." },
      { q: "Is it safe to send money through an app?", a: "Apps that work with authorised persons and follow the RBI's rules are regulated. Check authorisation, use your own bank account and keep your references." },
      { q: "What should I do if I think I sent money to a scammer?", a: "Contact your bank straight away with the reference, and report it through the official cyber crime channels. Speed matters." },
    ],
  },

  "send-money-to-india-nre-nro-accounts": {
    intro:
      "People abroad who send money to India often have to choose between an NRE account, an NRO account and the person's resident account. Each has different rules for what can be credited, whether the money can be moved out again, and how it is taxed. This guide explains the choices and what to compare before you send.",
    sections: [
      {
        id: "accounts",
        heading: "The accounts a non-resident Indian can have",
        blocks: [
          list([
            "**NRE (Non-Resident External) account.** Rupee account for money brought in from abroad. It is generally repatriable.",
            "**NRO (Non-Resident Ordinary) account.** Rupee account for income earned in India, such as rent or dividends. Repatriation is subject to the limits and conditions the RBI sets.",
            "**FCNR account.** A foreign-currency deposit account.",
            "**A resident relative's account.** Money can be sent to a resident family member's account, which is treated differently from the sender's own account.",
          ]),
          p("Which account is right depends on where the money comes from and whether you need to take it out of India again. Ask your bank, and check the RBI's FAQs on non-resident accounts."),
        ],
      },
      {
        id: "send",
        heading: "What to ask the person receiving in India",
        blocks: [
          list([
            "**Full name** exactly as on the account.",
            "**Account number** and the **IFSC code** of the branch (eleven characters).",
            "**The type of account**: NRE, NRO or resident savings, because it changes the paperwork.",
            "**The purpose** you will state, for example family support.",
          ]),
          p("[How to send money from the US to India](/guides/send-money-to-india) walks through the sending side, and [IBAN, SWIFT, routing numbers and IFSC explained](/guides/iban-swift-bic-explained) shows the details."),
        ],
      },
      {
        id: "compare",
        heading: "How to compare what arrives",
        blocks: [
          p("Compare the rupees that arrive for the same amount, and check that the provider can pay into the type of account your recipient has. Some services pay only into certain accounts."),
          tip("Keep the paperwork", "For NRE and NRO accounts, keep the remittance advice. Banks may ask for it when you repatriate funds or for tax filing."),
        ],
      },
    ],
    faq: [
      { q: "What is the difference between NRE and NRO accounts?", a: "An NRE account holds rupees from money brought in from abroad and is generally repatriable. An NRO account holds income earned in India and repatriation is subject to RBI limits and conditions." },
      { q: "Can I send money to a family member's regular account in India?", a: "Yes. Money sent to a resident relative's account is treated differently from money sent to your own NRE or NRO account. Ask your bank about the tax and reporting treatment." },
      { q: "Which is cheaper, sending to NRE or to a resident account?", a: "The transfer cost depends on the provider and route, not on the account type. Compare the rupees that arrive." },
    ],
  },
};
