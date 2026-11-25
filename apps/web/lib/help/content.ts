import type { Section } from "../guides/content";

/**
 * Help articles. They describe how Railor works today and never quote a
 * provider's fee or rate: those change daily and the price check shows them
 * with their source. Text may carry **bold** and internal links [text](/path).
 */
export interface HelpContent {
  intro: string;
  sections: Section[];
}

export const HELP_CONTENT: Record<string, HelpContent> = {
  "comparing-prices/how-to-compare": {
    intro: "Convert currencies shows what each provider would deliver for the amount you choose, best first.",
    sections: [
      {
        id: "steps",
        heading: "In four steps",
        blocks: [
          { type: "list", ordered: true, items: [
            "Open [Convert currencies](/prices).",
            "Pick the currency you send, the currency that arrives and the amount. Tap a preset or type your own.",
            "Pick who you are: Personal, Freelancer or Business. The list only shows services that can serve you.",
            "Read from the top. The first row delivers the most. Tap any row to see its fees, how long it takes and where the price came from.",
          ] },
          { type: "callout", tone: "tip", title: "Prices keep refreshing", text: "While the page is open the list refreshes, and every price shows when it was checked." },
        ],
      },
    ],
  },

  "comparing-prices/price-labels": {
    intro: "Every price carries a label that says what kind of price it is. They are not all equally firm, so the label matters.",
    sections: [
      {
        id: "labels",
        heading: "The labels",
        blocks: [
          { type: "table", head: ["Label", "What it means"], rows: [
            ["Account quote", "A price from your own connected provider account, for your exact transfer."],
            ["Market reference", "A price read from the provider’s public calculator or a market feed for this amount."],
            ["Published estimate", "Worked out from the fees the provider publishes."],
            ["Partial estimate", "A published price where one cost is still unknown, so it is never ranked as the best."],
            ["First-transfer offer", "A better rate some providers give new customers on a first transfer. It may not apply to you."],
            ["Dated estimate", "A price collected earlier from a comparison site. It is listed after current prices, with when it was collected, and never called the best."],
          ] },
        ],
      },
    ],
  },

  "comparing-prices/why-prices-differ": {
    intro: "A price here can differ from the one on a provider’s own site. These are the usual reasons.",
    sections: [
      {
        id: "reasons",
        heading: "Why it happens",
        blocks: [
          { type: "list", items: [
            "**The rate moved.** Exchange rates change through the day, and providers update their prices at their own pace.",
            "**It is for a different amount.** Fixed fees weigh more on small transfers, so the best option can change with the amount.",
            "**It is for a different way of paying.** A bank transfer, a debit card and a credit card can all be priced differently.",
            "**An offer applies to new customers only.** Railor marks these, because the price on the provider’s site may be different for you.",
            "**It was collected earlier.** A dated estimate says when it was collected.",
          ] },
          { type: "callout", tone: "warning", title: "Confirm before you pay", text: "Always check the final amount on the provider’s own page before you send." },
        ],
      },
    ],
  },

  "comparing-prices/where-prices-come-from": {
    intro: "Railor takes prices from the provider itself, and shows you the source and the time.",
    sections: [
      {
        id: "sources",
        heading: "The sources",
        blocks: [
          { type: "list", items: [
            "The provider’s own public calculator, read for the exact amount and route.",
            "Fees the provider publishes on its own pages.",
            "Your own provider account, when you connect one, for an exact quote.",
            "Comparison sites, for dated estimates only. These are labelled with when they were collected and are never ranked above a current price.",
          ] },
          { type: "p", text: "Railor does not take a fee or a rate from forums, social posts or AI answers. See [how Railor handles trust](/company/trust) for the full rules." },
        ],
      },
    ],
  },

  "sending-money/provider-not-listed": {
    intro: "If a provider you expected is missing, it is usually hidden on purpose, and Railor tells you how many were hidden.",
    sections: [
      {
        id: "why",
        heading: "The usual reasons",
        blocks: [
          { type: "list", items: [
            "**It can’t serve your profile.** Some services are for businesses only, or only for certain countries or account types.",
            "**It doesn’t support the route.** Not every provider sends every currency to every country.",
            "**There is no current price yet.** Railor does not guess a price it can’t source.",
          ] },
          { type: "callout", tone: "tip", title: "Check your profile", text: "If you picked Business but you are sending personally, or the other way round, switch the profile above the list and the options change." },
        ],
      },
    ],
  },

  "sending-money/after-you-choose": {
    intro: "Railor compares prices. The transfer itself happens on the provider’s own site or app.",
    sections: [
      {
        id: "next",
        heading: "What to do next",
        blocks: [
          { type: "list", ordered: true, items: [
            "Tap the provider you chose to continue on its own site.",
            "Enter the same amount and route there and check the final amount it shows.",
            "Have the recipient’s bank details ready. [IBAN, SWIFT, sort code and IFSC explained](/guides/iban-swift-bic-explained) lists what to ask for.",
            "Pay, and keep the confirmation.",
          ] },
        ],
      },
    ],
  },

  "sending-money/new-to-sending-money": {
    intro: "A few short guides cover the basics before you send for the first time.",
    sections: [
      {
        id: "guides",
        heading: "Start here",
        blocks: [
          { type: "list", items: [
            "[How to send money abroad, step by step](/guides/how-to-send-money-abroad)",
            "[The real cost of sending money](/guides/real-cost-of-sending-money)",
            "[Bank transfer, debit card or credit card](/guides/debit-card-vs-bank-transfer)",
            "[IBAN, SWIFT, sort code and IFSC explained](/guides/iban-swift-bic-explained)",
          ] },
          { type: "p", text: "Looking at one country? Open the [guides](/guides) and pick it under “Send money to”." },
        ],
      },
    ],
  },

  "account-and-plans/free-account": {
    intro: "Comparing prices is free and doesn’t need an account. A free account gives you a workspace.",
    sections: [
      {
        id: "what",
        heading: "What an account adds",
        blocks: [
          { type: "list", items: [
            "Saved routes you can reopen in one tap.",
            "The invoice and payroll tools.",
            "Your settings, and the option to upgrade when you want Railor to keep watching for you.",
          ] },
          { type: "p", text: "To start, choose **Get started** at the top of any page and follow the steps. There is nothing to pay." },
        ],
      },
    ],
  },

  "account-and-plans/plans": {
    intro: "Checking prices is free. Plans add the things that keep watching for you.",
    sections: [
      {
        id: "adds",
        heading: "What a plan adds",
        blocks: [
          { type: "list", items: ["Rate alerts by email", "Saved transfers", "Route monitoring", "More API volume"] },
          { type: "p", text: "What each plan includes, and what it costs, is on the [pricing page](/pricing), which is always the current answer." },
        ],
      },
    ],
  },

  "account-and-plans/change-plan": {
    intro: "You can change your plan from inside your workspace.",
    sections: [
      {
        id: "how",
        heading: "How",
        blocks: [
          { type: "list", ordered: true, items: [
            "Sign in and look at the bottom of the sidebar, where your plan is shown.",
            "Choose **Manage plan**.",
            "Pick the plan you want, or the free plan.",
          ] },
          { type: "p", text: "If something about billing looks wrong, [contact us](/help#contact) and tell us what you see." },
        ],
      },
    ],
  },

  "alerts-and-saved-routes/save-a-route": {
    intro: "Save the route you check often and open it again without choosing everything twice.",
    sections: [
      {
        id: "how",
        heading: "How",
        blocks: [
          { type: "list", ordered: true, items: [
            "Compare a route on [Convert currencies](/prices).",
            "Save the pair and the amount.",
            "Find it again under **Saved routes** in the sidebar.",
          ] },
        ],
      },
    ],
  },

  "alerts-and-saved-routes/rate-alerts": {
    intro: "Tell Railor the rate you are waiting for and it emails you when the rate gets there.",
    sections: [
      {
        id: "how",
        heading: "Setting one up",
        blocks: [
          { type: "list", ordered: true, items: [
            "Save the route you care about.",
            "Open it in **Saved routes** and set the rate you want.",
            "Carry on with your day. Railor emails you when the rate reaches it.",
          ] },
          { type: "p", text: "How many alerts you can have depends on your plan. The [pricing page](/pricing) lists the limits." },
        ],
      },
    ],
  },

  "invoices-and-getting-paid/upload-an-invoice": {
    intro: "Drop in an invoice and Railor reads the details, so you don’t type them.",
    sections: [
      {
        id: "how",
        heading: "How it works",
        blocks: [
          { type: "list", ordered: true, items: [
            "Open the **Get paid** tool in your workspace and start a new invoice.",
            "Drop a PDF, PNG or JPEG (up to 4 MB) onto the hoop, or tap the paper.",
            "The first time, you are asked to allow Railor to read it with Google Gemini. Once you allow it on this device you aren’t asked again.",
            "Review every field Railor filled in. Nothing is saved until you confirm.",
            "Compare the ways to get paid for that invoice and choose one.",
          ] },
          { type: "callout", tone: "tip", title: "No file, no problem", text: "You can always type the details yourself. Reading a document is optional." },
        ],
      },
    ],
  },

  "invoices-and-getting-paid/match-the-money": {
    intro: "Once the money lands, Railor lines it up against what you expected and explains the difference.",
    sections: [
      {
        id: "how",
        heading: "What you see",
        blocks: [
          { type: "list", items: [
            "**Expected:** what the route you chose should have delivered.",
            "**Exchange-rate move:** shown separately, so a market move is never mistaken for a fee.",
            "**Named deductions:** charges you or Railor can point to, like a provider or bank fee.",
            "**Unexplained difference:** whatever is left.",
          ] },
          { type: "p", text: "To record what arrived, add the receipt or drop the bank statement or credit advice on the invoice." },
          { type: "p", text: "If money is unexplained, Railor can look for where it went. It reads the provider’s own pages, shows you the exact words it found and works out the amounts itself. You tap **Count it** to accept a charge." },
        ],
      },
    ],
  },

  "payroll/price-a-payroll-sheet": {
    intro: "Upload a sheet and Railor prices every payout: the cheapest way to pay each person.",
    sections: [
      {
        id: "how",
        heading: "How",
        blocks: [
          { type: "list", ordered: true, items: [
            "Open **Company**, then **Payroll pricing**.",
            "Drop a CSV or Excel (.xlsx) file onto the hoop, or tap the paper. One row per person: an amount, the currency they are paid in and their country if you have it.",
            "Choose the currency you pay from.",
            "Tap **Price payouts** and read the result. You can export it as a CSV.",
          ] },
          { type: "callout", tone: "tip", title: "Names stay in your browser", text: "Only amounts, currencies and countries are priced. The names never leave this browser." },
          { type: "p", text: "No sheet to hand? Tap **Use example sheet** to try it with fictional people." },
        ],
      },
    ],
  },

  "payroll/net-pay-or-send": {
    intro: "A payroll sheet holds either what you send or what each person receives. Tell Railor which.",
    sections: [
      {
        id: "toggle",
        heading: "The switch above the table",
        blocks: [
          { type: "list", items: [
            "**What I send:** the amounts are what you pay out. Railor shows what arrives.",
            "**What each person receives:** the amounts are net pay. Railor estimates the send amount at the mid-market rate, prices it and checks the result against the net pay.",
          ] },
          { type: "p", text: "Estimated send amounts are marked as estimates, because the exact amount to send depends on the provider’s price." },
        ],
      },
    ],
  },

  "developers/api-key": {
    intro: "Compare prices from your own code with one request.",
    sections: [
      {
        id: "how",
        heading: "Getting started",
        blocks: [
          { type: "list", ordered: true, items: [
            "Sign in and open **Developers**.",
            "Create a free API key.",
            "Send the route and amount to `POST /v1/prices` and read the ranked answer, with the source of each price.",
          ] },
          { type: "p", text: "The [API reference](/docs/api) has the full request and response, and the [SDKs](/docs/sdks) wrap it for TypeScript and Python." },
        ],
      },
    ],
  },

  "developers/ai-assistants": {
    intro: "Railor can answer inside your AI assistant, using the same prices.",
    sections: [
      {
        id: "how",
        heading: "Connect it",
        blocks: [
          { type: "p", text: "Railor has an MCP server that works with Claude, Cursor, Codex and other assistants that support MCP. [Set it up here](/docs/mcp)." },
          { type: "p", text: "Once connected, ask in plain words, for example the cheapest way to send a given amount between two countries, and the assistant uses Railor’s prices with their sources." },
        ],
      },
    ],
  },

  "privacy-and-security/your-documents": {
    intro: "Your files are read when you ask, and only what you review is kept.",
    sections: [
      {
        id: "documents",
        heading: "Invoices and receipts",
        blocks: [
          { type: "list", items: [
            "A document is read only after you allow it, using Google Gemini.",
            "You review every field before anything is saved.",
            "Railor saves the reviewed fields only and does not keep the file.",
          ] },
        ],
      },
      {
        id: "payroll",
        heading: "Payroll sheets",
        blocks: [
          { type: "p", text: "Names stay in your browser. Only amounts, currencies and countries are sent to be priced." },
        ],
      },
    ],
  },

  "privacy-and-security/report-a-problem": {
    intro: "If a price looks wrong or something doesn’t work, tell us what you saw and we will look.",
    sections: [
      {
        id: "send",
        heading: "What helps us most",
        blocks: [
          { type: "list", items: [
            "The route and the amount, for example 1,000 USD to INR.",
            "The provider and the price you saw.",
            "When you saw it, and a screenshot if you can.",
            "What you expected instead, and where you saw that.",
          ] },
          { type: "p", text: "Then [contact us](/help#contact) with those four things." },
        ],
      },
    ],
  },
};

export const helpContent = (topic: string, slug: string): HelpContent | undefined => HELP_CONTENT[`${topic}/${slug}`];
