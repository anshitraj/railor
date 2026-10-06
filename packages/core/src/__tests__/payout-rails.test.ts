import { afterEach, describe, expect, it, vi } from "vitest";
import { airwallexBeneficiary, airwallexPayoutAdapter, airwallexProviderAdapter, airwallexQuoteToUnified, bridgePayoutAdapter, circlePayoutAdapter, wisePayoutAdapter, wiseProviderAdapter, wiseRecipientBody, PAYOUT_ADAPTERS, sandboxPayoutAdapter } from "../payments/index.js";
import type { PayoutAdapter, PayoutBeneficiary, PayoutRequest } from "../payments/types.js";

/**
 * Contract tests for every payout rail Railor can execute. Each provider API is
 * replaced by a recording fake that answers the way the provider's published
 * reference says it does, so the test proves what Railor SENDS (paths, headers,
 * idempotency, amounts on the wire) and how it CLASSIFIES what comes back —
 * without a network, a credential, or a cent moving.
 */

type Reply = Response | [number, unknown];
interface Handler {
  method: string;
  url: RegExp;
  reply: (ctx: { body: any; url: string; headers: Headers }) => Reply;
}
interface Call {
  method: string;
  url: string;
  body: any;
  headers: Headers;
}

function fakeProvider(handlers: Handler[]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : undefined;
      const headers = new Headers(init.headers);
      calls.push({ method, url, body, headers });
      const handler = handlers.find((h) => h.method === method && h.url.test(url));
      if (!handler) return new Response(JSON.stringify({ message: `UNEXPECTED ${method} ${url}` }), { status: 599 });
      const reply = handler.reply({ body, url, headers });
      return reply instanceof Response ? reply : new Response(JSON.stringify(reply[1]), { status: reply[0] });
    }),
  );
  const unexpected = () => calls.filter((c) => !handlers.some((h) => h.method === c.method && h.url.test(c.url)));
  return { calls, unexpected };
}

const ok = (body: unknown): [number, unknown] => [200, body];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ---------------------------------------------------------------------------
 * Fixtures: a valid beneficiary for every method
 * ------------------------------------------------------------------------- */

const ADDRESS = { addressLine1: "1 Main St", city: "Springfield", state: "IL", postalCode: "62701" };
const BENEFICIARIES: Record<PayoutBeneficiary["method"], PayoutBeneficiary> = {
  bank_us: { id: "b-us", holderType: "business", holderName: "Acme Supplies LLC", country: "US", currency: "USD", method: "bank_us", network: null, details: { accountNumber: "1234567890", routingNumber: "021000021", accountType: "checking", bankName: "Chase", ...ADDRESS } },
  iban: { id: "b-iban", holderType: "business", holderName: "Berlin GmbH", country: "DE", currency: "EUR", method: "iban", network: null, details: { iban: "DE89 3704 0044 0532 0130 00", bic: "COBADEFFXXX", bankName: "Commerzbank" } },
  gb: { id: "b-gb", holderType: "individual", holderName: "Jane Q Doe", country: "GB", currency: "GBP", method: "gb", network: null, details: { accountNumber: "55779911", sortCode: "20-00-00" } },
  clabe: { id: "b-mx", holderType: "business", holderName: "Mexico SA de CV", country: "MX", currency: "MXN", method: "clabe", network: null, details: { clabe: "032180000118359719" } },
  pix: { id: "b-br", holderType: "individual", holderName: "Joao Silva", country: "BR", currency: "BRL", method: "pix", network: null, details: { pixKey: "joao@example.com", documentNumber: "12345678909" } },
  in_bank: { id: "b-in", holderType: "business", holderName: "Mumbai Traders Pvt Ltd", country: "IN", currency: "INR", method: "in_bank", network: null, details: { ifsc: "HDFC0001234", accountNumber: "123456789012" } },
  crypto_address: { id: "b-eth", holderType: "business", holderName: "Treasury", country: "AE", currency: "USDC", method: "crypto_address", network: "base", details: { address: "0x00000000000000000000000000000000000000a1" } },
};

function request(method: PayoutBeneficiary["method"], overrides: Partial<PayoutRequest> = {}): PayoutRequest {
  const beneficiary = BENEFICIARIES[method];
  return {
    paymentId: "pay_1",
    attemptNumber: 1,
    idempotencyKey: "0b7c3a2e-5d1f-4c8e-9a6b-1f2e3d4c5b6a",
    amount: "1000.00",
    sourceCurrency: method === "crypto_address" ? "USDC" : "USD",
    sourceNetwork: method === "crypto_address" ? "base" : undefined,
    destinationCurrency: beneficiary.currency,
    destinationCountry: beneficiary.country,
    beneficiary,
    beneficiaryProviderRef: "REF",
    reference: "Invoice 4471",
    environment: "sandbox",
    ...overrides,
  };
}

const lookup = (overrides: Record<string, unknown> = {}) => ({ idempotencyKey: "0b7c3a2e-5d1f-4c8e-9a6b-1f2e3d4c5b6a", environment: "sandbox" as const, createdAt: new Date(), ...overrides });

/* ---------------------------------------------------------------------------
 * Wise
 * ------------------------------------------------------------------------- */

