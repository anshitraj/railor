import type { MarketCoverageProvider, PriceRow } from "@railor/core";
import { priceStatus, providerIdentity, type PriceStatusKind } from "./price-display";

/**
 * "Ways to send": the providers found for a pair, grouped by how the money
 * moves (an app, cash at an agent, a broker, a bank…), each group with a plain
 * explanation, the best price in it today, and the rules for this corridor
 * that change the choice, each with its official source. Client-safe.
 */

export type SendMethod = "app" | "online" | "cash" | "broker" | "bank" | "multi" | "get_paid";

export interface MethodInfo {
  id: SendMethod;
  label: string;
  /** A few words under the label: who the method is for. */
  hint: string;
  /** Two or three plain sentences; true for every corridor. */
  about: string;
}

export const SEND_METHODS: MethodInfo[] = [
  { id: "app", label: "Money transfer apps", hint: "For regular transfers", about: "Send from your phone or browser to a bank account, UPI or a mobile wallet. For everyday amounts these are usually the cheapest and quickest. You verify your identity once, on your first transfer." },
  { id: "online", label: "Online transfer services", hint: "Bank-funded, near mid-market", about: "Pay from your bank account and the service converts close to the mid-market rate, charging a visible fee. Good for medium and larger amounts when you can wait for a bank payment to clear." },
  { id: "cash", label: "Cash & in-person", hint: "Without a bank account", about: "Pay or collect cash at an agent location. Useful when the sender or the recipient has no bank account, but it usually costs more than paying online, and the recipient needs ID to collect." },
  { id: "broker", label: "Currency brokers", hint: "For large amounts", about: "For large one-off transfers such as a property, tuition or a move abroad. Brokers often waive their fee, can fix a rate for a future date and give you a dealer to talk to. Minimum amounts usually apply." },
  { id: "bank", label: "Banks", hint: "Only if you bank there", about: "Send from the account you already have, with nothing new to sign up for. The exchange rate usually carries a wider margin than specialist services, and the receiving bank can deduct its own charge." },
  { id: "multi", label: "Multi-currency accounts", hint: "Hold and spend currencies", about: "Keep balances in several currencies, convert when the rate suits you and send from the balance. Handy if you are paid in one currency and spend in another." },
  { id: "get_paid", label: "Get paid from abroad", hint: "Freelancers and exporters", about: "Accounts that collect payments from clients abroad and pay out in your currency, usually with the export paperwork your accountant needs. Priced for the person receiving, not the payer." },
];

/** How each provider moves money. A provider can be more than one kind (Remitly is an app with cash pickup). */
const PROVIDER_METHODS: Record<string, SendMethod[]> = {
  remitly: ["app", "cash"], xoom: ["app", "cash"], "world-remit": ["app", "cash"], worldremit: ["app", "cash"], "taptap-send": ["app"], aspora: ["app"],
  sendwave: ["app"], "atlantic-money": ["online"], wise: ["online", "multi"], instarem: ["online"], revolut: ["multi", "app"], paypal: ["online"],
  dashx: ["app"], "western-union": ["cash", "app"], moneygram: ["cash", "app"], ria: ["cash", "app"], "al-ansari-exchange": ["cash", "app"], "lulu-exchange": ["cash", "app"],
  ofx: ["broker"], xe: ["broker", "online"], "currencies-direct": ["broker"], torfx: ["broker"],
  airwallex: ["multi", "get_paid"], payoneer: ["get_paid", "multi"], skydo: ["get_paid"], payzoll: ["get_paid"], xflow: ["get_paid"], razorpay: ["get_paid"],
  payglocal: ["get_paid"], briskpe: ["get_paid"], infinity: ["get_paid"], winvesta: ["get_paid"], salt: ["get_paid"], mulya: ["get_paid"], refrens: ["get_paid"],
  karbon: ["get_paid"], cashfree: ["get_paid"], pingpong: ["get_paid"],
};
const BANK_NAME = /\b(bank|banco|banque|chase|wells fargo|citi(bank)?|hsbc|barclays|lloyds|natwest|santander|bnp|deutsche|icici|hdfc|axis|kotak|sbi|scotiabank|bmo|cibc|emirates nbd)\b/i;

export function methodsFor(slug: string, name: string): SendMethod[] {
  const known = PROVIDER_METHODS[providerIdentity(slug)];
  if (known) return known;
  return BANK_NAME.test(name) ? ["bank"] : [];
}

