import { MAGIC_LINK_MINUTES } from "../auth-constants";
import type { MailMessage } from "../mail";
import logos from "./logos.json";
import art from "./sign-in-assets.json";

const WEBSITE = "https://www.railor.xyz";
const RAILOR_CID = "railor-logo@mail.railor.xyz";
const RESEND_CID = "resend-logo@mail.railor.xyz";
const HERO_CID = "sign-in-hero@mail.railor.xyz";
const ICON_CIDS = {
  compare: "icon-compare@mail.railor.xyz",
  bell: "icon-bell@mail.railor.xyz",
  api: "icon-api@mail.railor.xyz",
  lock: "icon-lock@mail.railor.xyz",
} as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

const FEATURES = [
  { icon: "compare", title: "Compare prices", text: "Every provider’s fee and rate, side by side." },
  { icon: "bell", title: "Rate alerts", text: "An email when what arrives improves." },
  { icon: "api", title: "API and MCP", text: "Bring Railor into your code and AI tools." },
] as const;

/**
 * The sign-in email. Images travel inline (the animated GIF and the icons are
 * drawn by generate-assets.py), so opening it never fetches a remote image or a
 * tracking pixel. Mail clients ignore CSS and script motion, so the movement is
 * a GIF; Outlook for Windows shows its first frame, which is a complete picture.
 */
