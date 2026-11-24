import { describe, expect, it, vi } from "vitest";
import { fxBetween } from "./fx-history";

const now = new Date("2026-11-24T12:00:00Z");
const frankfurter = (rates: Record<string, number>) => vi.fn(async (url: string | URL | Request) => {
  const u = new URL(String(url));
  if (!u.hostname.includes("frankfurter")) return new Response("{}", { status: 404 });
  const to = u.searchParams.get("to")!;
  return Response.json(Object.entries(rates).filter(([date]) => date <= to).map(([date, rate]) => ({ date, base: "USD", quote: "INR", rate })));
}) as unknown as typeof fetch;

describe("reference rates between a quote and a credit", () => {
  it("reads both days from one source and uses the last published rate for a weekend", async () => {
    const fetcher = frankfurter({ "2026-11-16": 94.02, "2026-11-20": 92.89, "2026-11-21": 92.84 });
    const fx = await fxBetween("USD", "INR", "2026-11-16", "2026-11-22", { fetcher, now });
    expect(fx).toMatchObject({ quoteRate: 94.02, receivedRate: 92.84, quoteDate: "2026-11-16", receivedDate: "2026-11-22", source: expect.stringContaining("ECB") });
  });

  it("falls back to the second source for both days together", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const text = String(url);
      calls.push(text);
      if (text.includes("frankfurter")) return new Response("down", { status: 503 });
      const date = /(\d{4}-\d{2}-\d{2})/.exec(text)![1]!;
      return Response.json({ date, usd: { inr: date === "2026-11-16" ? 94 : 93 } });
    }) as unknown as typeof fetch;
    const fx = await fxBetween("USD", "INR", "2026-11-16", "2026-11-20", { fetcher, now });
    expect(fx).toMatchObject({ quoteRate: 94, receivedRate: 93, source: expect.stringContaining("currency-api") });
  });

  it("makes one lookup when the quote and credit share a day, and clamps the future to today", async () => {
    const fetcher = frankfurter({ "2026-11-24": 92.79 });
    const same = await fxBetween("USD", "INR", "2026-11-24", "2026-11-24", { fetcher, now });
    expect(same).toMatchObject({ quoteRate: 92.79, receivedRate: 92.79 });
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(1);
    const early = await fxBetween("USD", "INR", "2026-11-30", "2026-11-20", { fetcher: frankfurter({ "2026-11-20": 92.89 }), now });
    // A quote dated after the credit cannot explain earlier movement.
    expect(early).toMatchObject({ quoteDate: "2026-11-20", receivedDate: "2026-11-20", quoteRate: 92.89, receivedRate: 92.89 });
  });

  it("answers null rather than guessing when no source knows the pair", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    // Dates no earlier test fetched: past rates are cached, so a stale answer would hide the failure.
    expect(await fxBetween("USD", "INR", "2026-10-01", "2026-10-05", { fetcher, now })).toBeNull();
    expect(await fxBetween("INR", "INR", "2026-11-16", "2026-11-20", { fetcher, now })).toBeNull();
  });
});
