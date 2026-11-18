import { z } from "zod";
import type { PriceCheckInput, PriceRow } from "../pricing.js";

const calculator = "https://alansariexchange.com/send-money-to-india-from-the-uae/";
const endpoint = "https://alansariexchange.com/wp-admin/admin-ajax.php";
const feeSheet = "https://alansariexchange.com/wp-content/uploads/2019/10/Key-Fact-Statement-Remittance-0925-English.pdf";
const config = z.object({ ajax_url: z.literal(endpoint), ajax_nonce: z.string().regex(/^[a-z0-9]{10}$/i) });
const decimal = z.string().regex(/^\d+(\.\d+)?$/).transform(Number).pipe(z.number().finite().positive());
const reference = z.object({ status_msg: z.literal("SUCCESS"), amount: decimal, get_rate: decimal });

export function hasAlAnsariPublicReference(input: PriceCheckInput): boolean {
  const context = input.context;
  return input.sourceCurrency === "AED" && input.destinationCurrency === "INR" && input.destinationCountry === "IN"
    && context?.country === "AE" && context.direction === "send" && context.profile === "personal" && context.purpose === "personal"
    && (!context.paymentMethod || context.paymentMethod === "local_bank" || context.paymentMethod === "transfer_service");
}

/** Read the same anonymous bank-transfer estimate as the provider's UAE calculator. */
export async function alAnsariPublicReference(input: PriceCheckInput, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  if (!hasAlAnsariPublicReference(input)) return null;

  const signal = AbortSignal.timeout(5_000);
  const page = await fetcher(calculator, { signal, redirect: "error", cache: "no-store" });
  if (!page.ok) return null;
  const data = (await page.text()).match(/var CC_Ajax_Object\s*=\s*(\{[^}]+\})\s*;/)?.[1];
  if (!data) return null;
  const settings = config.safeParse(JSON.parse(data));
  if (!settings.success) return null;

  const body = new URLSearchParams({
    action: "convert_action", currfrom: "91", currto: "26", cntcode: "26",
    trtype: "BT", amt: String(input.amount), security: settings.data.ajax_nonce,
  });
  const response = await fetcher(endpoint, {
    method: "POST", signal, body, redirect: "error", cache: "no-store",
    headers: { Accept: "application/json", Referer: calculator, "X-Requested-With": "XMLHttpRequest" },
  });
  if (!response.ok) return null;
  const result = reference.safeParse(await response.json());
  if (!result.success) return null;
  const { amount, get_rate: rate } = result.data;
  // The calculator rounds the displayed FX rate to four decimals; the amount can use more precision.
  if (Math.abs(amount - input.amount * rate) > .03 + input.amount * .0001) return null;

  return {
    providerSlug: "al-ansari-exchange",
    providerName: "Al Ansari Exchange",
    product: { id: "al-ansari-exchange:uae-public-fx", label: "UAE bank transfer · FX reference" },
    basis: "live_public",
    recipientAmount: Math.round(amount * 100) / 100,
    feeAmount: null,
    feeCurrency: null,
    rate,
    totalCostPct: null,
    partial: true,
    side: "payer",
    delivery: null,
    observedAt: now.toISOString(),
    source: { label: "Al Ansari UAE-to-India public calculator", url: calculator },
    missing: ["Exact transfer fee and VAT"],
    notes: [
      "The calculator shows indicative bank-transfer FX before service charges. The source time is when Railor checked it.",
      `The official fee sheet groups India with four other destinations and lists AED 0–25.24 plus 5% VAT. Confirm the fee and final amount in the app or branch. ${feeSheet}`,
    ],
  };
}
