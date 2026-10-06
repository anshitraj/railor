import { afterEach, describe, expect, it, vi } from "vitest";
import {
  airwallexBeneficiary,
  airwallexPayoutAdapter,
  airwallexQuoteToUnified,
  wisePayoutAdapter,
  wisePublicQuote,
  wiseQuoteToUnified,
  wiseRecipientBody,
} from "../payments/index.js";
import { BeneficiaryInput } from "../payments/service.js";
import type { PayoutBeneficiary, PayoutRequest } from "../payments/types.js";
import { comparePrices, PUBLISHED_PRICING } from "../pricing.js";
import { iconCandidates } from "../logos.js";
import { isPrivateAddress } from "../net-guard.js";

// Trimmed from a live, anonymous POST https://api.wise.com/v3/quotes (USD→INR 1000) on 2026-09-27.
const WISE_PUBLIC = {
  sourceAmount: 1000,
  rate: 95.7792,
  sourceCurrency: "USD",
  targetCurrency: "INR",
  expirationTime: "2026-09-27T05:04:27Z",
  paymentOptions: [
    { payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", disabled: false, sourceAmount: 1000, targetAmount: 94700.73, estimatedDelivery: "2026-09-28T14:20:00Z", formattedEstimatedDelivery: "by Monday", fee: { transferwise: 5.15, payIn: 6.11, discount: 0, total: 11.26 }, price: { total: { value: { amount: 11.26, currency: "USD" } } } },
    { payIn: "DEBIT", payOut: "BANK_TRANSFER", disabled: false, sourceAmount: 1000, targetAmount: 94113.6, fee: { total: 17.39 } },
    { payIn: "BALANCE", payOut: "BANK_TRANSFER", disabled: true, sourceAmount: 1000, targetAmount: 95324.25, fee: { total: 4.75 } },
  ],
};

const beneficiary = (over: Partial<PayoutBeneficiary> = {}): PayoutBeneficiary => ({
  id: "b1",
  holderType: "business",
  holderName: "Mumbai Studio Pvt Ltd",
  country: "IN",
  currency: "INR",
  method: "in_bank",
  network: null,
  details: { ifsc: "HDFC0001234", accountNumber: "50100012345678" },
  ...over,
});

const payoutRequest = (over: Partial<PayoutRequest> = {}): PayoutRequest => ({
  paymentId: "pay_1",
  attemptNumber: 1,
  idempotencyKey: "4b7c1c5e-1111-4a4a-9999-000000000001",
  amount: "1000.00",
  sourceCurrency: "USD",
  destinationCurrency: "INR",
  destinationCountry: "IN",
  beneficiary: beneficiary(),
  beneficiaryProviderRef: "account:777",
  environment: "sandbox",
  ...over,
});

type Route = { match: RegExp; status?: number; body: unknown };
function stubFetch(routes: Route[]) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const impl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    calls.push({ url: u, method, body: typeof init?.body === "string" ? init.body : undefined });
    const route = routes.find((r) => r.match.test(`${method} ${u}`));
    if (!route) throw new TypeError(`unmocked ${method} ${u}`);
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", impl);
  return { impl: impl as unknown as typeof fetch, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Wise quotes", () => {
  it("reads a real public quote: bank-transfer option when the balance option is disabled", () => {
    const q = wiseQuoteToUnified(WISE_PUBLIC, { sourceAsset: "USD", destinationCurrency: "INR", amount: 1000 }, "public_published", new Date("2026-09-27T04:34:27Z"));
    expect(q.recipientAmount).toBe(94700.73);
    expect(q.feeAmount).toBe(11.26);
    expect(q.feeCurrency).toBe("USD");
    expect(q.exchangeRate).toBe("95.7792");
    expect(q.costPartial).toBe(false);
    expect(q.accountContext).toBe("public_published");
    expect(q.quoteType).toBe("indicative");
    expect(q.estimatedArrivalMinutes).toBeGreaterThan(24 * 60);
  });

  it("prefers the Wise balance when it is enabled", () => {
    const enabled = { ...WISE_PUBLIC, paymentOptions: WISE_PUBLIC.paymentOptions.map((o) => ({ ...o, disabled: false })) };
    expect(wiseQuoteToUnified(enabled, { sourceAsset: "USD", destinationCurrency: "INR", amount: 1000 }, "customer_connected").feeAmount).toBe(4.75);
    expect(wiseQuoteToUnified(enabled, { sourceAsset: "USD", destinationCurrency: "INR", amount: 1000 }, "customer_connected").quoteType).toBe("live");
  });

  it("shows a balance-only pair publicly (AED→USD), labelled, but never for an account quote", async () => {
    // Live shape, 2026-09-29: Wise funds AED only from a balance, disabled for the anonymous caller's location.
    const balanceOnly = { rate: 0.2723, sourceCurrency: "AED", paymentOptions: [{ payIn: "BALANCE", payOut: "BANK_TRANSFER", disabled: true, sourceAmount: 5000, targetAmount: 1349.41, fee: { total: 44.3 } }] };
    const fetcher = (async () => new Response(JSON.stringify(balanceOnly))) as unknown as typeof fetch;
    const q = await wisePublicQuote({ sourceAsset: "AED", destinationCurrency: "USD", amount: 5000 }, fetcher);
    expect(q).toMatchObject({ recipientAmount: 1349.41, feeAmount: 44.3 });
    expect(q.payInLabel).toMatch(/only way Wise funds this pair/);
    expect(() => wiseQuoteToUnified(balanceOnly, { sourceAsset: "AED", destinationCurrency: "USD", amount: 5000 }, "customer_connected")).toThrow();
  });

  it("refuses stablecoins instead of guessing", async () => {
    await expect(wisePublicQuote({ sourceAsset: "USDC", destinationCurrency: "INR", amount: 10 })).rejects.toThrow(/fiat/);
  });
});

