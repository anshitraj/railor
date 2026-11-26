import { z } from "zod";
import type { PriceCheckInput, PriceRow } from "../pricing.js";

const calculator = "https://alansariexchange.com/send-money-to-india-from-the-uae/";
const endpoint = "https://alansariexchange.com/wp-admin/admin-ajax.php";
const feeSheet = "https://alansariexchange.com/wp-content/uploads/2019/10/Key-Fact-Statement-Remittance-0925-English.pdf";
const config = z.object({ ajax_url: z.literal(endpoint), ajax_nonce: z.string().regex(/^[a-z0-9]{10}$/i) });
const decimal = z.string().regex(/^\d+(\.\d+)?$/).transform(Number).pipe(z.number().finite().positive());
const reference = z.object({ status_msg: z.literal("SUCCESS"), amount: decimal, get_rate: decimal });

/** Verified Al Ansari UAE calculator currency & country codes from alansariexchange.com (2026-11-26). */
const AL_ANSARI_TARGETS: Record<string, { currency: string; cntcode: string; toccy: string; label: string; southAsiaFeeBand?: boolean }> = {
  IN: { currency: "INR", cntcode: "26", toccy: "26", label: "India", southAsiaFeeBand: true },
  PH: { currency: "PHP", cntcode: "49", toccy: "49", label: "Philippines" },
  PK: { currency: "PKR", cntcode: "27", toccy: "27", label: "Pakistan", southAsiaFeeBand: true },
  EG: { currency: "EGP", cntcode: "19", toccy: "19", label: "Egypt" },
  BD: { currency: "BDT", cntcode: "59", toccy: "59", label: "Bangladesh", southAsiaFeeBand: true },
  LK: { currency: "LKR", cntcode: "60", toccy: "60", label: "Sri Lanka", southAsiaFeeBand: true },
  NP: { currency: "NPR", cntcode: "98", toccy: "98", label: "Nepal", southAsiaFeeBand: true },
  US: { currency: "USD", cntcode: "92", toccy: "92", label: "the United States" },
  GB: { currency: "GBP", cntcode: "13", toccy: "13", label: "the United Kingdom" },
  AU: { currency: "AUD", cntcode: "41", toccy: "41", label: "Australia" },
  CA: { currency: "CAD", cntcode: "37", toccy: "37", label: "Canada" },
  CH: { currency: "CHF", cntcode: "33", toccy: "33", label: "Switzerland" },
  CN: { currency: "CNY", cntcode: "90", toccy: "90", label: "China" },
  DK: { currency: "DKK", cntcode: "50", toccy: "50", label: "Denmark" },
  ET: { currency: "ETB", cntcode: "71", toccy: "71", label: "Ethiopia" },
  BH: { currency: "BHD", cntcode: "23", toccy: "23", label: "Bahrain" },
  DE: { currency: "EUR", cntcode: "14", toccy: "75", label: "Germany" },
  FR: { currency: "EUR", cntcode: "15", toccy: "75", label: "France" },
  ES: { currency: "EUR", cntcode: "42", toccy: "75", label: "Spain" },
  IT: { currency: "EUR", cntcode: "32", toccy: "75", label: "Italy" },
  NL: { currency: "EUR", cntcode: "35", toccy: "75", label: "the Netherlands" },
  BE: { currency: "EUR", cntcode: "34", toccy: "75", label: "Belgium" },
  IE: { currency: "EUR", cntcode: "29", toccy: "75", label: "Ireland" },
  PT: { currency: "EUR", cntcode: "78", toccy: "75", label: "Portugal" },
  GH: { currency: "GHS", cntcode: "141", toccy: "141", label: "Ghana" },
  HK: { currency: "HKD", cntcode: "54", toccy: "54", label: "Hong Kong" },
  ID: { currency: "IDR", cntcode: "58", toccy: "58", label: "Indonesia" },
  JP: { currency: "JPY", cntcode: "40", toccy: "40", label: "Japan" },
  KE: { currency: "KES", cntcode: "62", toccy: "62", label: "Kenya" },
  KW: { currency: "KWD", cntcode: "22", toccy: "22", label: "Kuwait" },
  MA: { currency: "MAD", cntcode: "31", toccy: "31", label: "Morocco" },
  MY: { currency: "MYR", cntcode: "44", toccy: "44", label: "Malaysia" },
  NG: { currency: "NGN", cntcode: "88", toccy: "88", label: "Nigeria" },
  NO: { currency: "NOK", cntcode: "51", toccy: "51", label: "Norway" },
  NZ: { currency: "NZD", cntcode: "73", toccy: "73", label: "New Zealand" },
  OM: { currency: "OMR", cntcode: "21", toccy: "21", label: "Oman" },
  PL: { currency: "PLN", cntcode: "77", toccy: "77", label: "Poland" },
  QA: { currency: "QAR", cntcode: "24", toccy: "24", label: "Qatar" },
  RW: { currency: "RWF", cntcode: "204", toccy: "204", label: "Rwanda" },
  SA: { currency: "SAR", cntcode: "25", toccy: "25", label: "Saudi Arabia" },
  SE: { currency: "SEK", cntcode: "48", toccy: "48", label: "Sweden" },
  SG: { currency: "SGD", cntcode: "39", toccy: "39", label: "Singapore" },
  TH: { currency: "THB", cntcode: "38", toccy: "38", label: "Thailand" },
  TR: { currency: "TRY", cntcode: "36", toccy: "36", label: "Turkey" },
  UG: { currency: "UGX", cntcode: "84", toccy: "84", label: "Uganda" },
  VN: { currency: "VND", cntcode: "102", toccy: "102", label: "Vietnam" },
  ZA: { currency: "ZAR", cntcode: "72", toccy: "72", label: "South Africa" },
};