export function createSignInEmail(email: string, verificationUrl: string): MailMessage {
  const url = new URL(verificationUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Invalid sign-in email URL");
  }
  const href = escapeHtml(verificationUrl);
  const recipient = escapeHtml(email);
  const minutes = MAGIC_LINK_MINUTES;

  const tile = (feature: (typeof FEATURES)[number]) => `<td class="tile" width="33%" valign="top" style="padding:0 6px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #eae5db;border-radius:14px;background-color:#fffdfa;">
                  <tr><td style="padding:16px 14px 16px;">
                    <img src="cid:${ICON_CIDS[feature.icon]}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;margin:0 0 10px;">
                    <p style="margin:0 0 3px;font-size:14px;font-weight:700;line-height:20px;color:#1c1b19;">${feature.title}</p>
                    <p style="margin:0;font-size:12.5px;line-height:19px;color:#68635b;">${feature.text}</p>
                  </td></tr>
                </table>
              </td>`;

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
      "Inside: compare every provider's fee and rate, get rate alerts by email, and use the API and MCP in your own tools.",
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
      { filename: "railor-route.gif", content: Buffer.from(art.hero, "base64"), cid: HERO_CID, contentType: "image/gif", contentDisposition: "inline" },
      { filename: "icon-compare.png", content: Buffer.from(art.compare, "base64"), cid: ICON_CIDS.compare, contentType: "image/png", contentDisposition: "inline" },
      { filename: "icon-bell.png", content: Buffer.from(art.bell, "base64"), cid: ICON_CIDS.bell, contentType: "image/png", contentDisposition: "inline" },
      { filename: "icon-api.png", content: Buffer.from(art.api, "base64"), cid: ICON_CIDS.api, contentType: "image/png", contentDisposition: "inline" },
      { filename: "icon-lock.png", content: Buffer.from(art.lock, "base64"), cid: ICON_CIDS.lock, contentType: "image/png", contentDisposition: "inline" },
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
      .email-shell { padding: 14px 8px !important; }
      .email-header { padding: 18px 20px !important; }
      .email-content { padding: 28px 20px 24px !important; }
      .email-title { font-size: 27px !important; line-height: 33px !important; }
      .email-footer { padding: 0 20px 26px !important; }
      .hero-img { width: 100% !important; height: auto !important; }
      .tile { display: block !important; width: 100% !important; padding: 0 0 10px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f1eee8;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1b19;">
  <div style="display:none;font-size:1px;color:#f1eee8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Your Railor sign-in link is ready. Verify your email within ${minutes} minutes.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f1eee8" style="width:100%;background-color:#f1eee8;">
    <tr><td class="email-shell" align="center" style="padding:36px 16px;">
      <!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:560px;table-layout:fixed;background-color:#ffffff;border:1px solid #e6e0d4;border-radius:20px;overflow:hidden;">
        <tr><td class="email-header" bgcolor="#1c1b19" style="padding:20px 32px;background-color:#1c1b19;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td valign="middle">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
                  <td width="38" valign="middle" style="width:38px;"><img src="cid:${RAILOR_CID}" width="26" height="33" alt="" style="display:block;width:26px;height:33px;"></td>
                  <td valign="middle" style="font-size:27px;font-weight:700;line-height:33px;letter-spacing:-1px;color:#faf4ea;">Railor<span style="color:#ffad8c;">.</span></td>
                </tr></table>
              </td>
              <td align="right" valign="middle" style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#cfc8ba;">SECURE SIGN-IN</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="font-size:0;line-height:0;background-color:#3a1a12;">
          <img class="hero-img" src="cid:${HERO_CID}" width="560" height="236" alt="A price travelling from US dollars to euros, marked Best price" style="display:block;width:100%;max-width:560px;height:auto;border:0;">
        </td></tr>
        <tr><td class="email-content" style="padding:34px 36px 26px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:700;line-height:16px;letter-spacing:1.6px;color:#b83d1c;">ONE TAP AWAY</p>
          <h1 class="email-title" style="margin:0 0 14px;font-size:32px;font-weight:800;line-height:38px;letter-spacing:-1px;color:#1c1b19;">Verify your email to sign in.</h1>
          <p style="margin:0 0 26px;font-size:16px;line-height:26px;color:#45413c;">Confirm <strong style="font-weight:600;color:#1c1b19;overflow-wrap:anywhere;word-break:break-all;">${recipient}</strong> to sign in to your Railor workspace.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
            <tr><td align="center" bgcolor="#c84420" style="background-color:#c84420;border-radius:12px;border-bottom:3px solid #9f3015;mso-padding-alt:16px 20px;">
              <a href="${href}" style="display:block;padding:17px 20px;border-radius:12px;font-size:17px;font-weight:800;line-height:22px;text-align:center;text-decoration:none;color:#ffffff;background-color:#c84420;">Verify email &amp; sign in &rarr;</a>
            </td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:18px auto 0;">
            <tr>
              <td valign="middle" style="padding-right:8px;"><img src="cid:${ICON_CIDS.lock}" width="22" height="22" alt="" style="display:block;width:22px;height:22px;"></td>
              <td valign="middle" style="font-size:13px;line-height:21px;color:#68635b;">Expires in <strong style="font-weight:600;">${minutes} minutes</strong> &nbsp;&middot;&nbsp; One-time use</td>
            </tr>
          </table>
          <p style="margin:6px 0 30px;font-size:13px;line-height:21px;text-align:center;color:#68635b;">Open this link in the browser where you want to use Railor.</p>

          <p style="margin:0 0 12px;font-size:11px;font-weight:700;line-height:16px;letter-spacing:1.4px;color:#68635b;">WHAT’S INSIDE</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 -6px 26px;width:calc(100% + 12px);">
            <tr>
              ${FEATURES.map(tile).join("\n              ")}
            </tr>
          </table>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fcfaf5" style="width:100%;table-layout:fixed;background-color:#fcfaf5;border:1px solid #eae5db;border-radius:10px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;line-height:18px;color:#45413c;">Button not working? Copy this link into your browser:</p>
              <a href="${href}" style="display:block;font-size:12px;line-height:20px;color:#b83d1c;text-decoration:underline;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-all;">${href}</a>
            </td></tr>
          </table>
          <p style="margin:22px 0 0;font-size:13px;line-height:22px;color:#68635b;"><strong style="font-weight:600;color:#45413c;">Didn't request this email?</strong> You can safely ignore it. Never share this link. Railor will never ask you to send it to anyone.</p>
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