describe("Wise payouts", () => {
  it("maps each beneficiary method to Wise's recipient type", () => {
    expect(wiseRecipientBody(beneficiary(), "42")).toMatchObject({ type: "indian", profile: 42, details: { legalType: "BUSINESS", ifscCode: "HDFC0001234" } });
    expect(wiseRecipientBody(beneficiary({ method: "iban", currency: "EUR", details: { iban: "de89 3704 0044 0532 0130 00" } }), "42").details).toMatchObject({ IBAN: "DE89370400440532013000" });
    expect(wiseRecipientBody(beneficiary({ method: "gb", holderType: "individual", details: { sortCode: "04-00-75", accountNumber: "37778842" } }), "42")).toMatchObject({ type: "sort_code", details: { legalType: "PRIVATE", sortCode: "040075" } });
    expect(wiseRecipientBody(beneficiary({ method: "bank_us", currency: "USD", country: "US", details: { routingNumber: "026073150", accountNumber: "12345678", city: "New York", state: "NY", postalCode: "10001", addressLine1: "1 Main St" } }), "42")).toMatchObject({ type: "aba", details: { abartn: "026073150", accountType: "CHECKING", address: { city: "New York" } } });
    expect(() => wiseRecipientBody(beneficiary({ method: "pix" }), "42")).toThrow();
  });

  it("quotes, creates with customerTransactionId, funds from balance", async () => {
    const { calls } = stubFetch([
      { match: /POST .*\/v3\/profiles\/9\/quotes$/, body: { id: "q-uuid", ...WISE_PUBLIC } },
      { match: /POST .*\/v1\/transfers$/, body: { id: 555, status: "incoming_payment_waiting" } },
      { match: /POST .*\/v3\/profiles\/9\/transfers\/555\/payments$/, status: 201, body: { status: "COMPLETED", type: "BALANCE" } },
    ]);
    const outcome = await wisePayoutAdapter.createPayout({ apiToken: "t", profileId: "9" }, payoutRequest());
    expect(outcome).toMatchObject({ kind: "accepted", providerReference: "transfer:555", status: "processing", feeAmount: "11.26" });
    expect(calls[0]!.url).toContain("api.wise-sandbox.com");
    const transfer = JSON.parse(calls[1]!.body!);
    expect(transfer).toMatchObject({ targetAccount: 777, quoteUuid: "q-uuid", customerTransactionId: payoutRequest().idempotencyKey });
  });

  it("cancels an unfunded transfer and rejects (retryable) on insufficient balance", async () => {
    const { calls } = stubFetch([
      { match: /quotes$/, body: { id: "q", ...WISE_PUBLIC } },
      { match: /POST .*\/v1\/transfers$/, body: { id: 556 } },
      { match: /payments$/, status: 201, body: { status: "REJECTED", errorCode: "balance.insufficient-funds" } },
      { match: /PUT .*\/v1\/transfers\/556\/cancel$/, body: { id: 556, status: "cancelled" } },
    ]);
    const outcome = await wisePayoutAdapter.createPayout({ apiToken: "t", profileId: "9" }, payoutRequest());
    expect(outcome).toMatchObject({ kind: "rejected", retryableElsewhere: true, code: "wise_balance_insufficient_funds" });
    expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/556/cancel"))).toBe(true);
  });

  it("treats a replayed funding call (payment.exists) as funded", async () => {
    stubFetch([
      { match: /quotes$/, body: { id: "q", ...WISE_PUBLIC } },
      { match: /POST .*\/v1\/transfers$/, body: { id: 557 } },
      { match: /payments$/, status: 201, body: { status: "REJECTED", errorCode: "payment.exists" } },
    ]);
    expect(await wisePayoutAdapter.createPayout({ apiToken: "t", profileId: "9" }, payoutRequest())).toMatchObject({ kind: "accepted", providerReference: "transfer:557" });
  });

  it("SCA-protected funding cancels the transfer and says why", async () => {
    stubFetch([
      { match: /quotes$/, body: { id: "q", ...WISE_PUBLIC } },
      { match: /POST .*\/v1\/transfers$/, body: { id: 558 } },
      { match: /payments$/, status: 403, body: { message: "SCA required" } },
      { match: /cancel$/, body: {} },
    ]);
    expect(await wisePayoutAdapter.createPayout({ apiToken: "t", profileId: "9" }, payoutRequest())).toMatchObject({ kind: "rejected", code: "wise_sca_required", retryableElsewhere: true });
  });

  it("an ambiguous transfer create is unknown, and found again by customerTransactionId", async () => {
    stubFetch([
      { match: /quotes$/, body: { id: "q", ...WISE_PUBLIC } },
      { match: /POST .*\/v1\/transfers$/, status: 502, body: {} },
    ]);
    expect((await wisePayoutAdapter.createPayout({ apiToken: "t", profileId: "9" }, payoutRequest())).kind).toBe("unknown");
    stubFetch([
      { match: /GET .*\/v1\/transfers\?profile=9/, body: [{ id: 1, customerTransactionId: "other" }, { id: 559, customerTransactionId: payoutRequest().idempotencyKey, status: "processing" }] },
      { match: /GET .*\/v1\/transfers\/559$/, body: { id: 559, status: "outgoing_payment_sent" } },
    ]);
    const found = await wisePayoutAdapter.getPayout({ apiToken: "t", profileId: "9" }, { idempotencyKey: payoutRequest().idempotencyKey, environment: "sandbox", createdAt: new Date() });
    expect(found).toMatchObject({ found: true, providerReference: "transfer:559", status: "completed" });
  });
});

