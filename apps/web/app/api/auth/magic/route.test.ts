import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), configured: vi.fn(), limit: vi.fn() }));
vi.mock("../../../../lib/auth", () => ({ createMagicLink: mocks.create }));
vi.mock("../../../../lib/mail", () => ({ sendMail: mocks.send, smtpConfigured: mocks.configured }));
vi.mock("../../../../lib/rate-limit", () => ({ consumeLimit: mocks.limit, requestIdentity: () => "test-ip" }));
const { POST } = await import("./route");
const request = (body: unknown = { email: "person@example.com", returnTo: "/app" }) => new Request("https://www.railor.xyz/api/auth/magic", { method: "POST", body: JSON.stringify(body) });

describe("email sign-in through SMTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("AUTH_EMAIL_TRANSPORT", "smtp");
    mocks.configured.mockReturnValue(true); mocks.limit.mockResolvedValue(true);
    mocks.create.mockResolvedValue({ token: "private", url: "https://www.railor.xyz/auth/verify?token=private" });
    mocks.send.mockResolvedValue({ sent: true });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("emails a magic link and never returns its token to the production browser", async () => {
    const response = await POST(request());
    expect(await response.json()).toEqual({ sent: true, transport: "smtp" });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "person@example.com", subject: "Sign in to Railor",
      text: expect.stringContaining("https://www.railor.xyz/auth/verify?token=private"),
    }));
  });

  it("does not create a token or touch the database if SMTP is unconfigured", async () => {
    mocks.configured.mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "email_unavailable" });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("never exposes development links in production", async () => {
    vi.stubEnv("AUTH_EMAIL_TRANSPORT", "console");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });

  it("validates and normalizes the recipient before issuing or sending a link", async () => {
    expect((await POST(request({ email: "invalid" }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect((await POST(request({ email: "  Person@Example.com  " }))).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith("person@example.com", undefined);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "person@example.com" }));
  });

  it("limits requests before sending email", async () => {
    mocks.limit.mockResolvedValueOnce(false);
    expect((await POST(request())).status).toBe(429);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("reports SMTP failure instead of claiming the link was sent", async () => {
    mocks.send.mockResolvedValue({ sent: false, error: "send_failed" });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ sent: false, error: "email_unavailable" });
  });

  it("handles database failure with a safe retryable response", async () => {
    mocks.create.mockRejectedValueOnce(new Error("private database credentials"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "sign_in_unavailable" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "sign_in_failed", errorType: "Error" }));
  });
});
