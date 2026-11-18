import { describe, expect, it } from "vitest";
import { KNOWN_PROVIDER_SITES } from "@railor/core";
import { EXCHANGES } from "./indian-exchanges";
import { networksFor, stablecoinRoutes, swapOption, TOKENS } from "./stablecoin-routes";

describe("stablecoin swap links", () => {
  it("prefills Uniswap with the issuer addresses, chain and amount", () => {
    const option = swapOption("USDT", "ethereum", 1700);
    expect(option.kind).toBe("uniswap");
    if (option.kind !== "uniswap") return;
    const url = new URL(option.url);
    expect(url.origin + url.pathname).toBe("https://app.uniswap.org/swap");
    expect(Object.fromEntries(url.searchParams)).toEqual({ chain: "ethereum", inputCurrency: TOKENS.USDT.addresses.ethereum, outputCurrency: TOKENS.EURC.addresses.ethereum, value: "1700", field: "input" });
  });

  it("uses Base addresses on Base", () => {
    const option = swapOption("USDC", "base", 50);
    expect(option.kind === "uniswap" && new URL(option.url).searchParams.get("outputCurrency")).toBe("0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42");
  });

  it("sends Solana swaps to Titan with both mints, without claiming a prefill", () => {
    expect(swapOption("USDT", "solana", 100)).toEqual({ kind: "titan", name: "Titan", url: "https://app.titan.exchange/swap", network: "solana", prefilled: false, mints: { from: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", to: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr" } });
  });

  it("explains networks where EURC isn't issued instead of linking anywhere", () => {
    expect(swapOption("USDT", "tron", 100)).toMatchObject({ kind: "none", reason: expect.stringContaining("EURC on Tron") });
    expect(swapOption("USDC", "polygon", 100).kind).toBe("none");
  });

  it("only offers networks the issuer lists", () => {
    expect(networksFor("USDT")).toEqual(["ethereum", "solana", "tron"]);
    expect(networksFor("USDC")).toEqual(["ethereum", "base", "arbitrum", "polygon", "solana"]);
  });
});

describe("stablecoin off-ramp routes", () => {
  it("never prices a stablecoin at 1:1 — no route shows a computed INR amount", () => {
    const routes = stablecoinRoutes("USDT", "tron", "INR", 1700);
    expect(routes.map((route) => route.id).slice(-2)).toEqual(["xflow-stablecoins", "tether-redemption"]);
    expect(routes.find((route) => route.id === "xflow-stablecoins")).toMatchObject({ price: "Price on request", delivers: "INR in your Indian bank account" });
    expect(routes.every((route) => !/₹|INR \d/.test(route.price))).toBe(true);
  });

  it("applies Tether's published minimum and fee", () => {
    const tether = (amount: number) => stablecoinRoutes("USDT", "ethereum", "INR", amount).find((route) => route.id === "tether-redemption")!;
    expect(tether(1700).price).toBe("Below the USD 100,000 minimum");
    expect(tether(100_000).price).toBe("Fee USD 1,000");
    expect(tether(2_500_000).price).toBe("Fee USD 2,500");
  });

  it("offers XEROF for USDT or USDC sent on Ethereum, as price on request", () => {
    for (const asset of ["USDT", "USDC"] as const) {
      const routes = stablecoinRoutes(asset, "ethereum", "INR", 1700);
      const order = routes.map((route) => route.id);
      expect(order.indexOf("xerof-payouts")).toBe(order.indexOf("xflow-stablecoins") + 1);
      const xerof = routes.find((route) => route.id === "xerof-payouts")!;
      expect(xerof).toMatchObject({ provider: "XEROF", slug: "xerof", price: "Price on request", delivers: "INR in a bank account in India", sourceUrl: "https://xerof.com/payouts/india" });
      expect(xerof.caution).toBeUndefined();
      expect(xerof.points[0]).toContain("Ethereum (ERC-20) only");
      // The published fee components are stated, but no INR total is invented from them.
      expect(xerof.priceNote).toContain("1.00%");
      expect(xerof.priceNote).toContain("0.25%");
      expect(xerof.priceNote).toContain("no INR total is published");
    }
  });

  it("hides XEROF on networks it cannot be funded from, and for the EURC destination", () => {
    for (const [asset, network] of [["USDT", "tron"], ["USDT", "solana"], ["USDC", "polygon"], ["USDC", "base"], ["USDC", "arbitrum"], ["USDC", "solana"]] as const) {
      expect(stablecoinRoutes(asset, network, "INR", 1700).some((route) => route.id === "xerof-payouts"), `${asset} on ${network}`).toBe(false);
    }
    // XEROF pays fiat EUR into a bank over SEPA; that is not EURC.
    expect(stablecoinRoutes("USDC", "ethereum", "EURC", 1700).some((route) => route.id === "xerof-payouts")).toBe(false);
  });

  it("flags EVM chains Xflow doesn't name", () => {
    expect(stablecoinRoutes("USDC", "base", "INR", 500)[0]!.caution).toContain("Base");
    expect(stablecoinRoutes("USDC", "polygon", "INR", 500)[0]!.caution).toBeUndefined();
  });

  it("offers Circle Mint for USDC only, and no INR route when the goal is EURC", () => {
    expect(stablecoinRoutes("USDC", "ethereum", "EURC", 500).map((route) => route.id)).toEqual(["circle-mint"]);
    expect(stablecoinRoutes("USDT", "ethereum", "EURC", 500)).toEqual([]);
  });
});