describe("Airwallex", () => {
  it("builds inline bank beneficiaries per method", () => {
    expect(airwallexBeneficiary(beneficiary())).toMatchObject({ type: "BANK_ACCOUNT", entity_type: "COMPANY", bank_details: { account_routing_type1: "ifsc", account_routing_value1: "HDFC0001234", bank_country_code: "IN" } });
    expect(airwallexBeneficiary(beneficiary({ holderType: "individual", holderName: "Asha Rao Menon", method: "bank_us", country: "US", currency: "USD", details: { routingNumber: "026073150", accountNumber: "1234" } }))).toMatchObject({ entity_type: "PERSONAL", first_name: "Asha Rao", last_name: "Menon", bank_details: { account_routing_type1: "aba", local_clearing_system: "ACH" } });
    expect(() => airwallexBeneficiary(beneficiary({ method: "clabe" }))).toThrow();
  });

  it("signs the FX markup by which side of the pair is bought, and flags the missing transfer fee", () => {
    // Pair USDINR: base USD is sold, so a lower client rate than mid is the customer's cost.
    const q = airwallexQuoteToUnified({ quote_id: "aq", client_rate: 95.3, mid_rate: 95.78, currency_pair: "USDINR", buy_amount: 95300, sell_amount: 1000, valid_to_at: "2026-09-27T05:00:00+0000" }, { sourceAsset: "USD", destinationCurrency: "INR", amount: 1000 });
    expect(q.fxSpreadAmount).toBeCloseTo(5.01, 1);
    expect(q.costPartial).toBe(true);
    expect(q.recipientAmount).toBe(95300);
    expect(q.expiresAt).toBe("2026-09-27T05:00:00.000Z");
  });

  it("creates a transfer with request_id and turns a duplicate into unknown, never a failure", async () => {
    const { calls } = stubFetch([
      { match: /authentication\/login$/, body: { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString() } },
      { match: /transfers\/create$/, status: 201, body: { id: "tr_1", status: "PROCESSING", fee_amount: 3, fee_currency: "USD", amount_beneficiary_receives: 95012 } },
    ]);
    const creds = { clientId: "c", apiKey: "k" };
    expect(await airwallexPayoutAdapter.createPayout(creds, payoutRequest())).toMatchObject({ kind: "accepted", providerReference: "transfer:tr_1", feeAmount: "3" });
    expect(calls[0]!.url).toContain("api.sandbox.airwallex.com");
    expect(JSON.parse(calls[1]!.body!)).toMatchObject({ request_id: payoutRequest().idempotencyKey, transfer_method: "LOCAL", source_currency: "USD", transfer_currency: "INR" });

    stubFetch([
      { match: /authentication\/login$/, body: { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString() } },
      { match: /transfers\/create$/, status: 400, body: { code: "duplicate_request", message: "request_id already used" } },
    ]);
    expect((await airwallexPayoutAdapter.createPayout({ clientId: "c2", apiKey: "k2" }, payoutRequest())).kind).toBe("unknown");
  });

  it("finds an unreferenced attempt by request_id", async () => {
    stubFetch([
      { match: /authentication\/login$/, body: { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString() } },
      { match: /GET .*\/api\/v1\/transfers\?/, body: { items: [{ id: "tr_9", request_id: payoutRequest().idempotencyKey, status: "PAID" }], has_more: false } },
    ]);
    const found = await airwallexPayoutAdapter.getPayout({ clientId: "c3", apiKey: "k3" }, { idempotencyKey: payoutRequest().idempotencyKey, environment: "sandbox", createdAt: new Date() });
    expect(found).toMatchObject({ found: true, providerReference: "transfer:tr_9", status: "completed" });
  });
});

