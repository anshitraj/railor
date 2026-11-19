import "server-only";
import { htmlToText, type PriceCheckInput } from "@railor/core";
import type { CapturedFee } from "./market-pricing-evidence";

const source = "https://www.icici.bank.in/nri-banking/money-transfer/money-transfer-rates";
const markets: Record<string, { country: string; label: string }> = {
  USD: { country: "US", label: "USA" }, AED: { country: "AE", label: "UAE" },
  CAD: { country: "CA", label: "Canada" }, SGD: { country: "SG", label: "Singapore" }, GBP: { country: "GB", label: "UK" },
};

export function readMoney2IndiaSheet(html: string, input: PriceCheckInput, now = new Date()): CapturedFee[] {
  const market = markets[input.sourceCurrency];
  if (!market) return [];
  const table = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].find(match => {
    const text = htmlToText(match[0]);
    return text.includes("Exchange Rate (INR)") && text.includes("Service Charges") && text.includes("USA");
  });
  if (!table || table.index === undefined) return [];
  const footnote = htmlToText(html.slice(table.index + table[0].length, table.index + table[0].length + 1_000));
  const asOf = footnote.match(/As on ([A-Za-z]+ \d{1,2}, \d{4}) at (\d{1,2}:\d{2} [AP]M) IST/i);
  const time = asOf ? Date.parse(`${asOf[1]} ${asOf[2]} GMT+0530`) : NaN;
  if (!asOf || !Number.isFinite(time) || time > now.getTime() || now.getTime() - time > 7 * 86_400_000) return [];

  const rows = [...table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(match => [...match[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => htmlToText(cell[1]!)));
  const rowIndex = rows.findIndex(cells => cells[0] === market.label);
  const [, rate, fee] = rows[rowIndex] ?? [];
  if (!rate || !/^\d+(?:\.\d+)?$/.test(rate) || !(Number(rate) > 0) || !fee) return [];
  const nextFee = input.sourceCurrency === "USD" && rows[rowIndex + 1]?.length === 1 ? rows[rowIndex + 1]?.[0] : null;
  return [{
    providerSlug: "icici-bank", product: "Money2India · dated rate and fee sheet",
    summary: `The sheet lists 1 ${input.sourceCurrency} = ${rate} INR as of ${asOf[1]}, ${asOf[2]} IST. ${[fee, nextFee].filter(Boolean).join(". ")}. Money2India shows the exact tier and payout in the sender’s account.`,
    destinationCurrency: "INR", observedAt: new Date(time).toISOString(), sourceUrl: source,
  }];
}

export async function money2IndiaEvidence(input: PriceCheckInput) {
  const market = markets[input.sourceCurrency];
  const context = input.context;
  if (!market || input.destinationCurrency !== "INR" || (input.destinationCountry && input.destinationCountry !== "IN")
    || context?.profile !== "personal" || context.purpose !== "personal"
    || (context.paymentMethod && !["local_bank", "transfer_service"].includes(context.paymentMethod))
    || context.country !== (context.direction === "send" ? market.country : "IN")) return [];
  const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(4_000), next: { revalidate: 900 } });
  return response.ok ? readMoney2IndiaSheet(await response.text(), input) : [];
}
