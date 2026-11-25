import { describe, expect, it, vi } from "vitest";
import { loadRateHistory } from "./rate-history";

const now = new Date("2026-11-18T12:00:00Z");
const reply = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });

describe("daily rate history", () => {
  it("keeps exactly seven UTC dates and leaves missing fiat observations empty", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request) => reply([
      { date: "2026-11-11", base: "USD", quote: "INR", rate: 80 },
      { date: "2026-11-12", base: "USD", quote: "INR", rate: 93.2 },
      { date: "2026-11-18", base: "USD", quote: "INR", rate: 94.1 },
      { date: "2026-11-18", base: "USD", quote: "EUR", rate: 0.9 },
      { date: "2026-11-19", base: "USD", quote: "INR", rate: 99 },
    ]));
    const result = await loadRateHistory({ mode: "bank", from: "USD", to: "INR" }, fetcher, now);
    expect(result.points).toHaveLength(7);
    expect(result.points[0]).toEqual({ date: "2026-11-12", rate: 93.2 });
    expect(result.points[1]).toEqual({ date: "2026-11-13", rate: null });
    expect(result.points[6]).toEqual({ date: "2026-11-18", rate: 94.1 });
    expect(result.source).toContain("Frankfurter");
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("from=2026-11-12");
  });

  it("uses the selected Indian exchange's daily close, without pegging the token", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request) => reply([{ time: Date.parse("2026-11-18"), close: 103.15 }]));
    const result = await loadRateHistory({ mode: "stablecoin", from: "USDT", to: "INR", provider: "coindcx" }, fetcher, now);
    expect(result.points[6]?.rate).toBe(103.15);
    expect(result.source).toBe("CoinDCX daily candles");
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("pair=I-USDT_INR");
  });

  it("requests a longer time series and preserves its missing days", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request) => reply([
      { date: "2026-10-20", base: "USD", quote: "INR", rate: 91.5 },
      { date: "2026-11-18", base: "USD", quote: "INR", rate: 94.1 },
    ]));
    const result = await loadRateHistory({ mode: "bank", from: "USD", to: "INR", days: 30 }, fetcher, now);
    expect(result).toMatchObject({ start: "2026-10-20", end: "2026-11-18" });
    expect(result.points).toHaveLength(30);
    expect(result.points[0]).toEqual({ date: "2026-10-20", rate: 91.5 });
    expect(result.points[1]).toEqual({ date: "2026-10-21", rate: null });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("from=2026-10-20");
  });

  it("reads WazirX's second-based timestamps and switches the requested token", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request) => reply([[Date.parse("2026-11-18") / 1000, 100, 103, 99, 102.5, 10]]));
    const result = await loadRateHistory({ mode: "stablecoin", from: "USDC", to: "INR", provider: "wazirx" }, fetcher, now);
    expect(result.points[6]?.rate).toBe(102.5);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("symbol=usdcinr");
  });

  it("divides actual token prices for EURC instead of using fiat EUR at par", async () => {
    const stamp = Date.parse("2026-11-18T08:00:00Z");
    const fetcher = vi.fn(async (url: string | URL | Request) => reply({ prices: [[stamp, String(url).includes("euro-coin") ? 1.02 : 0.93]] }));
    const result = await loadRateHistory({ mode: "stablecoin", from: "USDT", to: "EURC" }, fetcher, now);
    expect(result.points[6]?.rate).toBeCloseTo(0.93 / 1.02);
    expect(result.source).toContain("CoinGecko");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("doesn't join EURC prices from different observation times", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => reply({ prices: [[Date.parse(String(url).includes("euro-coin") ? "2026-11-18T10:00:00Z" : "2026-11-18T08:00:00Z"), 1]] }));
    const result = await loadRateHistory({ mode: "stablecoin", from: "USDC", to: "EURC" }, fetcher, now);
    expect(result.points.every((point) => point.rate === null)).toBe(true);
  });

  it("falls back to labelled market history when an exchange has no candles", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes("coindcx") ? reply([]) : reply({ prices: [[Date.parse("2026-11-18"), 94.2]] }));
    const result = await loadRateHistory({ mode: "stablecoin", from: "USDC", to: "INR", provider: "coindcx" }, fetcher, now);
    expect(result.points[6]?.rate).toBe(94.2);
    expect(result.source).toContain("CoinGecko");
    expect(result.note).toContain("Exchange history unavailable");
  });

  it("rejects failed responses and never turns malformed rates into prices", async () => {
    await expect(loadRateHistory({ mode: "bank", from: "USD", to: "INR" }, async () => new Response("", { status: 503 }), now)).rejects.toThrow();
    const result = await loadRateHistory({ mode: "bank", from: "USD", to: "INR" }, async () => reply([{ date: "2026-11-18", base: "USD", quote: "INR", rate: -1 }]), now);
    expect(result.points.every((point) => point.rate === null)).toBe(true);
  });
});
