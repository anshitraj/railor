import "server-only";
import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let transportUrl: string | null = null;

/**
 * `SMTP_URL` is a single connection string — `smtps://user:pass@host:port` —
 * which every provider that speaks SMTP accepts, Resend included
 * (`smtps://resend:{API_KEY}@smtp.resend.com:465`). One adapter, no
 * per-provider SDK, no per-provider code path.
 */
function smtpSettings() {
  const url = process.env.SMTP_URL?.trim();
  if (!url) return null;
  const from = process.env.AUTH_FROM?.trim() || (process.env.NODE_ENV !== "production" ? "Railor <no-reply@railor.dev>" : "");
  if (!from || /[\r\n]/.test(from)) return null;
  try {
    const parsed = new URL(url);
    if (!["smtp:", "smtps:"].includes(parsed.protocol) || !parsed.hostname ||
        (parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) return null;
  } catch { return null; }
  return { url, from };
}

/** Checks required settings only; Resend verifies credentials and domain when sending. */
export function smtpConfigured(): boolean {
  return smtpSettings() !== null;
}

function getTransporter(url: string) {
  if (!transporter || transportUrl !== url) {
    transporter?.close();
    transporter = nodemailer.createTransport({
      url,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      dnsTimeout: 10_000,
      requireTLS: process.env.NODE_ENV === "production" && url.startsWith("smtp:"),
    });
    transportUrl = url;
  }
  return transporter;
}

export async function sendMail(options: { to: string; subject: string; text: string; html?: string }) {
  const settings = smtpSettings();
  if (!settings) return { sent: false as const, error: "mail_transport_not_configured" as const };

  try {
    const result = await getTransporter(settings.url).sendMail({ from: settings.from, ...options });
    if (Array.isArray(result.accepted) && result.accepted.length === 0) {
      return { sent: false as const, error: "send_failed" as const };
    }
    return { sent: true as const };
  } catch (error) {
    console.error(JSON.stringify({ event: "mail_failed", errorType: error instanceof Error ? error.name : "UnknownError" }));
    return { sent: false as const, error: "send_failed" as const };
  }
}
