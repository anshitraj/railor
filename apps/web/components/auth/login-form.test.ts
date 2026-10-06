import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@railor/ui", () => ({ Button: "button", TechnologyLogo: () => null }));
const { LoginForm } = await import("./login-form");

const render = (demoAvailable: boolean, initialError?: string) => renderToStaticMarkup(
  React.createElement(LoginForm, { returnTo: "/welcome", oauth: { google: false, github: false }, demoAvailable, initialError }),
);

describe("available login methods", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => vi.unstubAllGlobals());

  it("does not offer the development demo when unavailable", () => {
    expect(render(false)).not.toContain('href="/api/auth/demo"');
    expect(render(true)).toContain('href="/api/auth/demo"');
  });

  it("explains why a direct production demo visit returned to login", () => {
    expect(render(false, "demo_unavailable")).toContain("The demo workspace is available in development. Sign in below to use Railor.");
  });

  it("describes unavailable email delivery instead of blaming the email address", () => {
    expect(render(false, "email_unavailable")).toContain("Email sign-in is temporarily unavailable.");
  });
});