describe("Indian exchange routes for USDT", () => {
  const exchanges = (network: Parameters<typeof stablecoinRoutes>[1]) => stablecoinRoutes("USDT", network, "INR", 1700).filter((route) => route.id.startsWith("exchange-"));

  it("lists every exchange read from its own pages, cheapest all-in entry fee first", () => {
    // WazirX, SunCrypto and Giottus tie at 0.40% + 18% GST (0.47%); Flitpay's 0.50% includes GST; then ZebPay, CoinDCX, Mudrex.
    expect(exchanges("ethereum").map((route) => route.slug)).toEqual(["wazirx", "suncrypto", "giottus", "flitpay", "zebpay", "coindcx", "mudrex"]);
    expect(Object.fromEntries(exchanges("ethereum").map((route) => [route.slug, route.price]))).toEqual({
      wazirx: "0.40% + GST", suncrypto: "0.40% + GST", giottus: "0.40% + GST", flitpay: "0.50% incl. GST", zebpay: "0.45% + GST", coindcx: "0.50% + GST", mudrex: "1.00% + GST",
    });
  });

  it("cites each exchange's own page and the date it was read, and never an INR total", () => {
    const sources = Object.fromEntries(exchanges("ethereum").map((route) => [route.slug, route.sourceUrl]));
    expect(sources).toEqual({
      wazirx: "https://wazirx.com/fees", suncrypto: "https://suncrypto.in/fee-structure", giottus: "https://www.giottus.com/docs/fees.html", flitpay: "https://www.flitpay.com/fees/trading-fees",
      zebpay: "https://zebpay.com/in/features/pricing", coindcx: "https://coindcx.com/fees", mudrex: "https://mudrex.com/fee",
    });
    for (const route of exchanges("ethereum")) {
      expect(route.checkedAt, route.slug).toBe("2026-11-18");
      expect(route.action?.url, route.slug).toMatch(/^https:\/\//);
      expect(route.priceNote, route.slug).toContain("1% TDS");
      expect(route.priceNote, route.slug).toContain("live USDT/INR order book");
      expect(route.points.join(" "), route.slug).not.toMatch(/₹[\d,]+ (?:for|per) USDT/);
    }
  });

  it("hides an exchange that lists other networks, and flags one that lists none", () => {
    expect(exchanges("tron").map((route) => route.slug)).toHaveLength(7);
    // On Solana only the exchanges that don't publish a network list remain, each with a caution to confirm it.
    const solana = exchanges("solana");
    expect(solana.map((route) => route.slug)).toEqual(["suncrypto", "coindcx"]);
    for (const route of solana) expect(route.caution, route.slug).toContain("Solana");
    // Where an exchange publishes its networks there is nothing to caution about.
    expect(exchanges("ethereum").filter((route) => route.caution).map((route) => route.slug)).toEqual(["suncrypto", "coindcx"]);
    expect(exchanges("tron").find((route) => route.slug === "wazirx")!.points[2]).toBe("Takes USDT on Ethereum (ERC-20) and Tron (TRC-20).");
  });

  it("is for USDT sold into INR only", () => {
    expect(stablecoinRoutes("USDC", "ethereum", "INR", 1700).some((route) => route.id.startsWith("exchange-"))).toBe(false);
    expect(stablecoinRoutes("USDT", "ethereum", "EURC", 1700).some((route) => route.id.startsWith("exchange-"))).toBe(false);
  });

  it("has a logo site registered for every exchange", () => {
    for (const exchange of EXCHANGES) expect(KNOWN_PROVIDER_SITES[exchange.slug], exchange.slug).toMatch(/^https:\/\//);
  });
});
