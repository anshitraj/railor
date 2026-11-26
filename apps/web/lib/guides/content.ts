/**
 * The guides themselves. They teach how sending money works and never quote a
 * provider's fee or rate: those change daily and Railor shows them live, with
 * their source, in the price check. Where a number appears it is arithmetic on
 * a labelled example, never a real quote.
 *
 * Text may carry **bold** and internal links written as [text](/path).
 */

import { INDIA_CONTENT } from "./content-india";

const p = (text: string): Block => ({ type: "p", text });
const list = (items: string[], ordered = false): Block => ({ type: "list", items, ordered });
const tip = (title: string, text: string): Block => ({ type: "callout", tone: "tip", title, text });

export type Block =
  | { type: "p"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "callout"; tone: "tip" | "warning" | "example"; title: string; text: string }
  | { type: "table"; caption?: string; head: string[]; rows: string[][] };

export interface Section {
  id: string;
  heading: string;
  blocks: Block[];
}

export interface GuideContent {
  intro: string;
  sections: Section[];
  faq: Array<{ q: string; a: string }>;
}

const BASE_CONTENT: Record<string, GuideContent> = {
  "how-to-send-money-abroad": {
    intro:
      "Sending money abroad takes about ten minutes once you know what to decide. The cost hides in two places, the fee and the exchange rate, and the rest of the choices are about speed and safety. Here they are in the order you make them.",
    sections: [
      {
        id: "details",
        heading: "1. Get the right details from the person receiving",
        blocks: [
          { type: "p", text: "Ask for their full name exactly as it appears on the bank account, and the account details their country uses. Those differ: a US account needs a routing number, a UK account a sort code, a euro account an IBAN, an Indian account an IFSC code." },
          { type: "p", text: "Our guide to [IBAN, SWIFT, sort codes and IFSC](/guides/iban-swift-bic-explained) lists what to ask for in each country. Wrong details are the most common reason a transfer is delayed or sent back." },
        ],
      },
      {
        id: "arrive",
        heading: "2. Decide how the money should arrive",
        blocks: [
          { type: "p", text: "A bank deposit is the usual choice and works almost everywhere. Some countries also have instant systems that certain providers can pay into, such as UPI in India or PIX in Brazil. Cash pickup and mobile wallets exist for people without a bank account." },
          { type: "p", text: "Not every provider supports every option for every country, so choose the option first and then compare only the providers that offer it." },
        ],
      },
      {
        id: "pay",
        heading: "3. Choose how you pay",
        blocks: [
          { type: "p", text: "You can fund a transfer from your bank account, a debit card or a credit card. The choice changes the fee, the speed and sometimes what your card company charges. [Bank transfer, debit card or credit card](/guides/debit-card-vs-bank-transfer) explains the trade-offs." },
        ],
      },
      {
        id: "compare",
        heading: "4. Compare what arrives, not what is advertised",
        blocks: [
          { type: "p", text: "A provider can advertise a low fee and still give you a weak exchange rate. The only fair comparison is the amount the recipient actually receives for the amount you send. [The real cost of sending money](/guides/real-cost-of-sending-money) shows how to work that out." },
          { type: "p", text: "Railor does this for you: pick the countries and the amount in Convert currencies and it lists the providers that can serve you, ranked by what arrives, with the source of each price." },
        ],
      },
      {
        id: "check",
        heading: "5. Check speed, limits and the provider",
        blocks: [
          { type: "list", items: [
            "**Speed.** Some transfers arrive in minutes, others take days. First transfers can take longer while the provider checks your identity.",
            "**Limits.** Providers cap how much you can send at once and over a month. Large amounts often need extra documents.",
            "**Licence.** Look the provider up on your regulator's register, for example your state regulator in the US or the FCA Register in the UK.",
          ] },
        ],
      },
      {
        id: "send",
        heading: "6. Send it and keep the proof",
        blocks: [
          { type: "p", text: "Check the name and account number one last time, send the money, and save the confirmation and the tracking number. Tell the recipient the exact amount and the expected day so they can spot a problem early." },
          { type: "callout", tone: "warning", title: "Only send money to people you know", text: "Transfers are very hard to reverse once they are paid out. Never send money to someone you have only met online, or because a stranger, a caller or a message created urgency." },
        ],
      },
    ],
    faq: [
      { q: "How long does it take to send money abroad?", a: "From a few minutes to several business days. It depends on the provider, how you pay and the receiving country's banking system. A first transfer can take longer while your identity is checked." },
      { q: "What is the cheapest way to send money abroad?", a: "It changes with the route, the amount and the day, because fees and exchange rates move. Compare the amount that arrives across providers each time, which is what Railor's Convert currencies page does." },
      { q: "Can I cancel a transfer after I pay?", a: "Usually only until the money has been paid out. In the US, federal rules give most consumer transfers abroad a short cancellation window, typically 30 minutes after you pay. Check the provider's terms before you send." },
    ],
  },

  "real-cost-of-sending-money": {
    intro:
      "Most people compare the fee. The fee is often the smaller part of what a transfer costs. The bigger cost can sit in the exchange rate, and the only number that captures both is how much the recipient receives.",
    sections: [
      {
        id: "two-costs",
        heading: "The two costs in every transfer",
        blocks: [
          { type: "list", items: [
            "**The fee.** A flat amount or a percentage the provider shows you. “No fee” offers exist, but the cost can move to the rate.",
            "**The exchange-rate markup.** The difference between the rate you are given and the mid-market rate. Providers rarely show it as a fee.",
          ] },
          { type: "p", text: "The **mid-market rate** is the midpoint between the buy and sell prices of a currency in the wholesale market. It is the fair reference point, and the one a good provider stays close to." },
        ],
      },
      {
        id: "example",
        heading: "A worked example",
        blocks: [
          { type: "callout", tone: "example", title: "Example numbers, not a live rate", text: "Suppose the mid-market rate is 1 USD = 90.00 INR, so 1,000 USD would be worth 90,000 INR at the fair rate. Two providers quote you the following." },
          { type: "table", caption: "Sending 1,000 USD. Illustrative figures.", head: ["", "Provider A", "Provider B"], rows: [
            ["Fee", "0 USD", "5 USD"],
            ["Rate offered", "88.00", "89.60"],
            ["Amount converted", "1,000 USD", "995 USD"],
            ["Recipient receives", "88,000 INR", "89,152 INR"],
            ["Cost against the fair rate", "2,000 INR (2.2%)", "848 INR (0.9%)"],
          ] },
          { type: "p", text: "Provider A advertised “no fee” and cost more than twice as much. Without comparing the amount received, you would never know." },
          { type: "p", text: "The calculation is simple: **cost = amount × mid-market rate − amount received.** Railor shows it next to each price." },
        ],
      },
      {
        id: "compare",
        heading: "How to compare in one line",
        blocks: [
          { type: "p", text: "Put the same amount into every provider and look only at what arrives. Then check the delivery time. If two providers arrive within a few rupees or pounds of each other, pick the faster or the one with the better protection." },
        ],
      },
      {
        id: "watch",
        heading: "What to watch for",
        blocks: [
          { type: "list", items: [
            "**“Zero fee” and “best rate” claims.** They describe one part of the price. Compare the total.",
            "**First-transfer offers.** A better rate for new customers is real, but it applies to the first transfer only. Railor marks these as offers.",
            "**Bank wire charges.** On a SWIFT wire the receiving bank or a bank in the middle can deduct its own fee. Banks usually let you choose who pays: OUR means you pay all charges, SHA shares them, BEN means the recipient pays.",
            "**Rates that move.** The rate can change between the quote and the moment you pay. Check whether the provider locks it when you pay.",
            "**Card terminals abroad.** If a card machine or ATM offers to charge you in your home currency, choose the local currency. The conversion offered at the machine is usually the worse deal.",
          ] },
        ],
      },
    ],
    faq: [
      { q: "What is the mid-market rate?", a: "The midpoint between the buy and sell prices of a currency in the wholesale market. It is the fair reference rate; the closer a provider's rate is to it, the less you lose." },
      { q: "Is a transfer with no fee really free?", a: "Not necessarily. The provider can earn its margin through the exchange rate instead. Compare the amount that arrives." },
      { q: "Why does the amount I receive change?", a: "Exchange rates move through the day, and some providers update their prices every few minutes. Compare at the time you send." },
    ],
  },

  "send-money-to-india": {
    intro:
      "Sending dollars to India works in three common ways: a deposit into a bank account, an instant UPI payment, or cash pickup. All three end in rupees, so the comparison that matters is how many rupees arrive.",
    sections: [
      {
        id: "needs",
        heading: "What the person in India needs to give you",
        blocks: [
          { type: "list", items: [
            "Their full name exactly as it is on the bank account.",
            "The account number and the bank's **IFSC code**, an 11-character code that identifies the bank branch. It is printed on a cheque and shown in the bank's app.",
            "For UPI, their UPI ID, if the provider you choose supports UPI payouts.",
          ] },
          { type: "p", text: "More on these in [IBAN, SWIFT, sort codes and IFSC explained](/guides/iban-swift-bic-explained)." },
        ],
      },
      {
        id: "ways",
        heading: "The ways the rupees can arrive",
        blocks: [
          { type: "table", head: ["Way", "Good for", "Keep in mind"], rows: [
            ["Bank deposit", "Most transfers, any amount", "Needs account number and IFSC. Speed depends on the provider."],
            ["UPI", "Quick, smaller payments", "Only some providers pay out to UPI."],
            ["Cash pickup", "Recipients without a bank account", "The recipient needs ID, and pickup networks are limited to some providers."],
          ] },
        ],
      },
      {
        id: "compare",
        heading: "How to get the most rupees",
        blocks: [
          { type: "p", text: "Exchange rates between the dollar and the rupee are public, so the fair reference is easy to find. What differs is how far each provider's rate sits from it, plus the fee. Use [Convert currencies](/prices?from=USD&to=INR&amount=1000&destinationCountry=IN&direction=send&profile=personal&country=US&purpose=personal&market=1) to see what arrives from each provider for your amount." },
          { type: "p", text: "Our [live USD to INR ranking](/guides/usd-to-inr) lists the ten services Railor checks for this route, ordered by the rupees that arrive." },
          { type: "callout", tone: "tip", title: "Check the offer's small print", text: "Many providers give new customers a better rate on a first transfer. It can be the cheapest option once, and an average one afterwards. Railor labels these as offers so you can tell." },
        ],
      },
      {
        id: "limits",
        heading: "Limits, ID checks and speed",
        blocks: [
          { type: "p", text: "Providers verify your identity before the first transfer, which can add time. Larger amounts can need proof of where the money comes from. Most providers show the expected delivery time before you pay; compare it as well as the amount." },
          { type: "p", text: "If the transfer is a gift or support for family, tax reporting rules can apply to the sender above certain amounts, for example IRS Form 709 for large gifts in the US. For anything large, ask a tax adviser." },
        ],
      },
    ],
    faq: [
      { q: "What do I need to send money to an Indian bank account?", a: "The recipient's name as on the account, the account number and the bank's IFSC code. For UPI, a UPI ID instead." },
      { q: "How long does it take to send money to India?", a: "From minutes to a few business days, depending on the provider, how you pay and the payout method. The provider shows an estimate before you pay." },
      { q: "Which service gives the most rupees?", a: "It changes through the day and with the amount, so check at the time you send. Railor compares the providers that can serve you and ranks them by the rupees that arrive." },
    ],
  },

  "debit-card-vs-bank-transfer": {
    intro:
      "You can usually fund an international transfer three ways: from your bank account, with a debit card or with a credit card. The provider is the same, but the cost, the speed and the risk are not.",
    sections: [
      {
        id: "compare",
        heading: "The four ways to pay, side by side",
        blocks: [
          { type: "table", head: ["How you pay", "Typical cost", "Speed to start", "Watch out for"], rows: [
            ["Bank transfer (ACH or pay by bank)", "Often the lowest", "Can be slower: some providers wait for the payment to clear", "A failed payment if the balance is low or the account is not verified"],
            ["Debit card", "Usually higher than a bank transfer", "Often fast", "Daily card limits at your bank; some providers charge more for cards"],
            ["Credit card", "Often the highest", "Fast", "Your card issuer may treat it as a cash advance: a separate fee and interest from day one"],
            ["Wire from your bank", "A flat fee plus your bank's exchange-rate markup", "Typically a few business days", "The receiving bank or one in the middle can deduct its own fee"],
          ] },
          { type: "p", text: "These are tendencies, not promises. Providers set their own prices, which is why the same transfer can cost different amounts by method." },
        ],
      },
      {
        id: "choose",
        heading: "How to choose",
        blocks: [
          { type: "list", items: [
            "**Sending a larger amount, no rush:** bank transfer usually saves the most, because card costs often grow with the amount.",
            "**Need it there today:** a debit card can be quicker to start. Compare the extra cost against the time you save.",
            "**Thinking of a credit card:** read your card agreement first. Many issuers charge a cash-advance fee and start interest immediately for money transfers.",
            "**Sending from a bank with a poor exchange rate:** a specialist provider usually beats a bank wire. See [the real cost of sending money](/guides/real-cost-of-sending-money).",
          ] },
        ],
      },
      {
        id: "compare-live",
        heading: "Compare the final amount for each method",
        blocks: [
          { type: "p", text: "The method you choose can change the price, so look at the funding method shown with each price before you send. In [Convert currencies](/prices) you can compare providers for your route and amount in a few taps." },
        ],
      },
    ],
    faq: [
      { q: "Is it cheaper to pay by bank transfer or debit card?", a: "Bank transfer is often cheaper, but it can start more slowly. Compare the amount that arrives for each method at the provider you choose." },
      { q: "Can I send money with a credit card?", a: "Some providers accept credit cards, usually at a higher cost. Your card issuer may also charge a cash-advance fee and interest from the day you pay, so check the card terms first." },
      { q: "Is a bank wire a good option?", a: "A wire is dependable for large or urgent amounts, but banks often add a flat fee and a margin on the exchange rate, and the receiving bank can deduct its own fee." },
    ],
  },

  "iban-swift-bic-explained": {
    intro:
      "Every country identifies a bank account differently. Asking the person receiving the money for the right details the first time saves days. This is what each one is, and what to ask for in each country.",
    sections: [
      {
        id: "terms",
        heading: "The terms, in plain language",
        blocks: [
          { type: "list", items: [
            "**IBAN** (International Bank Account Number): one long number that contains the country, the bank and the account. It starts with a two-letter country code and two check digits and is at most 34 characters long. Used across Europe, the Middle East and many other countries; not in the US.",
            "**SWIFT or BIC code:** the identifier of the bank itself, 8 or 11 characters. International wires use it to find the receiving bank.",
            "**Routing number (ABA):** the US bank identifier, 9 digits.",
            "**Sort code:** the UK bank-branch identifier, 6 digits.",
            "**IFSC:** India's bank-branch identifier, 11 characters.",
          ] },
        ],
      },
      {
        id: "by-country",
        heading: "What to ask for, by country",
        blocks: [
          { type: "table", head: ["Where the money goes", "Ask for"], rows: [
            ["United States", "Routing number (9 digits) and account number"],
            ["United Kingdom", "Sort code (6 digits) and account number (8 digits)"],
            ["Euro area and the rest of SEPA", "IBAN. The bank's BIC is often not needed for euro payments inside Europe"],
            ["India", "Account number and IFSC (11 characters). For UPI, the UPI ID"],
            ["Canada", "Institution number (3), transit number (5) and account number"],
            ["Australia", "BSB (6 digits) and account number"],
            ["Mexico", "CLABE (18 digits)"],
            ["Brazil", "A PIX key, or bank code, branch and account number"],
            ["Nigeria", "The 10-digit account number (NUBAN) and the bank's name"],
            ["United Arab Emirates", "IBAN (23 characters)"],
          ] },
          { type: "p", text: "If the country is not listed, ask for the IBAN first. If the recipient has none, ask for the account number, the bank's name and address and its SWIFT code." },
        ],
      },
      {
        id: "tips",
        heading: "Avoid the common mistakes",
        blocks: [
          { type: "list", items: [
            "Copy and paste the details instead of retyping them. One wrong digit can send the money back.",
            "Use the name exactly as it appears on the account. Banks and providers match it.",
            "Ask the recipient to read the details from their bank's app, not from an old document.",
            "For a first transfer to someone new, many people send a small amount first to confirm the details work.",
          ] },
          { type: "callout", tone: "tip", title: "Use a provider that checks for you", text: "Many providers check the format of the IBAN, sort code or IFSC as you type and warn you if it cannot be right. It is one more reason to pick a provider before you ask for details." },
        ],
      },
    ],
    faq: [
      { q: "What is the difference between an IBAN and a SWIFT code?", a: "An IBAN identifies the account itself. A SWIFT or BIC code identifies the bank. International wires can need both." },
      { q: "Does the US use IBANs?", a: "No. US accounts are identified by a 9-digit routing number and an account number." },
      { q: "What is an IFSC code?", a: "An 11-character code that identifies an Indian bank branch. You need it, with the account number, to send money to an Indian bank account." },
    ],
  },

  "usd-to-inr": {
    intro:
      "Railor checks the services that send US dollars to India the same way each time: the same amount, the same route, the provider's own live or published price. This page orders them by the rupees that arrive, current prices first and dated estimates after them, as of the moment you open it.",
    sections: [
      {
        id: "how",
        heading: "How the list is made",
        blocks: [
          { type: "list", items: [
            "**Same transfer for everyone.** Each provider is asked about the same amount sent from the US to India.",
            "**Ranked by rupees received,** after fees, not by the fee or the headline rate.",
            "**Sources are shown.** Prices come from the provider's own calculator or published fees. Dated estimates are listed after current prices and are never called best.",
            "**Offers are labelled.** A better rate for new customers is marked as an offer.",
          ] },
          { type: "p", text: "The ranking changes through the day and with the amount. A fee that is mostly a fixed amount matters more on a small transfer, and a rate matters more on a large one." },
        ],
      },
      {
        id: "before",
        heading: "Before you pick the first one",
        blocks: [
          { type: "list", items: [
            "Check whether the top price is a first-transfer offer. It may not apply to you.",
            "Look at how you pay. A card can cost more than a bank transfer at the same provider.",
            "Compare delivery time as well, and check that the provider can pay out the way your recipient needs: bank deposit, UPI or cash pickup.",
          ] },
          { type: "p", text: "New to this route? Read [how to send money from the US to India](/guides/send-money-to-india)." },
        ],
      },
    ],
    faq: [
      { q: "Which is the best way to send USD to INR?", a: "The one that delivers the most rupees for your amount and that your recipient can use. It changes through the day, so the ranking above is live." },
      { q: "Is the ranking the same for 100 and 10,000 dollars?", a: "Not always. Fixed fees weigh more on small transfers and the exchange rate weighs more on large ones. Change the amount to see it." },
      { q: "Is this ranking the same for everyone?", a: "It is for a personal sender in the US. Prices can differ by who is sending and how they pay, so a free Railor account matches the comparison to your profile and amount." },
    ],
  },
  "best-money-transfer-services": {
    intro:
      "The best money transfer service is the one that delivers the most to your recipient for your amount, on your route, the way you want to pay and in the time you have. That changes by corridor and by the hour, so this guide shows how to choose and then builds the ranking from today's prices instead of from opinion.",
    sections: [
      {
        id: "what-best-means",
        heading: "What \"best\" means",
        blocks: [
          list([
            "**What arrives.** The amount the recipient receives for the amount you send is the figure that matters. A low fee and a weak exchange rate can still cost more than a higher fee and a good rate.",
            "**The exchange-rate markup.** Providers rarely give you the mid-market rate. The gap between it and the rate you are given is the markup, and it is often the biggest cost. [The real cost of sending money](/guides/real-cost-of-sending-money) shows how to measure it.",
            "**Fees.** Flat fees, percentage fees and fees that depend on how you pay.",
            "**Speed.** Minutes, hours or days, and whether a first transfer takes longer while your identity is checked.",
            "**How you pay and how they receive.** Bank transfer, debit card, credit card, cash pickup, mobile wallet. Each can change the price.",
            "**Limits and safety.** How much you can send at once, and whether the provider is licensed where you send from.",
          ]),
        ],
      },
      {
        id: "kinds",
        heading: "The kinds of provider",
        blocks: [
          list([
            "**Banks.** Familiar and good for large or unusual transfers, but often with a bank fee and a margin on the rate, and a wire can pick up charges along the way.",
            "**Specialist online services.** Built for sending abroad, with clear fees and usually the narrowest markup. They differ widely, so compare them.",
            "**Wallets and multi-currency accounts.** Strong if you already hold and spend several currencies, and often cheaper between the same provider's own users.",
            "**Cash-pickup and remittance networks.** The widest reach for people without a bank account, usually at a higher cost.",
            "**Brokers for large amounts.** Useful for property, business or tuition payments, sometimes with forward contracts. They suit larger sums more than small ones.",
          ]),
          p("No kind wins every route. A provider that is cheapest from one country to another can be weak on the next corridor, which is why the table below can be switched between routes."),
        ],
      },
      {
        id: "read-the-table",
        heading: "How to read the table",
        blocks: [
          list([
            "**Recipient gets.** What arrives in the destination currency, after the fee and the exchange rate. The table ranks by this.",
            "**Markup.** How far that amount sits below what the mid-market rate would give, fee and exchange rate together. A negative figure means the price beats the mid-market amount, which usually means a first-transfer offer.",
            "**Fees.** The provider's stated fee for this amount. \"Check fee\" means it isn't published for this setup.",
            "**Delivery.** The provider's own estimate. It can be slower for a first transfer.",
            "**How you pay.** The funding method the price is for. A different method can change the price.",
            "**Source.** Each price is a live public quote, a published fee schedule or a dated estimate, and says so.",
          ]),
          tip("Look at the time", "Prices move through the day. Each price shows when it was collected. Confirm the final figure with the provider before you pay."),
        ],
      },
      {
        id: "situations",
        heading: "Choosing for your situation",
        blocks: [
          list([
            "**Sending to family regularly.** Compare the same amount every time you send, and check the delivery time and how your family wants to receive.",
            "**A large one-off transfer.** The markup matters more than the fee, and limits matter. Check how large amounts are handled and the documents asked for.",
            "**Paying a business or an invoice.** Look for providers that accept commercial payments, can pay an exact amount and give you proof of payment.",
            "**Receiving payments as a freelancer.** Compare what lands in your account, who pays the fee and what paperwork you get. [Receiving money from abroad in India](/guides/receive-money-from-abroad-in-india) covers it for India.",
          ]),
        ],
      },
      {
        id: "safe",
        heading: "Check that a provider is licensed",
        blocks: [
          p("Money transfer services are regulated where they operate. Before a large transfer, check that the provider is authorised in the country you send from, that it verifies your identity and that you pay from your own account in its own name. For India, [how to check a service is authorised](/guides/is-this-money-transfer-service-safe-in-india) shows what to look for."),
        ],
      },
      {
        id: "mistakes",
        heading: "Mistakes that cost money",
        blocks: [
          list([
            "Picking by the advertised fee instead of by what arrives.",
            "Comparing different amounts, or different ways of paying, across providers.",
            "Sending on a price from earlier in the day.",
            "Assuming a first-transfer offer applies to you.",
            "Skipping the recipient's details check, which delays the transfer.",
          ]),
        ],
      },
    ],
    faq: [
      { q: "Which is the best money transfer service?", a: "It depends on the route, the amount and how you pay. The table ranks the providers that can serve your route by what the recipient receives today." },
      { q: "Is the cheapest service always the best?", a: "Not always. A slightly cheaper option that arrives days later or caps your amount may not suit you. Pick the cheapest one that meets your deadline and limits." },
      { q: "How often do the rankings change?", a: "Rates move through the day and providers refresh their prices, so the order can change within hours. Each price shows when it was collected." },
      { q: "Why do some providers show a negative markup?", a: "A negative markup means the amount arriving beats the mid-market amount, which usually comes from a first-transfer offer. Offers apply to new customers only." },
      { q: "Does Railor earn money from the providers in the table?", a: "The ranking is ordered by what arrives, not by who pays. Railor shows the source of every price so you can check it." },
    ],
  },
};

export const GUIDE_CONTENT: Record<string, GuideContent> = { ...BASE_CONTENT, ...INDIA_CONTENT };
