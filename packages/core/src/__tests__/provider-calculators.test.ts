import { describe, expect, it, vi } from "vitest";
import { CALCULATOR_PROVIDERS, calculatorGoal, calculatorProvider, calculatorQuoteRow, calculatorSlugsFor, calculatorSpec, readCalculator } from "../public-pricing/provider-calculators.js";
import type { PriceCheckInput } from "../pricing.js";

const input: PriceCheckInput = { sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000, includeMarket: true, context: { profile: "personal", country: "US", direction: "send", purpose: "personal" } };
const spec = calculatorSpec(input)!;
const now = new Date("2026-11-24T18:00:00Z");
const MID = 92.7;
const row = (slug: string, raw: unknown, reference: number | null = MID) => calculatorQuoteRow(calculatorProvider(slug)!, spec, raw, { reference, now });

/**
 * What each provider's own calculator showed for 1,000 USD to India on
 * 24 Nov 2026, read in a real browser. These are the shapes the checks have to
 * get right.
 */
const READ = {
  xe: { availability: true, send_amount: 1000, send_currency: "USD", fee: 0, total_to_pay: 1000, rate: 92.5614, recipient_gets: 92561.4, receive_currency: "INR", funding_method: "Direct Debit (ACH)", payout_method: "Bank account", shown_line: "Recipient gets 92,561.40 INR", promotional: false },
  paysend: { availability: true, send_amount: 1000, send_currency: "USD", fee: 4.72, total_to_pay: 1004.72, rate: 92.7153, recipient_gets: 92277.72, receive_currency: "INR", funding_method: "Card", payout_method: "Directly to bank accounts", shown_line: "92,277.72 INR", promotional: false },
  instarem: { availability: true, send_amount: 1000, send_currency: "USD", fee: 0, total_to_pay: 1000, rate: 92.7706, recipient_gets: 92770.6, receive_currency: "INR", funding_method: "ACH/Direct Debit", payout_method: "Bank", shown_line: "They receive 92,770.60 INR", promotional: false },
  worldRemit: { availability: true, send_amount: 1000, send_currency: "USD", fee: 0.99, total_to_pay: 1000.99, rate: 92.2478, recipient_gets: 92247.8, receive_currency: "INR", funding_method: "Bank transfer", payout_method: "Bank deposit", shown_line: "You send 1000.00 USD | 1 USD = 92.2478 INR | They get 92247.80 INR", promotional: false },
  ria: { availability: true, send_amount: 1000, send_currency: "USD", fee: 0, total_to_pay: 1000, rate: 93.6277, standard_rate: 92.64, promotional: true, recipient_gets: 93627.7, receive_currency: "INR", funding_method: "Debit card", payout_method: "Bank", shown_line: "1 USD = 92.64 93.6277 INR (promo rate) / 0 USD first transfer fee / They receive 93,627.70 INR" },
  westernUnion: { availability: true, send_amount: 1000, send_currency: "USD", fee: 0, total_to_pay: 1000, rate: 93.4909, standard_rate: 92.4429, promotional: true, recipient_gets: 93491, receive_currency: "INR", funding_method: "Bank account", payout_method: "Bank account", shown_line: "Recipient receives 93,491.00 INR" },
};

