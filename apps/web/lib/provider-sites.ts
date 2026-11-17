/**
 * Official websites for providers people can act on from a price check, so
 * "Go to provider" is a working link rather than a disabled button. Client-safe
 * (no server imports); keep entries to each provider's own homepage.
 */
const SITES: Record<string, string> = {
  wise: "https://wise.com",
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
