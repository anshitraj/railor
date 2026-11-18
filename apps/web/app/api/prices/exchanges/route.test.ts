import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rates: vi.fn(), session: vi.fn(), limit: vi.fn() }));
vi.mock("@railor/core", () => ({ usdtInrExchangeRates: mocks.rates }));
vi.mock("../../../../lib/auth", () => ({ getSession: mocks.session }));
vi.mock("../../../../lib/rate-limit", () => ({ consumeLimit: mocks.limit }));

const { GET } = await import("./route");

const rates = {
  pair: "USDT/INR",
  reference: { rate: 93.44, source: "Wise's public rate (mid-market)", observedAt: "2026-11-18T13:58:00.000Z" },
  rates: {
    wazirx: { status: "ok", slug: "wazirx", bid: 102.85, ask: 103.43, observedAt: "2026-11-18T13:58:05.000Z", clock: "exchange", gapPct: 10.07, source: { label: "WazirX public ticker", url: "https://docs.wazirx.com/" } },
    giottus: { status: "unavailable", slug: "giottus", problem: "rate_limited", detail: "Giottus asked Railor to slow down (HTTP 429)." },
  },
  generatedAt: "2026-11-18T13:58:10.000Z",
};

beforeEach(() => {
  for (const mock of [mocks.rates, mocks.session, mocks.limit]) mock.mockReset();
  mocks.limit.mockResolvedValue(true);
  mocks.rates.mockResolvedValue(rates);
});

describe("GET /api/prices/exchanges", () => {
  it("gives a signed-out visitor a 401 and no price, without reading any exchange", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "Sign in to see live exchange prices." });
    expect(text).not.toMatch(/102\.85|bid|93\.44/);
    expect(mocks.rates).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("gives a signed-in user every exchange's bid, labelled by source, uncacheable by shared caches", async () => {
    mocks.session.mockResolvedValue({ user: { id: "USER-1" }, organization: null, role: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(rates);
  });

  it("rate limits per signed-in user", async () => {
    mocks.session.mockResolvedValue({ user: { id: "USER-1" }, organization: { id: "ORG-1" }, role: "member" });
    await GET();
    expect(mocks.limit).toHaveBeenCalledWith("exchange-bids", "user:USER-1", 60, 60_000);
    mocks.limit.mockResolvedValueOnce(false);
    const limited = await GET();
    expect(limited.status).toBe(429);
    expect(mocks.rates).toHaveBeenCalledTimes(1);
  });

  it("answers 502 with a plain message, and nothing internal, if reading the prices fails outright", async () => {
    mocks.session.mockResolvedValue({ user: { id: "USER-1" }, organization: null, role: null });
    mocks.rates.mockRejectedValue(new Error("socket hang up at 10.0.0.7:443"));
    const response = await GET();
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).toContain("temporarily unavailable");
    expect(text).not.toContain("10.0.0.7");
  });
});
