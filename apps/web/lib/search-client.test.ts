import { afterEach, describe, expect, it, vi } from "vitest";
import { postSearch } from "./search-client";

afterEach(() => vi.unstubAllGlobals());
const reply = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })));

describe("postSearch", () => {
  it("returns a real result", async () => {
    reply(200, { interpretation: { query: {} }, results: [] });
    expect(await postSearch({ input: "x" })).toMatchObject({ ok: true });
  });
  it("turns every failure into a message instead of a half-shaped object", async () => {
    reply(429, { error: "rate_limited" });
    expect(await postSearch({})).toMatchObject({ ok: false, message: expect.stringContaining("a little fast") });
    reply(403, { error: "invalid_origin" });
    expect(await postSearch({})).toMatchObject({ ok: false, message: expect.stringContaining("unavailable") });
    reply(500, "<html>Server error</html>");
    expect(await postSearch({})).toMatchObject({ ok: false });
    reply(200, { unexpected: true });
    expect(await postSearch({})).toMatchObject({ ok: false });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await postSearch({})).toMatchObject({ ok: false, message: expect.stringContaining("reach Railor") });
  });
});
