import { describe, expect, it } from "vitest";
import { goDestination, goHref } from "./provider-go";

describe("the redirect page", () => {
  it("links to /go with the transfer, and only for a provider Railor has a site for", () => {
    expect(goHref("wise", { from: "usd", to: "eur", amount: 1000 })).toBe("/go/wise?from=USD&to=EUR&amount=1000");
    expect(goHref("market:Xe", { from: "GBP", to: "INR", amount: 2500.456 })).toBe("/go/xe?from=GBP&to=INR&amount=2500.46");
    expect(goHref("wise")).toBe("/go/wise");
    expect(goHref("wise", { from: "US", to: "EUR", amount: 1000 })).toBe("/go/wise");
    expect(goHref("not-a-provider", { from: "USD", to: "EUR", amount: 1 })).toBeNull();
  });

  it("works out the destination from the slug, never from the address", () => {
    expect(goDestination("wise", { from: "USD", to: "EUR", amount: "1000" })).toEqual({ href: "https://wise.com/gb/currency-converter/usd-to-eur-rate?amount=1000", carries: "amount" });
    expect(goDestination("xe", { from: "USD", to: "EUR", amount: "1000" })?.href).toContain("https://www.xe.com/currencyconverter/convert/");
    // Anything else in the query is ignored, so it can't point the page elsewhere.
    expect(goDestination("wise", { from: "https://evil.example", to: "EUR", amount: "1000" } as never)).toEqual({ href: "https://wise.com", carries: "home" });
    expect(goDestination("remitly", {})).toEqual({ href: "https://www.remitly.com", carries: "home" });
    expect(goDestination("nope", { from: "USD", to: "EUR", amount: "1" })).toBeNull();
  });
});