describe("a quote read from a provider's own calculator", () => {
  it.each([["xe", READ.xe], ["paysend", READ.paysend], ["instarem", READ.instarem], ["world-remit", READ.worldRemit]])("accepts %s: the figures add up and the rate is believable", (slug, raw) => {
    const result = row(slug, raw);
    expect(result.reject).toBeUndefined();
    expect(result.row).toMatchObject({ providerSlug: slug, basis: "live_public", recipientAmount: (raw as { recipient_gets: number }).recipient_gets, feeCurrency: "USD", observedAt: now.toISOString(), expiresAt: "2026-11-24T18:15:00.000Z" });
    expect(result.row?.publicOffer).toBeUndefined();
    expect(result.row?.source.url).toContain(calculatorProvider(slug)!.domain);
    expect(result.row?.notes[0]).toContain("Read from");
  });

  it("accepts a fee taken out of the amount sent (Paysend) as well as a fee added on top (WorldRemit)", () => {
    expect(row("paysend", READ.paysend).row?.feeAmount).toBe(4.72);
    expect(row("world-remit", READ.worldRemit).row?.feeAmount).toBe(0.99);
  });

  it("marks a new-customer rate as an offer, with the standard rate beside it", () => {
    for (const [slug, raw] of [["ria", READ.ria], ["western-union", READ.westernUnion]] as const) {
      const result = row(slug, raw);
      expect(result.row?.publicOffer).toMatchObject({ kind: "first_transfer" });
      expect(result.row?.notes.join(" ")).toContain("new customer");
    }
    expect(row("ria", READ.ria).row?.notes.join(" ")).toContain("92.64");
  });

  it("throws away MoneyGram's illustrative rate instead of showing a number from years ago", () => {
    const stale = { availability: true, send_amount: 1000, send_currency: "USD", fee: 25, rate: 83.45, recipient_gets: 83450, receive_currency: "INR", funding_method: "Bank account", payout_method: "Bank deposit", shown_line: "Recipient Amount: ₹83,450 INR" };
    expect(row("moneygram", stale).reject).toMatch(/stale or illustrative/);
  });

  it("rejects a placeholder rate, a quote for another amount, and a line that doesn't show the amount", () => {
    expect(row("xe", { ...READ.xe, rate: 1 }).reject).toMatch(/don't add up/);
    expect(row("xe", { ...READ.xe, send_amount: 500 }).reject).toMatch(/isn't for the amount/);
    expect(row("xe", { ...READ.xe, shown_line: "Get a great rate today" }).reject).toMatch(/doesn't show the amount/);
    expect(row("xe", { ...READ.xe, receive_currency: "PHP" }).reject).toMatch(/not INR/);
    expect(row("xe", { ...READ.xe, fee: 400, recipient_gets: 92561.4 }).reject).toMatch(/implausibly large/);
  });

  it("rejects a rate above mid-market unless the page labels it as an offer", () => {
    expect(row("western-union", { ...READ.westernUnion, promotional: false, standard_rate: 0 }).reject).toMatch(/no offer shown/);
    expect(row("western-union", READ.westernUnion).row).toBeDefined();
  });

  it("passes the reason through when the calculator showed no quote, and never invents one", () => {
    expect(row("ria", { availability: false, error: "Unable to get rates. Please try again." }).reject).toBe("Unable to get rates. Please try again.");
    expect(row("ria", { availability: false }).reject).toMatch(/no quote without an account/);
    expect(row("ria", "not an object").reject).toMatch(/expected shape/);
    expect(row("ria", { availability: true }).reject).toMatch(/missing the rate/);
  });

  it("still validates the figures when no mid-market reference is available", () => {
    expect(row("xe", READ.xe, null).row).toBeDefined();
    expect(row("xe", { ...READ.xe, rate: 1 }, null).reject).toBeDefined();
  });
});

describe("which transfers a calculator can answer", () => {
  it("covers a US personal send to another country, nothing else", () => {
    expect(spec).toMatchObject({ destinationCountry: "IN", destinationCountryName: "India", destinationCurrency: "INR", amount: 1000 });
    expect(calculatorSlugsFor(input)).toEqual(["xe", "ria", "western-union", "paysend", "instarem", "world-remit"]);
    expect(calculatorSlugsFor({ ...input, sourceCurrency: "EUR" })).toEqual([]);
    expect(calculatorSlugsFor({ ...input, context: { ...input.context!, direction: "receive" } })).toEqual([]);
    expect(calculatorSlugsFor({ ...input, context: { ...input.context!, profile: "freelancer", purpose: "services" } })).toEqual([]);
    expect(calculatorSlugsFor({ ...input, context: { ...input.context!, paymentMethod: "card" } })).toEqual([]);
    expect(calculatorSpec({ ...input, destinationCurrency: "USD" })).toBeNull();
  });

  it("points each provider at a page on its own site, and tells the agent what to do and what never to do", () => {
    for (const provider of CALCULATOR_PROVIDERS) expect(new URL(provider.entry(spec)).hostname.endsWith(provider.domain)).toBe(true);
    const goal = calculatorGoal(calculatorProvider("xe")!, spec);
    expect(goal).toContain("Enter exactly 1000");
    expect(goal).toContain("India (INR)");
    expect(goal).toMatch(/Do not log in, sign up/);
    expect(goal).toMatch(/never calculate or guess/);
    expect(calculatorProvider("moneygram")?.warm).toBe(false);
  });
});

describe("running the browser agent", () => {
  const deps = (responses: Array<Response | (() => Response)>) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let index = 0;
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const next = responses[Math.min(index, responses.length - 1)]!;
      index += 1;
      return typeof next === "function" ? next() : next.clone();
    }) as unknown as typeof fetch;
    return { calls, deps: { apiKey: "key", fetcher, budgetMs: 60_000, pollMs: 1, now: () => now, sleep: async () => undefined } };
  };

  it("starts a run, waits for it, and returns a checked row", async () => {
    const { calls, deps: d } = deps([Response.json({ run_id: "run_1" }), Response.json({ run_id: "run_1", status: "RUNNING" }), Response.json({ run_id: "run_1", status: "COMPLETED", result: READ.xe })]);
    const result = await readCalculator("xe", input, MID, d);
    expect(result.row).toMatchObject({ providerSlug: "xe", recipientAmount: 92561.4 });
    expect(calls[0]!.url).toBe("https://agent.tinyfish.ai/v1/automation/run-async");
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body).toMatchObject({ url: "https://www.xe.com/send-money/", browser_profile: "stealth", output_schema: { required: ["availability"] } });
    expect(body.goal).toContain("Enter exactly 1000");
    expect((calls[0]!.init?.headers as Record<string, string>)["X-API-Key"]).toBe("key");
    expect(calls[1]!.url).toBe("https://agent.tinyfish.ai/v1/runs/run_1");
  });

  it("gives a reason, not a price, when the run fails or the agent's figures don't hold up", async () => {
    expect((await readCalculator("xe", input, MID, deps([Response.json({ run_id: "r" }), Response.json({ status: "FAILED" })]).deps)).reject).toMatch(/couldn't be read/);
    expect((await readCalculator("xe", input, MID, deps([Response.json({ run_id: "r" }), Response.json({ status: "COMPLETED", result: { ...READ.xe, rate: 1 } })]).deps)).reject).toMatch(/don't add up/);
    expect((await readCalculator("xe", input, MID, deps([new Response("no", { status: 402 })]).deps)).reject).toMatch(/answered 402/);
    expect((await readCalculator("not-a-provider", input, MID, deps([]).deps)).reject).toMatch(/no calculator/);
    expect((await readCalculator("xe", { ...input, sourceCurrency: "EUR" }, MID, deps([]).deps)).reject).toMatch(/no calculator/);
  });

  it("cancels a run that outlives its budget so it stops costing money", async () => {
    const { calls, deps: d } = deps([Response.json({ run_id: "run_9" }), Response.json({ status: "RUNNING" })]);
    let tick = 0;
    const result = await readCalculator("xe", input, MID, { ...d, budgetMs: 5, sleep: async () => { tick += 1; await new Promise((resolve) => setTimeout(resolve, 8)); } });
    expect(result.reject).toMatch(/took too long/);
    expect(calls.at(-1)!.url).toBe("https://agent.tinyfish.ai/v1/runs/run_9/cancel");
    expect(tick).toBeGreaterThan(0);
  });
});

/** What the agent returned with the production goal and schema on 25 Nov 2026: three clean, two flagged as offers, two that must not be shown. */
describe("the agent's real reports under the production goal", () => {
  const live = {
    xe: { availability: true, send_amount: 1000, send_currency: "USD", fee: 0, total_to_pay: 1000, rate: 92.6079, standard_rate: 0, promotional: false, recipient_gets: 92607.9, receive_currency: "INR", funding_method: "Direct Debit (ACH)", payout_method: "Bank Account", shown_line: "92,607.90 INR", error: "" },
    ria: { availability: false, send_amount: 1000, send_currency: "USD", fee: 0, total_to_pay: 1000, rate: 0, standard_rate: 0, promotional: false, recipient_gets: 0, receive_currency: "INR", funding_method: "debit_card", payout_method: "bank_deposit", shown_line: "", error: "Unable to get rates. Please try again." },
    westernUnion: { availability: true, send_amount: 1000, send_currency: "USD", fee: 0, total_to_pay: 1000, rate: 93.4909, standard_rate: 92.4429, promotional: true, recipient_gets: 93491, receive_currency: "INR", funding_method: "Bank account (ACH)", payout_method: "Bank account", shown_line: "Total to receiver 93,491.00 INR", error: "" },
    // The agent read a different amount (about 1,194 USD of rupees) than the rate implies.
    paysend: { availability: true, send_amount: 1000, send_currency: "USD", fee: 1.96, total_to_pay: 1000, rate: 92.7153, standard_rate: 0, promotional: false, recipient_gets: 110733.64, receive_currency: "INR", funding_method: "Credit/debit card", payout_method: "Bank account (UPI or direct deposit)", shown_line: "110,733.64 INR", error: "" },
    instarem: { availability: true, send_amount: 1000, send_currency: "USD", fee: 0, total_to_pay: 1000, rate: 92.7706, standard_rate: 92.2689, promotional: true, recipient_gets: 92770.6, receive_currency: "INR", funding_method: "ACH/Direct Debit", payout_method: "Bank Account", shown_line: "They receive 92,770.60 INR", error: "" },
    worldRemit: { availability: true, send_amount: 1000, send_currency: "USD", fee: 0.99, total_to_pay: 1000.99, rate: 92.2478, standard_rate: 0, promotional: true, recipient_gets: 92248, receive_currency: "INR", funding_method: "Bank Transfer", payout_method: "Bank Transfer", shown_line: "You send 1000 USD / They get 92248 INR / 1 USD = 92.2478 INR / Fee 0.99 USD / First-Transfer Enhanced FX Rate: Select country corridors and delivery methods only.", error: "" },
  };

  it("shows the prices that check out, as offers where the page says so", () => {
    expect(row("xe", live.xe).row).toMatchObject({ recipientAmount: 92607.9, product: { label: "Xe · Direct Debit (ACH) to Bank Account" } });
    expect(row("xe", live.xe).row?.publicOffer).toBeUndefined();
    for (const [slug, raw] of [["western-union", live.westernUnion], ["instarem", live.instarem], ["world-remit", live.worldRemit]] as const) {
      expect(row(slug, raw).row?.publicOffer, slug).toMatchObject({ kind: "first_transfer" });
    }
  });

  it("gives the reason when a calculator errors, and refuses a figure that doesn't match the rate", () => {
    expect(row("ria", live.ria).reject).toBe("Unable to get rates. Please try again.");
    expect(row("paysend", live.paysend).reject).toMatch(/don't add up/);
  });
});
