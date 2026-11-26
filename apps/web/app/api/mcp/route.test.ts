import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  charge: vi.fn(),
  priceCheck: vi.fn(),
  quotes: vi.fn(),
  cashOut: vi.fn(),
  providerBySlug: vi.fn(),
  corridors: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/api-auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../lib/api-auth")>()), authenticate: mocks.authenticate }));
vi.mock("../../../lib/wallet", () => ({ chargeWalletUsage: mocks.charge }));
vi.mock("../../../lib/pricing", () => ({ runPriceCheck: mocks.priceCheck }));
vi.mock("../../../lib/india-exchange-quotes", () => ({ indiaExchangeQuotes: mocks.quotes }));
vi.mock("../../../lib/stablecoin-cash-out-quotes", () => ({ stablecoinCashOutQuote: mocks.cashOut }));
vi.mock("@railor/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@railor/core")>()),
  loadProviderBySlug: mocks.providerBySlug,
  searchCorridors: mocks.corridors,
}));

const { GET, POST } = await import("./route");
const { ApiError } = await import("../../../lib/api-auth");

const ctx = { organizationId: "org-1", keyId: "key-1", mode: "test" as const, requestId: "req_1" };
const rpc = (body: unknown, headers: Record<string, string> = { authorization: "Bearer rail_test_x" }) =>
  POST(new Request("http://localhost/api/mcp", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const call = (name: string, args: Record<string, unknown> = {}) => rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } });
const toolBody = async (response: Response) => {
  const json = await response.json();
  const text = json.result.content[0].text as string;
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* plain-text error */ }
  return { isError: json.result.isError as boolean, data };
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.authenticate.mockResolvedValue(ctx);
  mocks.charge.mockResolvedValue({ charged: false, reason: "not_metered" });
});

