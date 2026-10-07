import { MAGIC_LINK_MINUTES } from "../auth-constants";
import type { MailMessage } from "../mail";
import logos from "./logos.json";

const WEBSITE = "https://www.railor.xyz";
const RAILOR_CID = "railor-logo@mail.railor.xyz";
const RESEND_CID = "resend-logo@mail.railor.xyz";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/** Inline PNGs travel with the email; opening it never fetches a tracking image. */
export function createSignInEmail(email: string, verificationUrl: string): MailMessage {
  const url = new URL(verificationUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Invalid sign-in email URL");
  }
  const href = escapeHtml(verificationUrl);
  const recipient = escapeHtml(email);
  const minutes = MAGIC_LINK_MINUTES;

  return {
    to: email,
    subject: "Verify your email to sign in to Railor",
    text: [
      "RAILOR",
      "Financial infrastructure, mapped.",
      "",
      "Verify your email",
      `Confirm ${email} to sign in to your Railor workspace.`,
      "",
      `Verify email & sign in: ${verificationUrl}`,
      "",
      `This link expires in ${minutes} minutes and can only be used once.`,
      "Open it in the browser where you want to use Railor.",
      "",
      "Didn't request this email? You can safely ignore it.",
      "Never share this link. Railor will never ask you to send it to anyone.",
      "",
      `Railor — ${WEBSITE}`,
      `Privacy: ${WEBSITE}/legal/privacy`,
      "Delivered by Resend.",
    ].join("\n"),
    attachments: [
      { filename: "railor-logo.png", content: Buffer.from(logos.railor, "base64"), cid: RAILOR_CID, contentType: "image/png", contentDisposition: "inline" },
      { filename: "resend-logo.png", content: Buffer.from(logos.resend, "base64"), cid: RESEND_CID, contentType: "image/png", contentDisposition: "inline" },
    ],
    html: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Verify your email · Railor</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    @media screen and (max-width: 600px) {
      .email-shell { padding: 20px 12px !important; }
      .email-header { padding: 24px !important; }
      .email-content { padding: 30px 24px 28px !important; }
      .email-title { font-size: 28px !important; line-height: 34px !important; }
      .email-footer { padding: 0 24px 28px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#1c1b19;">
  <div style="display:none;font-size:1px;color:#f5f3ee;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Your Railor sign-in link is ready. Verify your email within ${minutes} minutes.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f3ee" style="width:100%;background-color:#f5f3ee;">
    <tr><td class="email-shell" align="center" style="padding:40px 16px;">
      <!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fffdfa" style="width:100%;max-width:560px;table-layout:fixed;background-color:#fffdfa;border:1px solid #eae5db;border-radius:16px;overflow:hidden;">
        <tr><td height="4" bgcolor="#c84420" style="height:4px;font-size:0;line-height:0;background-color:#c84420;">&nbsp;</td></tr>
        <tr><td class="email-header" bgcolor="#1c1b19" style="padding:28px 36px;background-color:#1c1b19;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td width="40" valign="middle" style="width:40px;"><img src="cid:${RAILOR_CID}" width="28" height="36" alt="" style="display:block;width:28px;height:36px;"></td>
              <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:700;line-height:36px;letter-spacing:-1px;color:#faf4ea;">Railor<span style="color:#ffad8c;">.</span></td>
            </tr>
          </table>
          <p style="margin:12px 0 0;font-size:12px;line-height:18px;letter-spacing:0.4px;color:#eae5db;">Financial infrastructure, mapped.</p>
        </td></tr>
        <tr><td class="email-content" style="padding:36px 36px 30px;">
          <p style="margin:0 0 14px;font-size:11px;font-weight:700;line-height:16px;letter-spacing:1.6px;color:#b83d1c;">ACCOUNT VERIFICATION</p>
          <h1 class="email-title" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:700;line-height:38px;letter-spacing:-0.8px;color:#1c1b19;">Verify your email.</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#45413c;">Confirm <strong style="font-weight:600;color:#1c1b19;overflow-wrap:anywhere;word-break:break-all;">${recipient}</strong> to sign in to your Railor workspace.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
            <tr><td align="center" bgcolor="#c84420" style="background-color:#c84420;border-radius:8px;mso-padding-alt:16px 20px;">
              <a href="${href}" style="display:block;padding:16px 20px;border:1px solid #c84420;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:22px;text-align:center;text-decoration:none;color:#ffffff;background-color:#c84420;">Verify email &amp; sign in</a>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;font-size:13px;line-height:21px;text-align:center;color:#68635b;">Expires in <strong style="font-weight:600;">${minutes} minutes</strong> &nbsp;&middot;&nbsp; One-time use</p>
          <p style="margin:8px 0 28px;font-size:13px;line-height:21px;text-align:center;color:#68635b;">Open this link in the browser where you want to use Railor.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fcfaf5" style="width:100%;table-layout:fixed;background-color:#fcfaf5;border:1px solid #eae5db;border-radius:8px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;line-height:18px;color:#45413c;">Button not working? Copy this link into your browser:</p>
              <a href="${href}" style="display:block;font-size:12px;line-height:20px;color:#b83d1c;text-decoration:underline;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-all;">${href}</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:13px;line-height:22px;color:#68635b;"><strong style="font-weight:600;color:#45413c;">Didn't request this email?</strong> You can safely ignore it. Never share this link. Railor will never ask you to send it to anyone.</p>
        </td></tr>
        <tr><td class="email-footer" style="padding:0 36px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #eae5db;">
            <tr><td style="padding:20px 0 12px;font-size:12px;line-height:20px;color:#68635b;">
              <a href="${WEBSITE}" style="display:inline-block;padding:6px 0;color:#45413c;text-decoration:none;font-weight:700;">railor.xyz</a>
              &nbsp;&nbsp;&middot;&nbsp;&nbsp;
              <a href="${WEBSITE}/legal/privacy" style="display:inline-block;padding:6px 0;color:#68635b;text-decoration:underline;">Privacy policy</a>
            </td></tr>
            <tr><td>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr><td valign="middle" style="padding-right:8px;font-size:11px;line-height:18px;color:#68635b;">Delivered by</td><td valign="middle"><img src="cid:${RESEND_CID}" width="58" alt="Resend" style="display:block;width:58px;max-width:58px;height:auto;"></td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`,
  };
}
