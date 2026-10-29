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
  it("reports a search the caller gave up on as timed out, not as a connection problem", async () => {
    // A server that never answers: the request only ends when the caller aborts it.
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    })));
    const controller = new AbortController();
    const pending = postSearch({ input: "x" }, { signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ ok: false, timedOut: true, message: expect.stringContaining("taking longer than usual") });
  });
  it("passes the caller's signal on to the request", async () => {
    reply(200, { interpretation: { query: {} }, results: [] });
    const controller = new AbortController();
    await postSearch({ input: "x" }, { signal: controller.signal });
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[1]).toMatchObject({ signal: controller.signal });
  });
});
