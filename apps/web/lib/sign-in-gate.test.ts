import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("./auth", () => ({ getSession: async () => state.session }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
}));

import { requireSignedIn } from "./sign-in-gate";
import { safeReturnPath } from "./security";

describe("requireSignedIn", () => {
  beforeEach(() => { state.session = null; });

  it("sends a visitor to sign in and remembers where they were going", async () => {
    await expect(requireSignedIn("/providers?view=infrastructure")).rejects.toThrow("REDIRECT:/login?next=%2Fproviders%3Fview%3Dinfrastructure");
  });

  it("returns the session for someone who is signed in", async () => {
    state.session = { user: { email: "a@example.com" } };
    await expect(requireSignedIn("/providers")).resolves.toBe(state.session);
  });

  it("builds a return path the sign-in page accepts, and never one that leaves the site", () => {
    expect(safeReturnPath("/providers?view=directory", "/welcome")).toBe("/providers?view=directory");
    expect(safeReturnPath("//evil.example/providers", "/welcome")).toBe("/welcome");
  });
});
