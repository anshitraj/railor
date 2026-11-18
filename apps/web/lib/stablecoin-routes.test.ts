import { describe, expect, it } from "vitest";
import { networksFor, notIssuedReason, stablecoinRoutes, swapOption, TOKENS } from "./stablecoin-routes";

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
    expect(networksFor("USDT")).toEqual(["ethereum", "avalanche", "solana", "tron", "ton", "aptos"]);
    expect(networksFor("USDC")).toEqual(["ethereum", "base", "arbitrum", "optimism", "polygon", "avalanche", "arc", "solana", "aptos"]);
  });

  it("explains networks an issuer doesn't use, instead of hiding them", () => {
    expect(notIssuedReason("USDT", "arc")).toContain("Tether doesn’t list USDT on Arc");
    expect(notIssuedReason("USDT", "base")).toContain("bridged copy");
    expect(notIssuedReason("USDC", "bnb")).toContain("Circle doesn’t issue USDC on BNB Chain");
  });

  it("swaps USDC to EURC on Arc only where a DEX link is verified", () => {
    expect(swapOption("USDC", "arc", 100)).toMatchObject({ kind: "none", reason: expect.stringContaining("No verified swap link for Arc") });
    expect(swapOption("USDC", "avalanche", 100).kind).toBe("uniswap");
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
