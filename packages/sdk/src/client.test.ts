import { describe, expect, it, vi } from "vitest";
import { Railor, RailorAPIError, RailorConnectionError } from "./index.js";

function mockFetch(responses: Array<{ status?: number; body?: unknown; headers?: Record<string, string> } | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("no more mocked responses");
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? "" : JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: next.headers,
    });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("Railor SDK", () => {
  it("requires an API key", () => {
    expect(() => new Railor({ apiKey: "" })).toThrow(/No API key/);
  });

  it("sends bearer auth and converts top-level params to snake_case", async () => {
    const { impl, calls } = mockFetch([{ body: { providers_checked: 3, results: [] } }]);
    const railor = new Railor({ apiKey: "rail_test_x", baseUrl: "https://api.example/", fetch: impl });
    const result = await railor.corridors.search({ entityCountry: "IN", destinationCountry: "AE", sourceAsset: "USDC" });
    expect(result).toEqual({ providers_checked: 3, results: [] });
    expect(calls[0]!.url).toBe("https://api.example/v1/corridors/search");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer rail_test_x");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      customer_type: "business",
      entity_country: "IN",
      destination_country: "AE",
      source_asset: "USDC",
    });
  });

  it("leaves nested intent and rules objects untouched", async () => {
    const { impl, calls } = mockFetch([{ body: { id: "d1" } }, { body: { id: "p1" } }]);
    const railor = new Railor({ apiKey: "k", fetch: impl });
    await railor.decisions.create({ intent: { sourceEntityCountry: "IN", destinationCountry: "AE", amount: 10 }, policyId: "p" });
    await railor.policies.create({ name: "P", rules: { requireExactRouteEvidence: true } });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      intent: { sourceEntityCountry: "IN", destinationCountry: "AE", amount: 10 },
      policy_id: "p",
    });
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ name: "P", rules: { requireExactRouteEvidence: true } });
  });

  it("builds query strings and skips undefined values", async () => {
    const { impl, calls } = mockFetch([{ body: { object: "list", data: [], has_more: false } }]);
    const railor = new Railor({ apiKey: "k", baseUrl: "http://x", fetch: impl });
    await railor.capabilities.list({ destinationCountry: "AE", limit: 5, provider: undefined });
    expect(calls[0]!.url).toBe("http://x/v1/capabilities?destination_country=AE&limit=5");
  });

  it("raises RailorAPIError with the API's code and message", async () => {
    const { impl } = mockFetch([{ status: 404, body: { object: "error", error: { code: "provider_not_found", message: "No provider" } } }]);
    const railor = new Railor({ apiKey: "k", fetch: impl, maxRetries: 0 });
    const error = await railor.providers.retrieve("nope").catch((e) => e);
    expect(error).toBeInstanceOf(RailorAPIError);
    expect(error.status).toBe(404);
    expect(error.code).toBe("provider_not_found");
  });

  it("retries idempotent requests on 5xx but never retries POST", async () => {
    const get = mockFetch([{ status: 503, body: {} }, { body: { object: "list", data: [], has_more: false } }]);
    const railor = new Railor({ apiKey: "k", fetch: get.impl, maxRetries: 1 });
    await expect(railor.providers.list()).resolves.toMatchObject({ object: "list" });
    expect(get.calls).toHaveLength(2);

    const post = mockFetch([{ status: 503, body: { error: { code: "unavailable", message: "down" } } }]);
    const railor2 = new Railor({ apiKey: "k", fetch: post.impl, maxRetries: 3 });
    await expect(railor2.compare({ providers: ["a", "b"] })).rejects.toBeInstanceOf(RailorAPIError);
    expect(post.calls).toHaveLength(1);
  });

  it("wraps network failures in RailorConnectionError", async () => {
    const { impl } = mockFetch([new TypeError("fetch failed")]);
    const railor = new Railor({ apiKey: "k", fetch: impl, maxRetries: 0 });
    await expect(railor.changes.list()).rejects.toBeInstanceOf(RailorConnectionError);
  });

  it("listAll follows has_more cursors", async () => {
    const { impl, calls } = mockFetch([
      { body: { object: "list", data: [{ id: "a" }, { id: "b" }], has_more: true } },
      { body: { object: "list", data: [{ id: "c" }], has_more: false } },
    ]);
    const railor = new Railor({ apiKey: "k", baseUrl: "http://x", fetch: impl });
    const ids: string[] = [];
    for await (const row of railor.capabilities.listAll({ limit: 2 })) ids.push(String(row.id));
    expect(ids).toEqual(["a", "b", "c"]);
    expect(calls[1]!.url).toBe("http://x/v1/capabilities?limit=2&starting_after=b");
  });

  it("sends Idempotency-Key on payment creation and retries it safely", async () => {
    const { impl, calls } = mockFetch([{ status: 503, body: {} }, { status: 201, body: { object: "payment", id: "pay_1", status: "ready" } }]);
    const railor = new Railor({ apiKey: "k", baseUrl: "http://x", fetch: impl, maxRetries: 1 });
    const intent = { sourceEntityCountry: "IN", destinationCountry: "AE", destinationCurrency: "AED", sourceAsset: "USDC", amount: 10 };
    const payment = await railor.payments.create({ beneficiaryId: "ben", intent }, { idempotencyKey: "invoice-1" });
    expect(payment).toMatchObject({ id: "pay_1" });
    expect(calls).toHaveLength(2);
    expect((calls[1]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBe("invoice-1");
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ beneficiary_id: "ben", intent });
  });

  it("checks prices with snake_case params", async () => {
    const { impl, calls } = mockFetch([{ body: { object: "price_check", data: [] } }]);
    const railor = new Railor({ apiKey: "k", baseUrl: "http://x", fetch: impl });
    await railor.prices.check({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, includeMarket: true });
    expect(calls[0]!.url).toBe("http://x/v1/prices");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ source_currency: "USD", destination_currency: "INR", amount: 1000, include_market: true });
  });

  it("never retries a submit (no idempotency key)", async () => {
    const { impl, calls } = mockFetch([{ status: 503, body: { error: { code: "unavailable", message: "x" } } }]);
    const railor = new Railor({ apiKey: "k", fetch: impl, maxRetries: 3 });
    await expect(railor.payments.submit("pay_1")).rejects.toBeInstanceOf(RailorAPIError);
    expect(calls).toHaveLength(1);
  });
});
