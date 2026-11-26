/**
 * Official websites for providers people can act on from a price check, so
 * "Go to provider" is a working link rather than a disabled button. Client-safe
 * (no server imports); keep entries to each provider's own homepage.
 */
const SITES: Record<string, string> = {
  wise: "https://wise.com",
  xe: "https://www.xe.com",
  remitly: "https://www.remitly.com",
  xoom: "https://www.xoom.com",
  revolut: "https://www.revolut.com",
  skydo: "https://www.skydo.com",
  payzoll: "https://payzoll.finance",
  airwallex: "https://www.airwallex.com",
  xflow: "https://www.xflowpay.com",
  razorpay: "https://razorpay.com",
  infinity: "https://www.infinityapp.in",
  mulya: "https://www.mulya.co",
  winvesta: "https://www.winvesta.in",
  payglocal: "https://payglocal.in",
  dashx: "https://dashx.xyz",
  refrens: "https://www.refrens.com",
  salt: "https://www.salt.pe",
  cashfree: "https://www.cashfree.com",
  pingpong: "https://in.pingpongx.com",
  karbon: "https://www.karboncard.com",
  briskpe: "https://www.briskpe.com",
  "atlantic-money": "https://www.atlanticmoney.com",
  aspora: "https://www.aspora.com",
  "taptap-send": "https://www.taptapsend.com",
  "western-union": "https://www.westernunion.com",
  "world-remit": "https://www.worldremit.com",
  worldremit: "https://www.worldremit.com",
  instarem: "https://www.instarem.com",
  ofx: "https://www.ofx.com",
  payoneer: "https://www.payoneer.com",
  paypal: "https://www.paypal.com",
  "moneygram": "https://www.moneygram.com",
  "al-ansari-exchange": "https://alansariexchange.com",
  "lulu-exchange": "https://luluexchange.com",
  dlocal: "https://www.dlocal.com",
  circle: "https://www.circle.com",
  bridge: "https://www.bridge.xyz",
};

/** The provider's own site for a price row slug (market-feed rows carry a "market:" prefix). */
export function providerSite(slug: string): string | null {
  const key = slug.replace(/^market:/, "").toLowerCase();
  return SITES[key] ?? null;
}

export interface ProviderLink {
  href: string;
  /** What the link carries over: the amount and pair, the corridor only, or nothing (the homepage). */
  carries: "amount" | "corridor" | "home";
}

/**
 * The most specific page of a provider's own site for this transfer. Only
 * formats checked against the live site are used: Wise's converter takes the
 * pair and amount; Remitly's and Xoom's US-to-India pages take the corridor.
 * Everything else opens the homepage, and the hand-off card carries the setup.
 */
export function providerLink(slug: string, transfer: { from: string; to: string; amount: number }): ProviderLink | null {
  const key = slug.replace(/^market:/, "").toLowerCase();
  const home = SITES[key];
  if (!home) return null;
  const from = transfer.from.toUpperCase();
  const to = transfer.to.toUpperCase();
  const amount = Number.isFinite(transfer.amount) && transfer.amount > 0 ? Math.round(transfer.amount * 100) / 100 : null;
  if (key === "wise" && /^[A-Z]{3}$/.test(from) && /^[A-Z]{3}$/.test(to)) {
    const page = `https://wise.com/gb/currency-converter/${from.toLowerCase()}-to-${to.toLowerCase()}-rate`;
    return amount ? { href: `${page}?amount=${amount}`, carries: "amount" } : { href: page, carries: "corridor" };
  }
  // Xe's converter reads Amount, From and To from the address (checked against the live page: "1,000 USD to EUR").
  if (key === "xe" && amount && /^[A-Z]{3}$/.test(from) && /^[A-Z]{3}$/.test(to)) {
    return { href: `https://www.xe.com/currencyconverter/convert/?Amount=${amount}&From=${from}&To=${to}`, carries: "amount" };
  }
  if (from === "USD" && to === "INR") {
    if (key === "remitly") return { href: "https://www.remitly.com/us/en/money-transfer/send-money-to-india", carries: "corridor" };
    if (key === "xoom") return { href: "https://www.xoom.com/india/send-money", carries: "corridor" };
  }
  return { href: home, carries: "home" };
}