describe("Wise rail", () => {
  const creds = { apiToken: "wise-token", profileId: "101" };
  const quote = { id: "q-uuid-1", paymentOptions: [{ payIn: "BALANCE", payOut: "BANK_TRANSFER", disabled: false, targetAmount: 920.5, sourceAmount: 1000, fee: { total: 4.1, transferwise: 3.1, payIn: 1 } }] };

  const happy = (): Handler[] => [
    { method: "POST", url: /\/v3\/profiles\/101\/quotes$/, reply: () => ok(quote) },
    { method: "POST", url: /\/v1\/transfers$/, reply: () => ok({ id: 555, status: "incoming_payment_waiting" }) },
    { method: "POST", url: /\/v3\/profiles\/101\/transfers\/555\/payments$/, reply: () => ok({ status: "COMPLETED" }) },
  ];

  it("maps every supported beneficiary method to Wise's recipient type and details", () => {
    expect(wiseRecipientBody(BENEFICIARIES.iban, "101")).toMatchObject({ type: "iban", currency: "EUR", profile: 101, accountHolderName: "Berlin GmbH", details: { legalType: "BUSINESS", IBAN: "DE89370400440532013000", BIC: "COBADEFFXXX" } });
    expect(wiseRecipientBody(BENEFICIARIES.gb, "101")).toMatchObject({ type: "sort_code", details: { legalType: "PRIVATE", sortCode: "200000", accountNumber: "55779911" } });
    expect(wiseRecipientBody(BENEFICIARIES.bank_us, "101")).toMatchObject({ type: "aba", details: { abartn: "021000021", accountNumber: "1234567890", accountType: "CHECKING", address: { country: "US", city: "Springfield", postCode: "62701", firstLine: "1 Main St", state: "IL" } } });
    expect(wiseRecipientBody(BENEFICIARIES.clabe, "101")).toMatchObject({ type: "mexican", details: { clabe: "032180000118359719" } });
    expect(wiseRecipientBody(BENEFICIARIES.in_bank, "101")).toMatchObject({ type: "indian", details: { ifscCode: "HDFC0001234", accountNumber: "123456789012" } });
    expect(() => wiseRecipientBody(BENEFICIARIES.pix, "101")).toThrow(/does not pay out to pix/);
    expect(() => wiseRecipientBody(BENEFICIARIES.crypto_address, "101")).toThrow(/does not pay out to crypto_address/);
  });

  it("registers the recipient, then quotes, creates and funds the transfer in order — idempotently", async () => {
    const fake = fakeProvider([{ method: "POST", url: /\/v1\/accounts$/, reply: () => ok({ id: 77 }) }, ...happy()]);
    const ref = await wisePayoutAdapter.ensureBeneficiary!(creds, BENEFICIARIES.iban, { environment: "sandbox", idempotencyKey: "k" });
    expect(ref).toEqual({ providerRef: "account:77" });

    const outcome = await wisePayoutAdapter.createPayout(creds, request("iban", { beneficiaryProviderRef: "account:77" }));
    expect(outcome).toMatchObject({ kind: "accepted", providerReference: "transfer:555", status: "processing", recipientAmount: "920.5", feeAmount: "4.1", feeCurrency: "USD" });
    expect(fake.unexpected()).toEqual([]);
    const flow = fake.calls.filter((c) => !c.url.endsWith("/v1/accounts")).map((c) => `${c.method} ${new URL(c.url).pathname}`);
    expect(flow).toEqual(["POST /v3/profiles/101/quotes", "POST /v1/transfers", "POST /v3/profiles/101/transfers/555/payments"]);
    const [quoteCall, transferCall] = fake.calls.filter((c) => !c.url.endsWith("/v1/accounts"));
    expect(quoteCall!.url.startsWith("https://api.wise-sandbox.com/")).toBe(true);
    expect(quoteCall!.headers.get("authorization")).toBe("Bearer wise-token");
    expect(quoteCall!.body).toMatchObject({ sourceCurrency: "USD", targetCurrency: "EUR", sourceAmount: 1000, targetAccount: 77, payOut: "BANK_TRANSFER" });
    expect(transferCall!.body).toMatchObject({ targetAccount: 77, quoteUuid: "q-uuid-1", customerTransactionId: "0b7c3a2e-5d1f-4c8e-9a6b-1f2e3d4c5b6a" });
    expect(transferCall!.body.details.reference.length).toBeLessThanOrEqual(18);
  });

  it("uses the production host only for production payments", async () => {
    const fake = fakeProvider(happy());
    await wisePayoutAdapter.createPayout(creds, request("iban", { beneficiaryProviderRef: "account:77", environment: "production" }));
    expect(fake.calls.every((c) => c.url.startsWith("https://api.wise.com/"))).toBe(true);
  });

  it("cancels the transfer and says why when the balance cannot fund it", async () => {
    const fake = fakeProvider([
      ...happy().slice(0, 2),
      { method: "POST", url: /payments$/, reply: () => ok({ status: "REJECTED", errorCode: "balance.insufficient-funds" }) },
      { method: "PUT", url: /\/v1\/transfers\/555\/cancel$/, reply: () => ok({}) },
    ]);
    const outcome = await wisePayoutAdapter.createPayout(creds, request("iban", { beneficiaryProviderRef: "account:77" }));
    expect(outcome).toMatchObject({ kind: "rejected", code: "wise_balance_insufficient_funds", retryableElsewhere: true });
    expect(fake.calls.some((c) => c.method === "PUT" && c.url.endsWith("/cancel"))).toBe(true);
  });

  it("cancels and explains SCA when Wise answers 403 to funding", async () => {
    const fake = fakeProvider([...happy().slice(0, 2), { method: "POST", url: /payments$/, reply: () => [403, { message: "SCA required" }] }, { method: "PUT", url: /cancel$/, reply: () => ok({}) }]);
    const outcome = await wisePayoutAdapter.createPayout(creds, request("iban", { beneficiaryProviderRef: "account:77" }));
    expect(outcome).toMatchObject({ kind: "rejected", code: "wise_sca_required" });
    expect(fake.calls.some((c) => c.method === "PUT")).toBe(true);
  });

  it("never cancels on an ambiguous funding failure — the money may already have moved", async () => {
    const fake = fakeProvider([...happy().slice(0, 2), { method: "POST", url: /payments$/, reply: () => [503, {}] }]);
    const outcome = await wisePayoutAdapter.createPayout(creds, request("iban", { beneficiaryProviderRef: "account:77" }));
    expect(outcome.kind).toBe("unknown");
    expect(fake.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("treats a replayed funding call (payment.exists) as already funded", async () => {
    fakeProvider([...happy().slice(0, 2), { method: "POST", url: /payments$/, reply: () => ok({ status: "REJECTED", errorCode: "payment.exists" }) }]);
    expect((await wisePayoutAdapter.createPayout(creds, request("iban", { beneficiaryProviderRef: "account:77" }))).kind).toBe("accepted");
  });

  it("classifies failures before money moves: quote outage rejects, transfer outage is unknown, duplicates are reconciled", async () => {
    fakeProvider([{ method: "POST", url: /quotes$/, reply: () => [500, {}] }]);
    expect(await wisePayoutAdapter.createPayout(creds, request("iban", { beneficiaryProviderRef: "account:77" }))).toMatchObject({ kind: "rejected", code: "provider_unavailable", retryableElsewhere: true });

    fakeProvider([happy()[0]!, { method: "POST", url: /\/v1\/transfers$/, reply: () => [500, {}] }]);
    expect((await wisePayoutAdapter.createPayout(creds, request("iban", { beneficiaryProviderRef: "account:77" }))).kind).toBe("unknown");

    fakeProvider([happy()[0]!, { method: "POST", url: /\/v1\/transfers$/, reply: () => [422, { message: "customerTransactionId already used" }] }]);
    expect((await wisePayoutAdapter.createPayout(creds, request("iban", { beneficiaryProviderRef: "account:77" }))).kind).toBe("unknown");

    fakeProvider([happy()[0]!, { method: "POST", url: /\/v1\/transfers$/, reply: () => [422, { message: "Invalid transfer purpose" }] }]);
    expect(await wisePayoutAdapter.createPayout(creds, request("iban", { beneficiaryProviderRef: "account:77" }))).toMatchObject({ kind: "rejected", retryableElsewhere: true });
  });

  it("refuses stablecoins, missing recipients and missing tokens without calling Wise", async () => {
    const fake = fakeProvider([]);
    expect(await wisePayoutAdapter.createPayout(creds, request("iban", { sourceCurrency: "USDC", beneficiaryProviderRef: "account:77" }))).toMatchObject({ kind: "rejected", code: "unsupported_route" });
    expect(await wisePayoutAdapter.createPayout(creds, request("iban", { beneficiaryProviderRef: undefined }))).toMatchObject({ kind: "rejected", code: "beneficiary_unregistered" });
    expect(await wisePayoutAdapter.createPayout({}, request("iban"))).toMatchObject({ kind: "rejected", code: "connection_incomplete" });
    expect(fake.calls).toHaveLength(0);
  });

  it("maps every Wise transfer status, and finds an ambiguous create by customerTransactionId", async () => {
    const expectations: Record<string, string> = {
      incoming_payment_waiting: "awaiting_funds",
      incoming_payment_initiated: "processing",
      processing: "processing",
      funds_converted: "processing",
      outgoing_payment_sent: "completed",
      bounced_back: "processing",
      funds_refunded: "returned",
      charged_back: "failed",
      cancelled: "cancelled",
    };
    for (const [wise, expected] of Object.entries(expectations)) {
      fakeProvider([{ method: "GET", url: /\/v1\/transfers\/555$/, reply: () => ok({ id: 555, status: wise }) }]);
      expect(await wisePayoutAdapter.getPayout(creds, lookup({ providerReference: "transfer:555" })), wise).toMatchObject({ found: true, status: expected, providerReference: "transfer:555" });
    }
    fakeProvider([
      { method: "GET", url: /\/v1\/transfers\?profile=101/, reply: () => ok([{ id: 1, customerTransactionId: "other" }, { id: 555, customerTransactionId: "0b7c3a2e-5d1f-4c8e-9a6b-1f2e3d4c5b6a" }]) },
      { method: "GET", url: /\/v1\/transfers\/555$/, reply: () => ok({ id: 555, status: "processing" }) },
    ]);
    expect(await wisePayoutAdapter.getPayout(creds, lookup())).toMatchObject({ found: true, providerReference: "transfer:555", status: "processing" });
    fakeProvider([{ method: "GET", url: /\/v1\/transfers\?profile=101/, reply: () => ok([]) }]);
    expect(await wisePayoutAdapter.getPayout(creds, lookup())).toEqual({ found: false });
  });

  it("tests a connection against /v2/profiles and reports who it reached", async () => {
    fakeProvider([{ method: "GET", url: /\/v2\/profiles$/, reply: () => ok([{ id: 9, type: "personal", fullName: "Jo" }, { id: 10, type: "business", businessName: "Acme Ltd" }]) }]);
    expect(await wiseProviderAdapter.testConnection({ apiToken: "t1" })).toMatchObject({ ok: true, detail: expect.stringContaining("Acme Ltd") });
    fakeProvider([{ method: "GET", url: /\/v2\/profiles$/, reply: () => [401, { error: "invalid_token" }] }]);
    expect(await wiseProviderAdapter.testConnection({ apiToken: "bad" })).toMatchObject({ ok: false });
    expect(await wiseProviderAdapter.testConnection({})).toMatchObject({ ok: false, detail: expect.stringContaining("required") });
  });
});

/* ---------------------------------------------------------------------------
 * Airwallex
 * ------------------------------------------------------------------------- */

describe("Airwallex rail", () => {
  let n = 0;
  const creds = () => ({ clientId: `cid-${++n}`, apiKey: `key-${n}` }); // distinct per test: tokens are cached per credential
  const login: Handler = { method: "POST", url: /\/authentication\/login$/, reply: () => ok({ token: "aw-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }) };
  const create = (reply: Handler["reply"]): Handler => ({ method: "POST", url: /\/transfers\/create$/, reply });

  it("maps every supported beneficiary method to an Airwallex bank_details object", () => {
    expect(airwallexBeneficiary(BENEFICIARIES.bank_us)).toMatchObject({ type: "BANK_ACCOUNT", entity_type: "COMPANY", company_name: "Acme Supplies LLC", bank_details: { account_number: "1234567890", account_routing_type1: "aba", account_routing_value1: "021000021", bank_country_code: "US", account_currency: "USD" }, address: { country_code: "US", city: "Springfield", street_address: "1 Main St", postcode: "62701", state: "IL" } });
    expect(airwallexBeneficiary(BENEFICIARIES.gb)).toMatchObject({ entity_type: "PERSONAL", first_name: "Jane Q", last_name: "Doe", bank_details: { account_routing_type1: "sort_code", account_routing_value1: "200000" } });
    expect(airwallexBeneficiary(BENEFICIARIES.iban)).toMatchObject({ bank_details: { iban: "DE89370400440532013000", swift_code: "COBADEFFXXX" } });
    expect(airwallexBeneficiary(BENEFICIARIES.in_bank)).toMatchObject({ bank_details: { account_routing_type1: "ifsc", account_routing_value1: "HDFC0001234" } });
    for (const method of ["clabe", "pix", "crypto_address"] as const) expect(() => airwallexBeneficiary(BENEFICIARIES[method]), method).toThrow(/don't support/);
  });

  it("logs in once, sends the idempotent request_id, and reports the provider's own amounts", async () => {
    const c = creds();
    const fake = fakeProvider([login, create(() => ok({ id: "tr_1", status: "PROCESSING", amount_beneficiary_receives: 920.12, fee_amount: 3, fee_currency: "USD", short_reference_id: "P-1" }))]);
    const first = await airwallexPayoutAdapter.createPayout(c, request("bank_us"));
    expect(first).toMatchObject({ kind: "accepted", providerReference: "transfer:tr_1", status: "processing", recipientAmount: "920.12", feeAmount: "3", feeCurrency: "USD" });
    await airwallexPayoutAdapter.createPayout(c, request("bank_us", { idempotencyKey: "second-key" }));
    expect(fake.calls.filter((x) => x.url.endsWith("/authentication/login"))).toHaveLength(1);
    const createCall = fake.calls.find((x) => x.url.endsWith("/transfers/create"))!;
    expect(createCall.url.startsWith("https://api.sandbox.airwallex.com/")).toBe(true);
    expect(createCall.headers.get("authorization")).toBe("Bearer aw-token");
    expect(createCall.body).toMatchObject({ request_id: "0b7c3a2e-5d1f-4c8e-9a6b-1f2e3d4c5b6a", source_currency: "USD", source_amount: 1000, transfer_currency: "USD", transfer_method: "LOCAL", client_data: "pay_1" });
    expect(fake.calls.find((x) => x.url.endsWith("/authentication/login"))!.headers.get("x-api-key")).toMatch(/^key-/);
  });

  it("pays every supported method it advertises", async () => {
    for (const method of airwallexPayoutAdapter.supportedMethods) {
      fakeProvider([login, create(() => ok({ id: `tr_${method}`, status: "SCHEDULED" }))]);
      expect(await airwallexPayoutAdapter.createPayout(creds(), request(method)), method).toMatchObject({ kind: "accepted", providerReference: `transfer:tr_${method}` });
    }
  });

  it("never accepts a method it does not support", async () => {
    const fake = fakeProvider([login, create(() => ok({ id: "x" }))]);
    for (const method of ["clabe", "pix", "crypto_address"] as const) {
      expect(await airwallexPayoutAdapter.createPayout(creds(), request(method)), method).toMatchObject({ kind: "rejected", code: "unsupported_route" });
    }
    expect(fake.calls.filter((c) => c.url.endsWith("/transfers/create"))).toHaveLength(0);
  });

  it("does not send when it cannot authenticate, and says which failure it was", async () => {
    fakeProvider([{ method: "POST", url: /login$/, reply: () => [401, { message: "bad key" }] }]);
    expect(await airwallexPayoutAdapter.createPayout(creds(), request("bank_us"))).toMatchObject({ kind: "rejected", code: "provider_auth_failed" });
    fakeProvider([{ method: "POST", url: /login$/, reply: () => [503, {}] }]);
    expect(await airwallexPayoutAdapter.createPayout(creds(), request("bank_us"))).toMatchObject({ kind: "rejected", code: "provider_unavailable" });
    fakeProvider([]);
    expect(await airwallexPayoutAdapter.createPayout({}, request("bank_us"))).toMatchObject({ kind: "rejected", code: "connection_incomplete" });
  });

  it("classifies the create response: compliance never reroutes, duplicates reconcile, outages are unknown", async () => {
    fakeProvider([login, create(() => [403, { message: "sanctions hit" }])]);
    expect(await airwallexPayoutAdapter.createPayout(creds(), request("bank_us"))).toMatchObject({ kind: "rejected", retryableElsewhere: false });
    fakeProvider([login, create(() => [400, { code: "duplicate_request", message: "request_id already used" }])]);
    expect((await airwallexPayoutAdapter.createPayout(creds(), request("bank_us"))).kind).toBe("unknown");
    fakeProvider([login, create(() => [504, {}])]);
    expect((await airwallexPayoutAdapter.createPayout(creds(), request("bank_us"))).kind).toBe("unknown");
    fakeProvider([login, create(() => [400, { message: "insufficient balance" }])]);
    expect(await airwallexPayoutAdapter.createPayout(creds(), request("bank_us"))).toMatchObject({ kind: "rejected", retryableElsewhere: true });
  });

  it("maps every Airwallex transfer status and resolves an unknown attempt by request_id (never by re-sending)", async () => {
    const expectations: Record<string, string> = { IN_APPROVAL: "processing", SCHEDULED: "processing", PROCESSING: "processing", SENT: "processing", OVERDUE: "awaiting_funds", PAID: "completed", FAILED: "failed", APPROVAL_REJECTED: "failed", APPROVAL_BLOCKED: "failed", APPROVAL_RECALLED: "cancelled", CANCELLED: "cancelled" };
    for (const [status, expected] of Object.entries(expectations)) {
      fakeProvider([login, { method: "GET", url: /\/transfers\/tr_1$/, reply: () => ok({ id: "tr_1", status, failure: status === "FAILED" ? { message: "Bank rejected" } : undefined }) }]);
      const result = await airwallexPayoutAdapter.getPayout(creds(), lookup({ providerReference: "transfer:tr_1" }));
      expect(result, status).toMatchObject({ found: true, status: expected });
    }
    const fake = fakeProvider([login, { method: "GET", url: /\/transfers\?from_created_at=/, reply: () => ok({ items: [{ id: "tr_9", request_id: "0b7c3a2e-5d1f-4c8e-9a6b-1f2e3d4c5b6a", status: "PAID" }] }) }]);
    expect(await airwallexPayoutAdapter.getPayout(creds(), lookup())).toMatchObject({ found: true, providerReference: "transfer:tr_9", status: "completed" });
    expect(fake.calls.some((c) => c.method === "POST" && c.url.endsWith("/transfers/create"))).toBe(false);
    fakeProvider([login, { method: "GET", url: /\/transfers\?/, reply: () => ok({ items: [] }) }]);
    expect(await airwallexPayoutAdapter.getPayout(creds(), lookup())).toEqual({ found: false });
  });

  it("prices a pair through the customer's own FX quote and signs the spread by which side is bought", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const toInr = airwallexQuoteToUnified({ quote_id: "q1", currency_pair: "USDINR", client_rate: 83.4, mid_rate: 83.5, buy_amount: 83400, valid_to_at: "2026-10-01T00:01:00+0000" }, { sourceAsset: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000 }, now);
    expect(toInr).toMatchObject({ providerSlug: "airwallex", providerQuoteId: "q1", recipientAmount: 83400, costPartial: true, accountContext: "customer_connected", expiresAt: "2026-10-01T00:01:00.000Z" });
    expect(toInr.fxSpreadAmount).toBeGreaterThan(0);
    const toUsd = airwallexQuoteToUnified({ currency_pair: "USDINR", client_rate: 83.6, mid_rate: 83.5, buy_amount: 12, valid_to_at: "2026-10-01T00:01:00+0000" }, { sourceAsset: "INR", destinationCurrency: "USD", destinationCountry: "US", amount: 1000 }, now);
    expect(toUsd.fxSpreadAmount).toBeGreaterThan(0);
  });

  it("tests a connection and requests live FX quotes through the documented endpoints", async () => {
    fakeProvider([login, { method: "GET", url: /balances\/current$/, reply: () => ok([{ currency: "USD", available_amount: 5 }, { currency: "EUR", available_amount: 0 }]) }]);
    expect(await airwallexProviderAdapter.testConnection(creds())).toMatchObject({ ok: true, detail: expect.stringContaining("USD") });
    fakeProvider([{ method: "POST", url: /login$/, reply: () => [401, { message: "nope" }] }]);
    expect(await airwallexProviderAdapter.testConnection(creds())).toMatchObject({ ok: false });
    const fake = fakeProvider([login, { method: "POST", url: /fx\/quotes\/create$/, reply: () => ok({ quote_id: "q", currency_pair: "USDEUR", client_rate: 0.92, mid_rate: 0.921, buy_amount: 920, valid_to_at: "2026-10-01T00:01:00+0000" }) }]);
    const q = await airwallexProviderAdapter.getQuote!(creds(), { sourceAsset: "USD", destinationCurrency: "EUR", destinationCountry: "DE", amount: 1000 });
    expect(q.recipientAmount).toBe(920);
    expect(fake.calls.find((c) => c.url.endsWith("/fx/quotes/create"))!.body).toMatchObject({ sell_currency: "USD", buy_currency: "EUR", sell_amount: 1000 });
    await expect(airwallexProviderAdapter.getQuote!(creds(), { sourceAsset: "USDC", destinationCurrency: "EUR", destinationCountry: "DE", amount: 10 })).rejects.toThrow(/fiat/);
  });
});

/* ---------------------------------------------------------------------------
 * Circle
 * ------------------------------------------------------------------------- */

describe("Circle rail", () => {
  const creds = { apiKey: "circle-key" };

  it("registers a stablecoin recipient on every supported chain, and refuses others", async () => {
    const chains: Record<string, string> = { ethereum: "ETH", base: "BASE", polygon: "MATIC", solana: "SOL", arbitrum: "ARB", avalanche: "AVAX", optimism: "OP", stellar: "XLM", tron: "TRX" };
    for (const [network, chain] of Object.entries(chains)) {
      const fake = fakeProvider([{ method: "POST", url: /\/v1\/addressBook\/recipients$/, reply: () => ok({ data: { id: "rcp-1" } }) }]);
      const result = await circlePayoutAdapter.ensureBeneficiary!(creds, { ...BENEFICIARIES.crypto_address, network }, { environment: "sandbox", idempotencyKey: "idem" });
      expect(result, network).toEqual({ providerRef: "recipient:rcp-1" });
      expect(fake.calls[0]!.body).toMatchObject({ idempotencyKey: "idem", chain, address: BENEFICIARIES.crypto_address.details.address });
      expect(fake.calls[0]!.url.startsWith("https://api-sandbox.circle.com/")).toBe(true);
    }
    await expect(circlePayoutAdapter.ensureBeneficiary!(creds, { ...BENEFICIARIES.crypto_address, network: "dogechain" }, { environment: "sandbox", idempotencyKey: "i" })).rejects.toThrow(/supported chain/);
  });

  it("registers a US wire account and pays it from a USDC balance", async () => {
    const fake = fakeProvider([
      { method: "POST", url: /\/v1\/businessAccount\/banks\/wires$/, reply: () => [201, { data: { id: "wire-1" } }] },
      { method: "POST", url: /\/v1\/businessAccount\/payouts$/, reply: () => [201, { data: { id: "po-1", status: "pending", fees: { amount: "2.50", currency: "USD" } } }] },
    ]);
    const ref = await circlePayoutAdapter.ensureBeneficiary!(creds, BENEFICIARIES.bank_us, { environment: "sandbox", idempotencyKey: "idem" });
    expect(ref).toEqual({ providerRef: "wire:wire-1" });
    expect(fake.calls[0]!.body).toMatchObject({ accountNumber: "1234567890", routingNumber: "021000021", billingDetails: { name: "Acme Supplies LLC", country: "US" } });
    const outcome = await circlePayoutAdapter.createPayout(creds, request("bank_us", { sourceCurrency: "USDC", beneficiaryProviderRef: "wire:wire-1" }));
    expect(outcome).toMatchObject({ kind: "accepted", providerReference: "wire:po-1", status: "processing", feeAmount: "2.50", feeCurrency: "USD" });
    expect(fake.calls[1]!.body).toMatchObject({ idempotencyKey: "0b7c3a2e-5d1f-4c8e-9a6b-1f2e3d4c5b6a", destination: { type: "wire", id: "wire-1" }, amount: { amount: "1000.00", currency: "USD" } });
  });

  it("pays a stablecoin address-book recipient, optionally from a named wallet", async () => {
    const fake = fakeProvider([{ method: "POST", url: /\/v1\/payouts$/, reply: () => [201, { data: { id: "po-2", status: "pending" } }] }]);
    const outcome = await circlePayoutAdapter.createPayout({ ...creds, walletId: "w-9" }, request("crypto_address", { destinationCurrency: "USDC", beneficiaryProviderRef: "recipient:rcp-1" }));
    expect(outcome).toMatchObject({ kind: "accepted", providerReference: "payout:po-2", status: "processing" });
    expect(fake.calls[0]!.body).toMatchObject({ source: { type: "wallet", id: "w-9" }, destination: { type: "address_book", id: "rcp-1" }, amount: { amount: "1000.00", currency: "USD" }, toAmount: { currency: "USD" }, metadata: { customerExternalRef: "pay_1" } });
  });

  it("never pays a different currency than the payment promised", async () => {
    const fake = fakeProvider([{ method: "POST", url: /payouts$/, reply: () => [201, { data: { id: "po", status: "pending" } }] }]);
    // USDC source wired to a EUR beneficiary would silently deliver USD to a euro account.
    expect(await circlePayoutAdapter.createPayout(creds, request("iban", { sourceCurrency: "USDC", beneficiaryProviderRef: "wire:w1" }))).toMatchObject({ kind: "rejected", code: "unsupported_route" });
    // A stablecoin payout to an address must land in the same currency it was funded in.
    expect(await circlePayoutAdapter.createPayout(creds, request("crypto_address", { destinationCurrency: "EURC", beneficiaryProviderRef: "recipient:r" }))).toMatchObject({ kind: "rejected", code: "unsupported_route" });
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses unsupported source currencies and unregistered recipients without calling Circle", async () => {
    const fake = fakeProvider([]);
    expect(await circlePayoutAdapter.createPayout(creds, request("bank_us", { sourceCurrency: "GBP", beneficiaryProviderRef: "wire:w" }))).toMatchObject({ kind: "rejected", code: "unsupported_route" });
    expect(await circlePayoutAdapter.createPayout(creds, request("bank_us", { sourceCurrency: "USDC", beneficiaryProviderRef: undefined }))).toMatchObject({ kind: "rejected", code: "beneficiary_unregistered" });
    expect(await circlePayoutAdapter.createPayout({}, request("bank_us", { sourceCurrency: "USDC", beneficiaryProviderRef: "wire:w" }))).toMatchObject({ kind: "rejected", code: "connection_incomplete" });
    expect(fake.calls).toHaveLength(0);
  });

  it("does not register methods it cannot pay", async () => {
    const fake = fakeProvider([{ method: "POST", url: /.*/, reply: () => ok({ data: { id: "x" } }) }]);
    for (const method of ["gb", "clabe", "pix", "in_bank", "iban"] as const) {
      await expect(circlePayoutAdapter.ensureBeneficiary!(creds, BENEFICIARIES[method], { environment: "sandbox", idempotencyKey: "i" }), method).rejects.toThrow();
    }
    expect(fake.calls).toHaveLength(0);
    expect(circlePayoutAdapter.supportedMethods.sort()).toEqual(["bank_us", "crypto_address"]);
  });

  it("classifies provider responses and maps payout status for both payout kinds", async () => {
    fakeProvider([{ method: "POST", url: /payouts$/, reply: () => [403, { message: "blocked" }] }]);
    expect(await circlePayoutAdapter.createPayout(creds, request("crypto_address", { destinationCurrency: "USDC", beneficiaryProviderRef: "recipient:r" }))).toMatchObject({ kind: "rejected", retryableElsewhere: false });
    fakeProvider([{ method: "POST", url: /payouts$/, reply: () => [500, {}] }]);
    expect((await circlePayoutAdapter.createPayout(creds, request("crypto_address", { destinationCurrency: "USDC", beneficiaryProviderRef: "recipient:r" }))).kind).toBe("unknown");

    for (const [status, expected] of [["pending", "processing"], ["complete", "completed"], ["failed", "failed"]] as const) {
      fakeProvider([{ method: "GET", url: /\/v1\/payouts\/po-1$/, reply: () => ok({ data: { id: "po-1", status, errorCode: status === "failed" ? "insufficient_funds" : undefined } }) }]);
      expect(await circlePayoutAdapter.getPayout(creds, lookup({ providerReference: "payout:po-1" })), status).toMatchObject({ found: true, status: expected });
    }
    const fake = fakeProvider([{ method: "GET", url: /\/v1\/businessAccount\/payouts\/po-2$/, reply: () => ok({ data: { id: "po-2", status: "complete" } }) }]);
    expect(await circlePayoutAdapter.getPayout(creds, lookup({ providerReference: "wire:po-2" }))).toMatchObject({ found: true, status: "completed" });
    expect(fake.unexpected()).toEqual([]);
    expect(await circlePayoutAdapter.getPayout(creds, lookup())).toEqual({ found: false });
  });
});

/* ---------------------------------------------------------------------------
 * Bridge
 * ------------------------------------------------------------------------- */

describe("Bridge rail", () => {
  const creds = { apiKey: "bridge-key", customerId: "cust_1" };
  const transfers: Handler = { method: "POST", url: /\/v0\/transfers$/, reply: () => [201, { id: "tr_1", state: "payment_submitted", currency: "usd", receipt: { final_amount: "990.00", developer_fee: "1", exchange_fee: "0.5", gas_fee: "0" } }] };

  it("registers an external account in the published shape for each fiat method", async () => {
    const expected: Record<string, Record<string, unknown>> = {
      bank_us: { currency: "usd", account_type: "us", account: { account_number: "1234567890", routing_number: "021000021", checking_or_savings: "checking" } },
      iban: { currency: "eur", account_type: "iban", iban: { account_number: "DE89 3704 0044 0532 0130 00", bic: "COBADEFFXXX", country: "DEU" } },
      gb: { currency: "gbp", account_type: "gb", account: { account_number: "55779911", sort_code: "20-00-00" } },
      clabe: { currency: "mxn", account_type: "clabe", clabe: { account_number: "032180000118359719" } },
      pix: { currency: "brl", account_type: "pix", pix_key: { pix_key: "joao@example.com", document_number: "12345678909" } },
    };
    for (const [method, shape] of Object.entries(expected)) {
      const fake = fakeProvider([{ method: "POST", url: /\/customers\/cust_1\/external_accounts$/, reply: () => [201, { id: `ext_${method}` }] }]);
      const ref = await bridgePayoutAdapter.ensureBeneficiary!(creds, BENEFICIARIES[method as keyof typeof BENEFICIARIES], { environment: "sandbox", idempotencyKey: `idem-${method}` });
      expect(ref, method).toEqual({ providerRef: `ext_${method}` });
      expect(fake.calls[0]!.headers.get("idempotency-key")).toBe(`idem-${method}`);
      expect(fake.calls[0]!.headers.get("api-key")).toBe("bridge-key");
      expect(fake.calls[0]!.body, method).toMatchObject(shape);
    }
    const none = fakeProvider([]);
    expect(await bridgePayoutAdapter.ensureBeneficiary!(creds, BENEFICIARIES.crypto_address, { environment: "sandbox", idempotencyKey: "i" })).toEqual({ providerRef: "onchain" });
    expect(none.calls).toHaveLength(0);
    await expect(bridgePayoutAdapter.ensureBeneficiary!(creds, BENEFICIARIES.in_bank, { environment: "sandbox", idempotencyKey: "i" })).rejects.toThrow(/do not support in_bank/);
    await expect(bridgePayoutAdapter.ensureBeneficiary!({ apiKey: "k" }, BENEFICIARIES.iban, { environment: "sandbox", idempotencyKey: "i" })).rejects.toThrow(/customer id/);
  });

  it("sends each fiat rail to the matching Bridge payment rail, funded from a prefunded wallet", async () => {
    const rails: Record<string, { rail: string; currency: string }> = { bank_us: { rail: "ach", currency: "usd" }, iban: { rail: "sepa", currency: "eur" }, gb: { rail: "faster_payments", currency: "gbp" }, clabe: { rail: "spei", currency: "mxn" }, pix: { rail: "pix", currency: "brl" } };
    for (const [method, spec] of Object.entries(rails)) {
      const fake = fakeProvider([transfers]);
      const outcome = await bridgePayoutAdapter.createPayout({ ...creds, bridgeWalletId: "wallet_1" }, request(method as keyof typeof BENEFICIARIES, { beneficiaryProviderRef: `ext_${method}` }));
      expect(outcome, method).toMatchObject({ kind: "accepted", providerReference: "tr_1", status: "processing", recipientAmount: "990.00", feeAmount: "1.50", feeCurrency: "USD" });
      expect(fake.calls[0]!.body, method).toMatchObject({ amount: "1000.00", on_behalf_of: "cust_1", client_reference_id: "pay_1", source: { payment_rail: "bridge_wallet", bridge_wallet_id: "wallet_1" }, destination: { payment_rail: spec.rail, currency: spec.currency, external_account_id: `ext_${method}` } });
    }
  });

  it("trims references to each rail's limit", async () => {
    const fake = fakeProvider([transfers]);
    await bridgePayoutAdapter.createPayout({ ...creds, bridgeWalletId: "w" }, request("bank_us", { reference: "Invoice 4471 for March services" }));
    expect(fake.calls[0]!.body.destination.ach_reference).toBe("Invoice 44");
    await bridgePayoutAdapter.createPayout({ ...creds, bridgeWalletId: "w" }, request("iban", { reference: "x".repeat(200) }));
    expect(fake.calls[1]!.body.destination.sepa_reference).toHaveLength(140);
  });

  it("funds stablecoin payouts from the named network, including Avalanche's alias", async () => {
    const fake = fakeProvider([transfers]);
    await bridgePayoutAdapter.createPayout(creds, request("crypto_address", { sourceNetwork: "avalanche", destinationCurrency: "USDC", beneficiaryProviderRef: "onchain" }));
    expect(fake.calls[0]!.body).toMatchObject({ source: { payment_rail: "avalanche_c_chain", currency: "usdc" }, destination: { payment_rail: "base", to_address: BENEFICIARIES.crypto_address.details.address } });
  });

  it("refuses routes it cannot carry correctly, without calling Bridge", async () => {
    const fake = fakeProvider([transfers]);
    // wrong currency for the rail: an ACH beneficiary is paid in USD only
    expect(await bridgePayoutAdapter.createPayout({ ...creds, bridgeWalletId: "w" }, request("bank_us", { destinationCurrency: "EUR" }))).toMatchObject({ kind: "rejected", code: "unsupported_route" });
    // fiat source with no prefunded wallet
    expect(await bridgePayoutAdapter.createPayout(creds, request("bank_us"))).toMatchObject({ kind: "rejected", code: "unsupported_route" });
    // stablecoin source on an unsupported network
    expect(await bridgePayoutAdapter.createPayout(creds, request("crypto_address", { sourceNetwork: "dogechain" }))).toMatchObject({ kind: "rejected", code: "unsupported_route" });
    // unregistered fiat beneficiary
    expect(await bridgePayoutAdapter.createPayout({ ...creds, bridgeWalletId: "w" }, request("iban", { beneficiaryProviderRef: undefined }))).toMatchObject({ kind: "rejected", code: "unsupported_route" });
    // incomplete connection
    expect(await bridgePayoutAdapter.createPayout({ apiKey: "k" }, request("iban"))).toMatchObject({ kind: "rejected", code: "connection_incomplete" });
    expect(fake.calls).toHaveLength(0);
  });

  it("maps every Bridge transfer state and leaves unmapped states undefined instead of guessing", async () => {
    const expectations: Record<string, string> = { awaiting_funds: "awaiting_funds", in_review: "processing", funds_received: "processing", payment_submitted: "processing", payment_processed: "completed", canceled: "cancelled", undeliverable: "failed", returned: "returned", refund_in_flight: "returned", refunded: "returned", refund_failed: "returned" };
    for (const [state, expected] of Object.entries(expectations)) {
      fakeProvider([{ method: "GET", url: /\/transfers\/tr_1$/, reply: () => ok({ id: "tr_1", state }) }]);
      expect(await bridgePayoutAdapter.getPayout(creds, lookup({ providerReference: "tr_1" })), state).toMatchObject({ found: true, status: expected });
    }
    fakeProvider([{ method: "GET", url: /\/transfers\/tr_1$/, reply: () => ok({ id: "tr_1", state: "brand_new_state" }) }]);
    expect((await bridgePayoutAdapter.getPayout(creds, lookup({ providerReference: "tr_1" }))).status).toBeUndefined();
    expect(bridgePayoutAdapter.parseWebhook!(JSON.stringify({ event_id: "e", event_category: "transfer", event_object_id: "tr_1", event_object_status: "brand_new_state" }))).toMatchObject({ status: null });
    expect(bridgePayoutAdapter.parseWebhook!(JSON.stringify({ event_id: "e", event_category: "customer", event_object_id: "c" }))).toBeNull();
    expect(bridgePayoutAdapter.parseWebhook!("not json")).toBeNull();
    expect(await bridgePayoutAdapter.getPayout(creds, lookup())).toEqual({ found: false });
  });
});

/* ---------------------------------------------------------------------------
 * Railor's test rail
 * ------------------------------------------------------------------------- */

describe("Railor sandbox rail", () => {
  const at = (amount: string) => request("iban", { amount, idempotencyKey: crypto.randomUUID(), sourceCurrency: "USDC" });
  const statusAfter = async (ref: string, ms: number) => {
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + ms);
    const result = await sandboxPayoutAdapter.getPayout({}, lookup({ providerReference: ref }));
    vi.restoreAllMocks();
    return result;
  };

  it("plays every scenario the cents encode", async () => {
    expect(await sandboxPayoutAdapter.createPayout({}, at("50.13"))).toMatchObject({ kind: "rejected", code: "insufficient_funds", retryableElsewhere: true });
    expect(await sandboxPayoutAdapter.createPayout({}, at("50.66"))).toMatchObject({ kind: "rejected", code: "compliance_rejected", retryableElsewhere: false });
    expect((await sandboxPayoutAdapter.createPayout({}, at("50.99"))).kind).toBe("unknown");

    const plain = await sandboxPayoutAdapter.createPayout({}, at("50.00"));
    if (plain.kind !== "accepted") throw new Error("expected acceptance");
    expect(plain.status).toBe("processing");
    expect((await statusAfter(plain.providerReference, 5_000)).status).toBe("processing");
    expect((await statusAfter(plain.providerReference, 25_000)).status).toBe("completed");

    const funds = await sandboxPayoutAdapter.createPayout({}, at("50.55"));
    if (funds.kind !== "accepted") throw new Error("expected acceptance");
    expect(funds).toMatchObject({ status: "awaiting_funds", depositInstructions: expect.objectContaining({ amount: "50.55" }) });
    expect((await statusAfter(funds.providerReference, 5_000)).status).toBe("awaiting_funds");
    expect((await statusAfter(funds.providerReference, 25_000)).status).toBe("processing");
    expect((await statusAfter(funds.providerReference, 45_000)).status).toBe("completed");

    const returned = await sandboxPayoutAdapter.createPayout({}, at("50.77"));
    if (returned.kind !== "accepted") throw new Error("expected acceptance");
    expect((await statusAfter(returned.providerReference, 25_000)).status).toBe("completed");
    expect(await statusAfter(returned.providerReference, 45_000)).toMatchObject({ status: "returned", failureMessage: expect.stringContaining("returned") });
  });

  it("finds a simulated timeout by its idempotency key, and ignores references that are not its own", async () => {
    const req = at("50.99");
    expect((await sandboxPayoutAdapter.createPayout({}, req)).kind).toBe("unknown");
    expect(await sandboxPayoutAdapter.getPayout({}, lookup({ idempotencyKey: req.idempotencyKey }))).toMatchObject({ found: true, providerReference: expect.stringMatching(/^sim_ok_/) });
    expect(await sandboxPayoutAdapter.getPayout({}, lookup({ providerReference: "tr_from_a_real_provider" }))).toEqual({ found: false });
  });

  it("quotes honestly as Railor-observed, never as a provider price", async () => {
    const quote = await sandboxPayoutAdapter.quote!({}, at("200.00"));
    expect(quote).toMatchObject({ providerSlug: "railor-sandbox", accountContext: "railor_network", verificationType: "railor_observed", feeAmount: 1 });
  });
});

/* ---------------------------------------------------------------------------
 * Cross-rail invariants
 * ------------------------------------------------------------------------- */

describe("every rail, every beneficiary method", () => {
  const methods = Object.keys(BENEFICIARIES) as Array<keyof typeof BENEFICIARIES>;
  const adapters: Array<[string, PayoutAdapter]> = [...Object.entries(PAYOUT_ADAPTERS), ["railor-sandbox", sandboxPayoutAdapter]];

  it("registers exactly the rails Railor advertises", () => {
    expect(Object.keys(PAYOUT_ADAPTERS).sort()).toEqual(["airwallex", "bridge", "circle", "wise"]);
    for (const [slug, adapter] of adapters) {
      expect(adapter.slug === slug || slug === "railor-sandbox", slug).toBe(true);
      expect(adapter.supportedMethods.length, slug).toBeGreaterThan(0);
    }
  });

  it("only registers a beneficiary with a provider that can pay that method", async () => {
    for (const [slug, adapter] of adapters) {
      if (!adapter.ensureBeneficiary) continue;
      for (const method of methods) {
        fakeProvider([{ method: "POST", url: /.*/, reply: () => [201, { id: "x", data: { id: "x" } }] }]);
        const attempt = adapter.ensureBeneficiary({ apiKey: "k", apiToken: "t", profileId: "1", customerId: "c", clientId: "i" }, BENEFICIARIES[method], { environment: "sandbox", idempotencyKey: "i" });
        if (adapter.supportedMethods.includes(method)) await expect(attempt, `${slug} should register ${method}`).resolves.toBeDefined();
        else await expect(attempt, `${slug} must refuse ${method}`).rejects.toThrow();
      }
    }
  });
});
