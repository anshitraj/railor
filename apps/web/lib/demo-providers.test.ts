import { afterEach, describe, expect, it, vi } from "vitest";
import { hideDemoProvider } from "./demo-providers";

afterEach(() => vi.unstubAllEnvs());

describe("demo providers", () => {
  it("are hidden in production unless explicitly shown, and never hide real providers", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(hideDemoProvider(true)).toBe(true);
    expect(hideDemoProvider(false)).toBe(false);
    vi.stubEnv("RAILOR_SHOW_DEMO", "true");
    expect(hideDemoProvider(true)).toBe(false);
  });
  it("stay visible in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(hideDemoProvider(true)).toBe(false);
  });
});