describe("MCP protocol", () => {
  it("negotiates the client's protocol version, or offers the newest it speaks", async () => {
    const init = (protocolVersion: string) => rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion, capabilities: {}, clientInfo: { name: "t", version: "1" } } });
    expect((await (await init("2025-03-26")).json()).result.protocolVersion).toBe("2025-03-26");
    expect((await (await init("2099-01-01")).json()).result.protocolVersion).toBe("2025-06-18");
    expect((await (await init("2025-06-18")).json()).result).toMatchObject({ capabilities: { tools: {} }, serverInfo: { name: "railor" } });
  });

  it("tells a client with no credentials how to sign in (OAuth discovery), before any method runs", async () => {
    const response = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, {});
    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toContain('resource_metadata="');
    expect(challenge).toContain("/.well-known/oauth-protected-resource/api/mcp");
    expect(challenge).not.toContain("error=");
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect((await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" }, {})).status).toBe(401);
  });

  it("answers ping and acknowledges notifications with 202", async () => {
    const ping = await rpc({ jsonrpc: "2.0", id: 2, method: "ping" });
    expect(ping.status).toBe(200);
    expect(await ping.json()).toEqual({ jsonrpc: "2.0", id: 2, result: {} });
    const note = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, {});
    expect(note.status).toBe(202);
    expect(await note.text()).toBe("");
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("lists the price tools beside the catalog tools, and reports unknown methods as JSON-RPC errors", async () => {
    const tools = (await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" })).json()).result.tools.map((t: { name: string }) => t.name);
    expect(tools.slice(0, 2)).toEqual(["compare_prices", "stablecoin_offramps"]);
    expect(tools).toContain("search_corridors");
    const unknown = await rpc({ jsonrpc: "2.0", id: 4, method: "sampling/createMessage" });
    expect((await unknown.json()).error).toMatchObject({ code: -32601 });
    expect((await (await rpc("{not json", {})).json()).error.code).toBe(-32700);
  });

  it("refuses an SSE stream on GET but still describes itself", async () => {
    expect((await GET(new Request("http://localhost/api/mcp", { headers: { accept: "text/event-stream" } }))).status).toBe(405);
    expect(await (await GET(new Request("http://localhost/api/mcp"))).json()).toMatchObject({ name: "railor", transport: "streamable-http" });
  });

  it("asks for a key on tool calls, with a WWW-Authenticate header", async () => {
    mocks.authenticate.mockRejectedValue(new ApiError(401, "missing_api_key", "Provide an API key"));
    const response = await call("get_supported_countries");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });
});

describe("MCP tools", () => {
  it("marks a failed tool as isError instead of returning an error object as data", async () => {
    mocks.providerBySlug.mockResolvedValue(null);
    expect(await toolBody(await call("get_provider_capabilities", { provider: "nope" }))).toMatchObject({ isError: true, data: expect.stringContaining("search_providers") });
    expect((await (await call("not_a_tool")).json()).error.code).toBe(-32602);
  });

  it("separates an unknown provider from one with no mapped route", async () => {
    mocks.corridors.mockResolvedValue({ results: [], providersChecked: 0, counts: {} });
    mocks.providerBySlug.mockResolvedValue(null);
    expect((await toolBody(await call("check_eligibility", { provider: "ghost" }))).isError).toBe(true);
    mocks.providerBySlug.mockResolvedValue({ provider: { slug: "wise" } });
    expect(await toolBody(await call("check_eligibility", { provider: "wise" }))).toMatchObject({ isError: false, data: { eligibility: "unknown", reason: expect.stringContaining("no mapped capability") } });
  });

  it("compares prices for the key's workspace with the profile, and validates the arguments", async () => {
    mocks.priceCheck.mockResolvedValue({
      input: { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1700 },
      reference: { rate: 93.44, source: "Wise", observedAt: "2026-11-24T10:00:00Z" },
      rows: [{ providerSlug: "infinity", providerName: "Infinity", basis: "published", recipientAmount: 158_000, feeAmount: 8.5, feeCurrency: "USD", rate: 93.44, totalCostPct: 0.5, partial: false, delivery: null, observedAt: "2026-11-18T00:00:00Z", source: { label: "Infinity", url: "https://www.infinityapp.in/" }, notes: [], product: { id: "infinity:published", label: "Infinity · receive by bank transfer" }, taxIncluded: true, receipt: "FIRA (free, automatic)", profileAssessment: { status: "documented" } }],
      unavailable: [],
      generatedAt: "2026-11-24T10:00:01Z",
    });
    const result = await toolBody(await call("compare_prices", { source_currency: "usd", destination_currency: "INR", amount: 1700, context: { profile: "freelancer", country: "IN", direction: "receive", purpose: "services", payment_method: "local_bank" } }));
    expect(result.isError).toBe(false);
    expect(mocks.priceCheck).toHaveBeenCalledWith("org-1", expect.objectContaining({ sourceCurrency: "USD", amount: 1700, context: expect.objectContaining({ profile: "freelancer", paymentMethod: "local_bank" }) }));
    expect(result.data).toMatchObject({ scope: "profile_specific", prices: [{ provider: "infinity", basis: "published", recipient_amount: 158_000, receipt: "FIRA (free, automatic)", eligibility: "documented" }] });

    expect((await toolBody(await call("compare_prices", { source_currency: "USD", destination_currency: "USD", amount: 10 }))).isError).toBe(true);
    expect((await toolBody(await call("compare_prices", { source_currency: "USD", destination_currency: "INR", amount: -1 }))).isError).toBe(true);
    expect((await toolBody(await call("compare_prices", { source_currency: "USD", destination_currency: "INR", amount: 10, context: { profile: "alien" } }))).isError).toBe(true);
  });

  it("returns live Indian exchange quotes for USDT and refuses a network the coin isn't on", async () => {
    mocks.quotes.mockResolvedValue({ quotes: [{ slug: "wazirx", name: "WazirX", status: "priced" }], reference: { rate: 93.44 } });
    const result = await toolBody(await call("stablecoin_offramps", { asset: "usdt", network: "tron", amount: 1000 }));
    expect(result).toMatchObject({ isError: false, data: { destination: "INR", exchanges: [{ slug: "wazirx" }] } });
    expect(mocks.quotes).toHaveBeenCalledWith("USDT", "tron", 1000);
    expect((await toolBody(await call("stablecoin_offramps", { asset: "USDT", network: "dogechain", amount: 10 }))).isError).toBe(true);
  });
});

describe("MCP wallet metering", () => {
  it("charges each tool call once, by request id, and stops when the wallet is empty", async () => {
    mocks.providerBySlug.mockResolvedValue(null);
    await call("get_provider_capabilities", { provider: "x" });
    expect(mocks.charge).toHaveBeenCalledWith("org-1", "api_request", { idempotencyKey: "req_1" });

    mocks.charge.mockResolvedValue({ charged: false, reason: "insufficient_balance", balanceCents: 0 });
    mocks.providerBySlug.mockClear();
    const result = await toolBody(await call("get_provider_capabilities", { provider: "wise" }));
    expect(result).toMatchObject({ isError: true, data: expect.stringContaining("wallet balance is too low") });
    expect(mocks.providerBySlug).not.toHaveBeenCalled();
  });

  it("does not charge discovery calls", async () => {
    await rpc({ jsonrpc: "2.0", id: 9, method: "tools/list" });
    await rpc({ jsonrpc: "2.0", id: 10, method: "ping" }, {});
    expect(mocks.charge).not.toHaveBeenCalled();
  });
});
