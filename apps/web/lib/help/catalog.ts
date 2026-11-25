/**
 * The Help centre: topics and the articles in them. This is the part menus,
 * cards and search need; the article text lives in `content.ts` so the search
 * box never ships whole articles to the browser.
 */

export type HelpIcon = "compare" | "send" | "account" | "alerts" | "invoices" | "payroll" | "developers" | "privacy";

export interface HelpTopic {
  slug: string;
  title: string;
  blurb: string;
  icon: HelpIcon;
}

export interface HelpArticleMeta {
  slug: string;
  topic: string;
  title: string;
  /** One sentence, used on cards and in search results. */
  summary: string;
  /** Words people type that the title doesn't contain. */
  keywords: readonly string[];
  /** Shown first when the search box is empty. */
  popular?: boolean;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  { slug: "comparing-prices", title: "Comparing prices", blurb: "Reading the results, what each label means and where prices come from.", icon: "compare" },
  { slug: "sending-money", title: "Sending money", blurb: "Choosing a provider, and what to do when one is missing.", icon: "send" },
  { slug: "account-and-plans", title: "Your account and plans", blurb: "Signing up, what is free and what a plan adds.", icon: "account" },
  { slug: "alerts-and-saved-routes", title: "Saved routes and alerts", blurb: "Save a route and get an email when the rate moves.", icon: "alerts" },
  { slug: "invoices-and-getting-paid", title: "Invoices and getting paid", blurb: "Upload an invoice, compare ways to get paid and match the money that arrives.", icon: "invoices" },
  { slug: "payroll", title: "Payroll pricing", blurb: "Price every payout in a payroll sheet.", icon: "payroll" },
  { slug: "developers", title: "Developers and AI tools", blurb: "The API, the SDKs and Railor inside your AI assistant.", icon: "developers" },
  { slug: "privacy-and-security", title: "Privacy and security", blurb: "What happens to your documents and your data.", icon: "privacy" },
];