export interface CorridorRule {
  method: SendMethod;
  text: string;
  source: { label: string; url: string };
}

/** Rules that change the choice on this corridor, each from an official source. */
export function corridorRules(from: string, to: string): CorridorRule[] {
  const rules: CorridorRule[] = [];
  if (from === "USD") rules.push({
    method: "cash",
    text: "Since 1 January 2026, a transfer from the US paid with cash, a money order or a cashier’s check carries a 1% federal tax. Paying from a bank account or with a card avoids it.",
    source: { label: "IRS: remittance transfer tax", url: "https://www.irs.gov/newsroom/treasury-irs-issue-proposed-regulations-on-the-new-remittance-transfer-tax-established-under-the-one-big-beautiful-bill" },
  });
  if (to === "INR") rules.push({
    method: "cash",
    text: "Cash pickup in India runs under the RBI’s Money Transfer Service Scheme: up to USD 2,500 per transfer, and only up to ₹50,000 can be paid out in cash. Anything more is paid into a bank account.",
    source: { label: "RBI Master Direction: Money Transfer Service Scheme", url: "https://rbi.org.in/SCRIPTs/BS_ViewMasDirections.aspx?id=10868" },
  });
  return rules;
}

export interface WayProvider {
  slug: string;
  name: string;
  logoUrl?: string;
  recipientAmount: number | null;
  status: PriceStatusKind | null;
  statusLabel: string | null;
}

export interface WayGroup extends MethodInfo {
  providers: WayProvider[];
  /** The most that arrives in this group, preferring prices that are comparable or a labelled offer. */
  best: WayProvider | null;
  rules: CorridorRule[];
}

const firmness = (provider: WayProvider) => provider.status === "comparable" || provider.status === "offer" ? 2 : provider.status === "confirm" ? 1 : 0;

/** Groups the pair's priced rows and its other known providers by how the money moves. Empty groups are left out. */
export function waysToSend(input: { rows: PriceRow[]; candidates?: MarketCoverageProvider[]; from: string; to: string; receiving?: boolean }): WayGroup[] {
  const byMethod = new Map<SendMethod, Map<string, WayProvider>>();
  const add = (method: SendMethod, provider: WayProvider) => {
    const group = byMethod.get(method) ?? new Map<string, WayProvider>();
    const key = providerIdentity(provider.slug);
    const existing = group.get(key);
    // One entry per provider: a firm price beats an estimate; between equals, the one where more arrives.
    if (!existing || firmness(provider) > firmness(existing) || (firmness(provider) === firmness(existing) && (provider.recipientAmount ?? -1) > (existing.recipientAmount ?? -1))) group.set(key, provider);
    byMethod.set(method, group);
  };
  for (const row of input.rows) {
    if (row.profileAssessment?.status === "not_supported") continue;
    const name = row.providerName.split(" · ")[0] ?? row.providerName;
    const status = row.recipientAmount !== null ? priceStatus(row) : null;
    const provider: WayProvider = { slug: providerIdentity(row.providerSlug), name, logoUrl: row.logoUrl, recipientAmount: row.recipientAmount, status: status?.kind ?? null, statusLabel: status?.label ?? null };
    for (const method of methodsFor(row.providerSlug, name)) add(method, provider);
  }
  for (const candidate of input.candidates ?? []) {
    const provider: WayProvider = { slug: providerIdentity(candidate.providerSlug), name: candidate.providerName, recipientAmount: null, status: null, statusLabel: null };
    for (const method of methodsFor(candidate.providerSlug, candidate.providerName)) add(method, provider);
  }
  const rules = corridorRules(input.from, input.to);
  return SEND_METHODS.flatMap((method) => {
    const providers = [...(byMethod.get(method.id)?.values() ?? [])].sort((a, b) => (b.recipientAmount ?? -1) - (a.recipientAmount ?? -1) || a.name.localeCompare(b.name));
    // Accounts for getting paid by clients don't help a personal sender.
    if (!providers.length || (method.id === "get_paid" && input.receiving === false)) return [];
    const priced = providers.filter((provider) => provider.recipientAmount !== null);
    const firm = priced.filter((provider) => provider.status === "comparable" || provider.status === "offer");
    return [{ ...method, providers, best: firm[0] ?? priced[0] ?? null, rules: rules.filter((rule) => rule.method === method.id) }];
  });
}
