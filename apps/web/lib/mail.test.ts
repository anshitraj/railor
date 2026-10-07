import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createTransport: vi.fn(), send: vi.fn(), close: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));

const message = { to: "member@example.com", subject: "Sign in to Railor", text: "Sign-in link" };

describe("Resend SMTP delivery", () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_URL", "smtps://resend:test-secret@smtp.resend.com:465");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("AUTH_FROM", "Railor <hello@mail.railor.xyz>");
    mocks.send.mockResolvedValue({ accepted: [message.to] });
    mocks.createTransport.mockReturnValue({ sendMail: mocks.send, close: mocks.close });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("uses Resend SMTPS and the configured sender with bounded connection waits", async () => {
    const { sendMail } = await import("./mail");
    expect(await sendMail(message)).toEqual({ sent: true });
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      url: "smtps://resend:test-secret@smtp.resend.com:465",
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    }));
    expect(mocks.send).toHaveBeenCalledWith({ from: "Railor <hello@mail.railor.xyz>", ...message });
  });

  it("sends through Resend using its API key when SMTP_URL is empty", async () => {
    vi.stubEnv("SMTP_URL", "");
    vi.stubEnv("RESEND_API_KEY", "  re_test-secret  ");
    const { sendMail } = await import("./mail");
    expect(await sendMail(message)).toEqual({ sent: true });
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      url: "smtps://resend:re_test-secret@smtp.resend.com:465",
    }));
    expect(mocks.send).toHaveBeenCalledWith({ from: "Railor <hello@mail.railor.xyz>", ...message });
  });

  it("URL-encodes the Resend SMTP password", async () => {
    vi.stubEnv("SMTP_URL", "");
    vi.stubEnv("RESEND_API_KEY", "secret:@/?#%");
    const { sendMail } = await import("./mail");
    expect(await sendMail(message)).toEqual({ sent: true });
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      url: "smtps://resend:secret%3A%40%2F%3F%23%25@smtp.resend.com:465",
    }));
  });

  it("keeps an explicit SMTP_URL ahead of the Resend fallback", async () => {
    vi.stubEnv("RESEND_API_KEY", "another-key");
    const { sendMail } = await import("./mail");
    expect(await sendMail(message)).toEqual({ sent: true });
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      url: "smtps://resend:test-secret@smtp.resend.com:465",
    }));
  });

  it("passes inline logo bytes and content IDs through to the SMTP message", async () => {
    const attachments = [{ filename: "logo.png", content: Buffer.from("fixture"), cid: "logo@mail.railor.xyz", contentType: "image/png" as const, contentDisposition: "inline" as const }];
    const { sendMail } = await import("./mail");
    expect(await sendMail({ ...message, html: '<img src="cid:logo@mail.railor.xyz" alt="Railor">', attachments })).toEqual({ sent: true });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ attachments }));
  });

  it("refuses an absent production sender instead of using the development domain", async () => {
    vi.stubEnv("AUTH_FROM", "");
    const { sendMail } = await import("./mail");
    expect(await sendMail(message)).toEqual({ sent: false, error: "mail_transport_not_configured" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(["", "not-a-url", "https://smtp.resend.com"])("rejects invalid SMTP configuration without connecting: %s", async value => {
    vi.stubEnv("SMTP_URL", value);
    const { sendMail } = await import("./mail");
    expect(await sendMail(message)).toEqual({ sent: false, error: "mail_transport_not_configured" });
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("reports delivery errors without logging the SMTP password or magic link", async () => {
    mocks.send.mockRejectedValue(new Error("test-secret https://railor.xyz/auth/verify?token=private"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendMail } = await import("./mail");
    expect(await sendMail(message)).toEqual({ sent: false, error: "send_failed" });
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "mail_failed", errorType: "Error" }));
  });

  it("does not claim delivery when SMTP accepts no recipients", async () => {
    mocks.send.mockResolvedValue({ accepted: [] });
    const { sendMail } = await import("./mail");
    expect(await sendMail(message)).toEqual({ sent: false, error: "send_failed" });
  });

  it("requires TLS when production uses the STARTTLS port", async () => {
    vi.stubEnv("SMTP_URL", "smtp://resend:test-secret@smtp.resend.com:587");
    const { sendMail } = await import("./mail");
    await sendMail(message);
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true }));
  });
});
