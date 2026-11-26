import { describe, expect, it } from "vitest";
import { providerLink, providerSite } from "./provider-sites";

const transfer = { from: "USD", to: "EUR", amount: 1000 };

describe("what a provider link carries", () => {
  it("opens Wise's converter on the pair and amount", () => {
    expect(providerLink("wise", transfer)).toEqual({ href: "https://wise.com/gb/currency-converter/usd-to-eur-rate?amount=1000", carries: "amount" });
    expect(providerLink("market:wise", { ...transfer, amount: 0 })).toEqual({ href: "https://wise.com/gb/currency-converter/usd-to-eur-rate", carries: "corridor" });
  });

  it("opens Xe's converter on the pair and amount", () => {
    expect(providerLink("xe", { from: "gbp", to: "inr", amount: 2500.5 })).toEqual({ href: "https://www.xe.com/currencyconverter/convert/?Amount=2500.5&From=GBP&To=INR", carries: "amount" });
    expect(providerLink("xe", { ...transfer, amount: 0 })).toEqual({ href: "https://www.xe.com", carries: "home" });
  });

  it("opens the route where the provider's page was checked, and the homepage otherwise, saying which", () => {
    expect(providerLink("remitly", { from: "USD", to: "INR", amount: 500 })).toMatchObject({ carries: "corridor" });
    expect(providerLink("remitly", transfer)).toEqual({ href: "https://www.remitly.com", carries: "home" });
    expect(providerLink("western-union", transfer)).toMatchObject({ carries: "home" });
    expect(providerLink("not-a-provider", transfer)).toBeNull();
    expect(providerSite("market:xe")).toBe("https://www.xe.com");
  });
});
