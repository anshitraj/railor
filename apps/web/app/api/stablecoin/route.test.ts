import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ quotes: vi.fn(), session: vi.fn(), limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/india-exchange-quotes", () => ({ indiaExchangeQuotes: mocks.quotes }));
vi.mock("../../../lib/auth", () => ({ getSession: mocks.session }));
vi.mock("../../../lib/rate-limit", () => ({ consumeLimit: mocks.limit, requestIdentity: () => "test" }));

const { GET } = await import("./route");

const support = { status: "yes", note: "Listed by WazirX" };
const priced = { slug: "wazirx", name: "WazirX", support, status: "priced", checkedAt: "2026-11-18T13:58:10.000Z", breakdown: { inBank: 101330.9 }, live: { bid: 102.85, gapPct: 10.07, depth: "book" } };
const none = { slug: "suncrypto", name: "SunCrypto", support: { status: "unknown", note: "" }, status: "unavailable", checkedAt: "x", reason: "No live price. SunCrypto’s public ticker lists a bid above its ask" };
const reference = { rate: 93.44, source: "Wise's public rate (mid-market)", observedAt: "2026-11-18T13:58:00.000Z" };
const request = (query = "asset=USDT&network=tron&amount=1000") => new Request(`http://localhost/api/stablecoin?${query}`);

beforeEach(() => {
  for (const mock of [mocks.quotes, mocks.session, mocks.limit]) mock.mockReset();
  mocks.limit.mockResolvedValue(true);
  mocks.quotes.mockResolvedValue({ quotes: [priced, none], reference });
});

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/stablecoin", () => {
  it("returns no cash-out market data to a guest", async () => {
    const fetchBook = vi.fn();
    vi.stubGlobal("fetch", fetchBook);
    mocks.session.mockResolvedValue(null);
    const body = await (await GET(request("asset=USDC&network=solana&amount=1000&dest=EUR"))).json();
    expect(body).toEqual({ locked: true });
    expect(fetchBook).not.toHaveBeenCalled();
    expect(mocks.quotes).not.toHaveBeenCalled();
  });

  it("fills the amount across bids and subtracts trading and withdrawal fees", async () => {
    mocks.session.mockResolvedValue({ user: { id: "U" } });
    const fetchBook = vi.fn().mockResolvedValue(Response.json({ error: [], result: { USDCEUR: { bids: [
      ["0.90", "400", 1795017600], ["0.89", "1000", 1795017600],
    ] } } }, { headers: { date: "Thu, 19 Nov 2026 00:00:00 GMT" } }));
    vi.stubGlobal("fetch", fetchBook);
    const body = await (await GET(request("asset=USDC&network=solana&amount=1000&dest=EUR"))).json();
    expect(body).toMatchObject({ locked: false, quote: { gross: 894, averagePrice: 0.894, tradingFee: 1.79, withdrawalFee: 1, payout: 891.21 } });
    expect(fetchBook).toHaveBeenCalledWith(expect.stringContaining("pair=USDCEUR"), expect.anything());
    expect(mocks.quotes).not.toHaveBeenCalled();
  });

  it("checks regional restrictions and rejects insufficient order-book depth", async () => {
    mocks.session.mockResolvedValue({ user: { id: "U" } });
    const fetchBook = vi.fn().mockResolvedValue(Response.json({ error: [], result: { USDCCAD: { bids: [["1.38", "5", 1795017600]] } } }));
    vi.stubGlobal("fetch", fetchBook);
    const restricted = await (await GET(request("asset=USDT&network=solana&amount=1000&dest=CAD"))).json();
    expect(restricted).toMatchObject({ quote: null, reason: expect.stringContaining("suspended USDT") });
    expect(fetchBook).not.toHaveBeenCalled();
    const insufficient = await (await GET(request("asset=USDC&network=solana&amount=1000&dest=CAD"))).json();
    expect(insufficient).toMatchObject({ quote: null, reason: expect.stringContaining("visible bids") });
  });

  it("gives a visitor which exchanges were checked and whether they take the network, and no price, bid, gap or reason", async () => {
    mocks.session.mockResolvedValue(null);
    const text = await (await GET(request())).text();
    expect(JSON.parse(text)).toEqual({
      locked: true,
      exchanges: [
        { slug: "suncrypto", name: "SunCrypto", support: { status: "unknown", note: "" }, status: "unavailable" },
        { slug: "wazirx", name: "WazirX", support, status: "priced" },
      ],
    });
    expect(text).not.toMatch(/101330|102\.85|93\.44|bid above/);
  });

  it("gives a signed-in user the quotes with each live bid, and the mid-market reference", async () => {
    mocks.session.mockResolvedValue({ user: { id: "U" }, organization: { id: "ORG" }, role: "member" });
    const body = await (await GET(request("asset=USDC&network=ethereum&amount=2500"))).json();
    expect(body).toEqual({ locked: false, exchanges: [priced, none], reference });
    expect(mocks.quotes).toHaveBeenCalledWith("USDC", "ethereum", 2500);
  });

  it("includes the public SETTLE calculator reference only for signed-in USDT users on supported networks", async () => {
    const observedAt = new Date().toISOString();
    const fetchReference = vi.fn(async () => Response.json({ success: true, stale: false, usdToInr: "101.04", timestamp: observedAt }));
    vi.stubGlobal("fetch", fetchReference);
    const eth = request("asset=USDT&network=ethereum&amount=1000");
    mocks.session.mockResolvedValue(null);
    expect(await (await GET(eth)).json()).not.toHaveProperty("settle");
    expect(fetchReference).not.toHaveBeenCalled();

    mocks.session.mockResolvedValue({ user: { id: "U" } });
    expect(await (await GET(request())).json()).not.toHaveProperty("settle");
    expect(fetchReference).not.toHaveBeenCalled();
    expect(await (await GET(eth)).json()).toMatchObject({ settle: { rate: 101.04, observedAt } });
  });

  it("rejects a bad selection before reading anything, and rate limits", async () => {
    mocks.session.mockResolvedValue(null);
    for (const query of ["asset=DOGE&network=tron&amount=1", "asset=USDT&network=nowhere&amount=1", "asset=USDT&network=tron&amount=0", "asset=USDT&network=tron&amount=99999999", "asset=USDC&network=solana&amount=1000&dest=EURC"]) {
      expect((await GET(request(query))).status, query).toBe(400);
    }
    mocks.limit.mockResolvedValueOnce(false);
    expect((await GET(request())).status).toBe(429);
    expect(mocks.quotes).not.toHaveBeenCalled();
  });
});
