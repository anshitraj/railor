import "server-only";
import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

/**
 * `SMTP_URL` is a single connection string — `smtps://user:pass@host:port` —
 * which every provider that speaks SMTP accepts, Resend included
 * (`smtps://resend:{API_KEY}@smtp.resend.com:465`). One adapter, no
 * per-provider SDK, no per-provider code path.
 */
function getTransporter() {
  const url = process.env.SMTP_URL?.trim();
  if (!url) return null;
  transporter ??= nodemailer.createTransport(url);
  return transporter;
}

export async function sendMail(options: { to: string; subject: string; text: string; html?: string }) {
  const transport = getTransporter();
  if (!transport) return { sent: false as const, error: "mail_transport_not_configured" as const };

  const from = process.env.AUTH_FROM?.trim() || "Railor <no-reply@railor.dev>";
  try {
    await transport.sendMail({ from, ...options });
    return { sent: true as const };
  } catch (error) {
    console.error("[mail]", error);
    return { sent: false as const, error: "send_failed" as const };
  }
}
