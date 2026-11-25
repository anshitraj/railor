import "server-only";
import type { PriceCheckInput, PriceRow } from "@railor/core";
import { usBankRemittanceCorridor } from "@railor/core";
import { z } from "zod";
import { consumeLimit } from "./rate-limit";

const sourceUrl = "https://www.riamoneytransfer.com/en-us/send-money-to-india/";
const promoTerms = "https://app3.riamoneytransfer.com/en-us/promo/";
const promoEnds = Date.parse("2027-01-01T00:00:00Z");
const quoteLifetime = 3 * 60_000;
const capture = z.object({
  url: z.literal(sourceUrl),
  amount: z.string(),
  payout: z.string(),
  rate: z.string(),
  totals: z.string().max(2000),
});

const decimal = "(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]+)?";
const numberValue = (value: string) => new RegExp(`^${decimal}$`).test(value) ? Number(value.replaceAll(",", "")) : NaN;

export function parseRiaCalculator(data: unknown, input: PriceCheckInput, checkedAt: Date): PriceRow | null {
  const parsed = capture.safeParse(data);
  if (!parsed.success || usBankRemittanceCorridor(input) !== "INR" || input.amount < 50 || input.amount > 49_999
    || !(checkedAt.getTime() < promoEnds)) return null;
  const { amount, payout, rate: displayedRate, totals } = parsed.data;
  const total = totals.match(new RegExp(`^Total to pay\\s*(${decimal}) USD$`, "m"))?.[1];
  const rateValue = displayedRate.match(/^(\d+\.\d{2,8}) INR$/)?.[1];
  const recipient = numberValue(payout);
  if (numberValue(amount) !== input.amount || !total || numberValue(total) !== input.amount || !rateValue
    || !Number.isFinite(recipient) || recipient <= 0
    || !/^Payment method\s*Bank$/m.test(totals) || !/^Delivery method\s*Bank$/m.test(totals)
    || !/^Your first transfer has a promo rate!/m.test(totals)
    || !/^Fee\s*(?:\d+\.\d{2})?\s*0 USD first transfer fee$/m.test(totals)
    || !/^USD$/m.test(totals) || !/^INR$/m.test(totals)) return null;

  const precision = rateValue.split(".")[1]!.length;
  const rate = Number(rateValue);
  // Verify that the calculator has finished updating the payout for this amount.
  if (Math.abs(recipient - rate * input.amount) > 0.01 + input.amount * 0.5 * 10 ** -precision) return null;
  const expiresAt = new Date(Math.min(checkedAt.getTime() + quoteLifetime, promoEnds)).toISOString();
  return {
    providerSlug: "ria", providerName: "Ria Money Transfer", basis: "live_public", side: "payer", senderCountry: "US",
    recipientAmount: recipient, feeAmount: 0, feeCurrency: "USD", rate, totalCostPct: null,
    partial: true, costComplete: false, delivery: null,
    paymentMethods: ["local_bank", "transfer_service"],
    product: { id: "ria:us-bank-inr", label: "Ria · US bank to Indian bank" },
    publicOffer: { kind: "first_transfer", fundingMethod: "US bank account", payoutMethod: "Bank deposit", displayUntil: expiresAt },
    source: { label: "Ria public transfer calculator", url: sourceUrl },
    observedAt: checkedAt.toISOString(), expiresAt,
    notes: [
      `Requires eligibility for Ria's HELLORIA first-transfer offer. Terms: ${promoTerms}`,
    ],
  };
}

export async function readRiaCalculator(input: PriceCheckInput): Promise<PriceRow | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey || usBankRemittanceCorridor(input) !== "INR" || !Number.isFinite(input.amount)
    || input.amount < 50 || input.amount > 49_999 || Date.now() >= promoEnds) return null;
  if (!await consumeLimit("provider-quote-browser", "ria", 24, 3_600_000)) return null;

  // These actions only operate the public calculator. The final capture checks
  // the page URL, both methods and the amount again after React updates the result.
  const actions = [
    { type: "wait", milliseconds: 1200 },
    { type: "executeJavascript", script: `
      const labels = Array.from(document.querySelectorAll('#quote-details ~ div span'));
      const payment = labels.find(label => label.textContent.trim() === 'Payment method'
        && label.nextElementSibling?.matches('button[aria-haspopup=dialog]'));
      payment?.nextElementSibling.click();
    ` },
    { type: "wait", milliseconds: 300 },
    { type: "executeJavascript", script: `
      const options = Array.from(document.querySelectorAll('[role=dialog][data-state=open] button[role=option]'));
      options.find(option => option.textContent.trim() === 'Bank')?.click();
    ` },
    { type: "wait", milliseconds: 450 },
    { type: "executeJavascript", script: `
      const amount = document.querySelector('#amount-from');
      if (amount) {
        amount.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(amount, ${JSON.stringify(String(input.amount))});
        amount.dispatchEvent(new InputEvent('input', { bubbles: true }));
        amount.blur();
      }
    ` },
    { type: "wait", milliseconds: 2200 },
    { type: "executeJavascript", script: `
      (() => ({
        url: location.href,
        amount: document.querySelector('#amount-from')?.value,
        payout: document.querySelector('#amount-to')?.value,
        rate: document.querySelector('#rate-title + div > span:last-child')?.textContent?.trim(),
        totals: document.querySelector('#quote-details')?.parentElement?.innerText?.slice(0, 1800),
      }))()
    ` },
  ];
  try {
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(32_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: sourceUrl, formats: ["markdown"], maxAge: 0, timeout: 28_000, actions }),
    });
    if (!response.ok) return null;
    const payload = z.object({
      success: z.literal(true),
      data: z.object({ actions: z.object({ javascriptReturns: z.array(z.object({ value: z.unknown() })) }) }),
    }).safeParse(await response.json());
    return payload.success ? parseRiaCalculator(payload.data.data.actions.javascriptReturns.at(-1)?.value, input, new Date()) : null;
  } catch {
    return null;
  }
}