describe("India bank beneficiaries", () => {
  const base = { holderType: "business", holderName: "Mumbai Studio", country: "IN", currency: "INR", method: "in_bank" };
  it("validates IFSC and account number", () => {
    expect(BeneficiaryInput.safeParse({ ...base, details: { ifsc: "hdfc0001234", accountNumber: "50100012345678" } }).success).toBe(true);
    expect(BeneficiaryInput.safeParse({ ...base, details: { ifsc: "HDFC1001234", accountNumber: "50100012345678" } }).success).toBe(false);
    expect(BeneficiaryInput.safeParse({ ...base, details: { ifsc: "HDFC0001234", accountNumber: "123" } }).success).toBe(false);
  });
});

describe("price check", () => {
  it("does not invent a fresh collection time for an undated market estimate", async () => {
    const fetcher: typeof fetch = async (url) => new Response(JSON.stringify(String(url).includes("/v4/comparisons")
      ? { providers: [{ alias: "bank", name: "Undated bank", quotes: [{ receivedAmount: 95000, rate: 95, fee: 0 }] }] }
      : { id: "pq", ...WISE_PUBLIC }));
    const result = await comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, includeMarket: true }, { fetcher });
    expect(result.rows.find((row) => row.providerSlug === "market:bank")?.observedAt).toBe("");
  });
  const market = {
    providers: [
      { alias: "wise", name: "Wise", quotes: [{ receivedAmount: 94700.73 }] },
      { alias: "remitly", name: "Remitly", type: "moneyTransferProvider", logos: { normal: { svgUrl: "https://dq8dwmysp7hk1.cloudfront.net/logos/remitly.svg" } }, quotes: [{ rate: 95.53, fee: 0, receivedAmount: 95530, dateCollected: "2026-09-26T22:44:17Z" }] },
      { alias: "sbi", name: "State Bank of India", type: "bank", quotes: [{ rate: 95.3, fee: 0, receivedAmount: 95300, dateCollected: "2026-09-26T22:50:05Z" }] },
    ],
  };
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v4/comparisons")) return new Response(JSON.stringify(market));
    return new Response(JSON.stringify({ id: "pq", ...WISE_PUBLIC }));
  }) as unknown as typeof fetch;

  it("ranks complete rows by what arrives and labels every source", async () => {
    const result = await comparePrices(
      { sourceCurrency: "usd", destinationCurrency: "inr", amount: 1000, includeMarket: true },
      {
        fetcher,
        connectable: [{ slug: "airwallex", name: "Airwallex", connected: false }, { slug: "wise", name: "Wise", connected: false }],
        connectedQuotes: async () => [],
      },
    );
    expect(result.reference?.rate).toBe(95.7792);
    const bySlug = Object.fromEntries(result.rows.map((r) => [r.providerSlug, r]));
    expect(bySlug.wise!.basis).toBe("live_public");
    expect(bySlug.wise!.recipientAmount).toBe(94700.73);
    // PayZoll: 1% of 1000 = 10 USD, 990 × 95.7792
    expect(bySlug.payzoll).toMatchObject({ basis: "published", feeAmount: 10, recipientAmount: 94821.41, partial: true, shortfall: null, totalCostPct: null });
    // Skydo: $19 slab + 18% GST = 22.42 USD
    expect(bySlug.skydo).toMatchObject({ basis: "published", feeAmount: 22.42, feeCurrency: "USD" });
    expect(bySlug["market:remitly"]).toMatchObject({ basis: "market_estimate", recipientAmount: 95530 });
    expect(bySlug["market:wise"]).toBeUndefined();
    const actionable = result.rows.filter((r) => r.basis !== "market_estimate");
    const amounts = actionable.filter((r) => !r.partial && r.recipientAmount !== null).map((r) => r.recipientAmount!);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    // Market estimates come after every actionable price and never take "best"...
    expect(result.rows.findIndex((r) => r.basis === "market_estimate")).toBe(actionable.length);
    expect(result.rows[0]!).toMatchObject({ providerSlug: "wise", shortfall: 0 });
    // ...but still show when they'd deliver more (negative shortfall).
    expect(bySlug["market:remitly"]!.shortfall).toBeLessThan(0);
    expect(result.unavailable).toEqual(expect.arrayContaining([expect.objectContaining({ providerSlug: "airwallex", connectable: true })]));
  });

  it("puts partial-cost exact quotes after complete ones, whatever their amount", async () => {
    const now = new Date().toISOString();
    const result = await comparePrices(
      { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000 },
      {
        fetcher,
        connectedQuotes: async () => [
          { providerSlug: "airwallex", providerName: "Airwallex", quote: { providerSlug: "airwallex", sourceAsset: "USD", destinationCurrency: "INR", amount: 1000, recipientAmount: 99999, costPartial: true, quoteType: "live", accountContext: "customer_connected", verificationType: "provider_reported", observedAt: now, quotedAt: now } },
        ],
      },
    );
    const airwallex = result.rows.find((r) => r.providerSlug === "airwallex")!;
    expect(airwallex).toMatchObject({ basis: "exact", partial: true, shortfall: null });
    expect(result.rows.indexOf(airwallex)).toBeGreaterThan(result.rows.findIndex((r) => r.providerSlug === "wise"));
  });

  it("published schedules only apply where the provider says they do", () => {
    const skydo = PUBLISHED_PRICING.find((p) => p.slug === "skydo")!;
    expect(skydo.appliesTo({ sourceCurrency: "USD", destinationCurrency: "EUR", amount: 10 })).toMatch(/India/);
    expect(skydo.fee({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 5000 }, 5000)).toMatchObject({ amount: 34.22 });
    expect(skydo.fee({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 20000 }, 20000)).toMatchObject({ amount: 70.8 });
  });
  it("uses PayZoll's USD minimum and threshold, without claiming partner fees are included", () => {
    const p = PUBLISHED_PRICING.find(p => p.slug === "payzoll")!;
    const input = { sourceCurrency: "EUR", destinationCurrency: "INR", amount: 500 };
    expect(p.fee(input, 550)).toMatchObject({ amount: 10, currency: "USD" });
    expect(p.fee(input, 1000)).toMatchObject({ amount: 10 });
    expect(p.fee(input, 1001)).toMatchObject({ amount: 10.01 });
    expect(p.fee(input, null)).toBeNull();
    expect(p.partial).toBe(true);
  });
  it("does not display negative receiving amounts when published fees exceed the transfer", async () => {
    const result = await comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 5 }, { fetcher });
    expect(result.rows.some(r => r.providerSlug === "payzoll" || r.providerSlug === "skydo")).toBe(false);
    expect(result.unavailable.find(p => p.providerSlug === "payzoll")?.reason).toContain("minimum transaction size");
  });
  it("keeps sandbox and Railor-account observations completely outside selectable/ranked prices", async () => {
    const quote = { providerSlug: "airwallex", sourceAsset: "USD", destinationCurrency: "INR", amount: 1000, recipientAmount: 999999, costPartial: true, quoteType: "indicative" as const, accountContext: "railor_network" as const, verificationType: "provider_reported" as const, observedAt: new Date().toISOString(), quotedAt: new Date().toISOString() };
    for (const environment of ["sandbox", "production"] as const) {
      const result = await comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000 }, { fetcher,
        platformQuotes: async () => [{ providerSlug: "airwallex", providerName: "Airwallex", environment, status: "quoted", quote, error: null }],
      });
      expect(result.platformQuotes).toHaveLength(1);
      expect(result.rows.some(r => r.providerSlug === "airwallex")).toBe(false);
      expect(result.rows[0]?.providerSlug).toBe("wise");
    }
  });
});

describe("logos", () => {
  it("prefers an SVG icon, then the largest raster", () => {
    const html = `<head>
      <link rel="icon" href="/favicon-32.png" sizes="32x32">
      <link rel="apple-touch-icon" href="/touch.png">
      <link rel="icon" type="image/svg+xml" href="https://cdn.example.com/mark.svg">
      <link rel="mask-icon" href="/mask.svg">
      <link rel="stylesheet" href="/app.css">
    </head>`;
    expect(iconCandidates(html, "https://example.com/").map((c) => c.href)).toEqual(["https://cdn.example.com/mark.svg", "https://example.com/touch.png", "https://example.com/favicon-32.png"]);
  });

  it("never treats a private address as fetchable", () => {
    for (const host of ["127.0.0.1", "10.2.3.4", "169.254.169.254", "[::1]", "::ffff:7f00:1", "metadata.internal"]) expect(isPrivateAddress(host), host).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });
});
