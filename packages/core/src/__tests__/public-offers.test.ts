import { describe, expect, it } from "vitest";
import { publicOfferRows } from "../public-pricing/offers.js";
import captured from "../public-pricing/public-offers.json";
import type { PriceCheckInput } from "../pricing.js";
const offer = captured.observations[0]!;
const now = new Date(Date.parse(offer.observedAt) + 1000);
const input: PriceCheckInput = { sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000, context: { profile: "personal", direction: "receive", country: "IN", purpose: "personal" } };
describe("conditional public calculator captures", () => {
  it("keeps the actual captured amount and offer conditions, never a complete-price winner", () => {
    expect(publicOfferRows(input, now)[0]).toMatchObject({ recipientAmount: 95046, feeAmount: 0, partial: true, publicOffer: { kind: "first_transfer", fundingMethod: "US bank account" } });
  });
  it("never rescales to another amount or applies consumer promotions to business income", () => {
    expect(publicOfferRows({ ...input, amount: 2000 }, now)).toEqual([]);
    expect(publicOfferRows({ ...input, context: { ...input.context!, profile: "business" } }, now)).toEqual([]);
    expect(publicOfferRows({ ...input, context: { ...input.context!, direction: "send", country: "AE" } }, now)).toEqual([]);
    expect(publicOfferRows({ ...input, destinationCountry: "GB" }, now)).toEqual([]);
  });
  it("removes the observation at its 24-hour display deadline and rejects future captures", () => {
    expect(publicOfferRows(input, new Date(offer.displayUntil))).toEqual([]);
    expect(publicOfferRows(input, new Date(Date.parse(offer.observedAt) - 1))).toEqual([]);
  });
});