export const HELP_ARTICLES: readonly HelpArticleMeta[] = [
  { slug: "how-to-compare", topic: "comparing-prices", title: "How to compare what arrives", summary: "Pick the countries and the amount, and read the list from the top.", keywords: ["convert", "calculator", "compare", "best rate", "cheapest"], popular: true },
  { slug: "price-labels", topic: "comparing-prices", title: "What the price labels mean", summary: "Account quote, published estimate, market reference, first-transfer offer and dated estimate explained.", keywords: ["offer", "estimate", "reference", "label", "quote"], popular: true },
  { slug: "why-prices-differ", topic: "comparing-prices", title: "Why a price here differs from the provider’s site", summary: "Rates move, offers are for new customers and the way you pay changes the price.", keywords: ["different", "wrong", "mismatch", "not the same", "rate changed"], popular: true },
  { slug: "where-prices-come-from", topic: "comparing-prices", title: "Where Railor’s prices come from", summary: "Provider calculators and published fees, each dated, never forums or AI answers.", keywords: ["source", "data", "accurate", "trust", "live"] },
  { slug: "provider-not-listed", topic: "sending-money", title: "Why a provider isn’t listed for me", summary: "Railor hides services that can’t serve your profile and tells you why.", keywords: ["missing", "hidden", "not showing", "eligible", "profile", "revolut"], popular: true },
  { slug: "after-you-choose", topic: "sending-money", title: "What to do after you choose a provider", summary: "Continue on the provider’s own site and check the final amount before you pay.", keywords: ["next step", "go to provider", "send", "pay"] },
  { slug: "new-to-sending-money", topic: "sending-money", title: "New to sending money abroad?", summary: "Start with the guides: how it works, what it really costs and which bank details you need.", keywords: ["guide", "beginner", "how to", "first time"] },
  { slug: "free-account", topic: "account-and-plans", title: "Creating a free account", summary: "Comparing prices is free; an account saves your routes and unlocks the workspace.", keywords: ["sign up", "register", "log in", "login", "free"], popular: true },
  { slug: "plans", title: "What a plan adds", topic: "account-and-plans", summary: "Rate alerts, saved transfers, route monitoring and more API volume.", keywords: ["upgrade", "pricing", "plus", "pro", "business", "subscription"] },
  { slug: "change-plan", topic: "account-and-plans", title: "Changing or ending your plan", summary: "Open Manage plan from the sidebar, or write to us.", keywords: ["cancel", "downgrade", "billing", "refund"] },
  { slug: "save-a-route", topic: "alerts-and-saved-routes", title: "Saving a route", summary: "Keep a pair and amount you check often and reopen it in one tap.", keywords: ["bookmark", "favourite", "saved"] },
  { slug: "rate-alerts", topic: "alerts-and-saved-routes", title: "Getting a rate alert by email", summary: "Set the rate you are waiting for and Railor emails you when it is reached.", keywords: ["email", "notify", "reminder", "target rate", "watch"], popular: true },
  { slug: "upload-an-invoice", topic: "invoices-and-getting-paid", title: "Uploading an invoice", summary: "Drop in a PDF or image, review the fields Railor reads and compare ways to get paid.", keywords: ["pdf", "freelancer", "client", "extract", "read"], popular: true },
  { slug: "match-the-money", topic: "invoices-and-getting-paid", title: "Matching the money that arrived", summary: "Expected, actual, explained deductions and any unexplained difference.", keywords: ["receipt", "credit", "short", "missing money", "deduction", "unexplained", "fx"] },
  { slug: "price-a-payroll-sheet", topic: "payroll", title: "Pricing a payroll sheet", summary: "Upload a CSV or Excel sheet and see the cheapest way to pay each person.", keywords: ["csv", "excel", "xlsx", "employees", "payouts", "salary"] },
  { slug: "net-pay-or-send", topic: "payroll", title: "Net pay or what you send?", summary: "Tell Railor which your sheet contains and it prices the other.", keywords: ["net pay", "send amount", "estimate", "mid-market"] },
  { slug: "api-key", topic: "developers", title: "Getting a free API key", summary: "Compare prices from your own code with one request.", keywords: ["api", "key", "rest", "sdk", "token"] },
  { slug: "ai-assistants", topic: "developers", title: "Using Railor from an AI assistant", summary: "Connect Railor to Claude, Cursor or Codex through MCP.", keywords: ["mcp", "claude", "cursor", "codex", "agent"] },
  { slug: "your-documents", topic: "privacy-and-security", title: "What happens to your documents", summary: "Files are read when you ask, fields are saved only after you review them.", keywords: ["privacy", "delete", "stored", "gemini", "ai", "file"], popular: true },
  { slug: "report-a-problem", topic: "privacy-and-security", title: "Reporting a wrong price or a problem", summary: "Tell us the route, the amount and what you saw.", keywords: ["bug", "error", "report", "incorrect", "contact", "support"] },
];

export const helpTopic = (slug: string) => HELP_TOPICS.find((topic) => topic.slug === slug);
export const helpArticle = (topic: string, slug: string) => HELP_ARTICLES.find((article) => article.topic === topic && article.slug === slug);
export const articlesIn = (topic: string) => HELP_ARTICLES.filter((article) => article.topic === topic);
export const helpHref = (article: Pick<HelpArticleMeta, "topic" | "slug">) => `/help/${article.topic}/${article.slug}`;

/**
 * Articles that match what someone typed, best first. Every word has to match
 * somewhere; a title match counts for the most, then the keywords, then the
 * summary.
 */
export function searchHelp(query: string, limit = 6): HelpArticleMeta[] {
  const words = query.toLowerCase().split(/[^a-z0-9’']+/).filter((word) => word.length > 1);
  if (!words.length) return [];
  return HELP_ARTICLES
    .map((article) => {
      const title = article.title.toLowerCase();
      const keywords = article.keywords.join(" ").toLowerCase();
      const summary = article.summary.toLowerCase();
      let score = 0;
      for (const word of words) {
        const here = (title.includes(word) ? 6 : 0) + (keywords.includes(word) ? 4 : 0) + (summary.includes(word) ? 2 : 0);
        if (!here) return { article, score: 0 };
        score += here;
      }
      return { article, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.article);
}