function resolveAlAnsariTarget(input: PriceCheckInput) {
  const context = input.context;
  if (input.sourceCurrency !== "AED" || context?.country !== "AE" || context.direction !== "send"
    || context.profile !== "personal" || context.purpose !== "personal") return null;
  if (context.paymentMethod && context.paymentMethod !== "local_bank" && context.paymentMethod !== "transfer_service") return null;
  const byCountry = input.destinationCountry ? AL_ANSARI_TARGETS[input.destinationCountry.toUpperCase()] : undefined;
  if (byCountry && byCountry.currency === input.destinationCurrency) return byCountry;
  const matches = Object.values(AL_ANSARI_TARGETS).filter((t) => t.currency === input.destinationCurrency);
  return matches.length === 1 ? matches[0]! : null;
}

export function hasAlAnsariPublicReference(input: PriceCheckInput): boolean {
  return resolveAlAnsariTarget(input) !== null;
}

/** Read the same anonymous bank-transfer estimate as the provider's UAE calculator. */
export async function alAnsariPublicReference(input: PriceCheckInput, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const target = resolveAlAnsariTarget(input);
  if (!target) return null;

  const signal = AbortSignal.timeout(5_000);
  const page = await fetcher(calculator, { signal, redirect: "error", cache: "no-store" });
  if (!page.ok) return null;
  const data = (await page.text()).match(/var CC_Ajax_Object\s*=\s*(\{[^}]+\})\s*;/)?.[1];
  if (!data) return null;
  const settings = config.safeParse(JSON.parse(data));
  if (!settings.success) return null;

  const body = new URLSearchParams({
    action: "convert_action", currfrom: "91", currto: target.toccy, cntcode: target.cntcode,
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
  // The calculator rounds the displayed FX rate to four decimals and rounds select local payouts (e.g. PKR/BDT/PHP) to local increments.
  const tolerance = Math.max(0.05, amount * 0.003);
  if (Math.abs(amount - input.amount * rate) > tolerance) return null;

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
    source: { label: `Al Ansari UAE-to-${target.label} public calculator`, url: calculator },
    missing: ["Exact transfer fee and VAT"],
    notes: [
      "The calculator shows indicative bank-transfer FX before service charges. The source time is when Railor checked it.",
      target.southAsiaFeeBand
        ? `The official fee sheet groups ${target.label} with South Asian destinations and lists AED 0–25.24 plus 5% VAT. Confirm the fee and final amount in the app or branch. ${feeSheet}`
        : `Confirm the service fee, 5% UAE VAT and any correspondent bank charges in the app or branch. ${feeSheet}`,
    ],
  };
}
