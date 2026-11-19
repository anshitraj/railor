import type { MailMessage } from "../mail";
import logos from "./logos.json";

const WEBSITE = "https://www.railor.xyz";
const RAILOR_CID = "railor-logo@mail.railor.xyz";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/**
 * "You're set up": sent once, when someone first finishes onboarding. It says
 * what's ready and the one thing to do next. Same look as the sign-in email;
 * the logo travels inline, so opening it fetches nothing.
 */
export function createOnboardedEmail(input: { to: string; name?: string | null; dashboardName: string; savedRoutes: number; appUrl?: string }): MailMessage {
  const app = (input.appUrl ?? WEBSITE).replace(/\/$/, "");
  const first = input.name?.trim().split(/\s+/)[0] ?? "";
  const hello = first ? `Hi ${first},` : "Hi,";
  const dashboard = escapeHtml(input.dashboardName);
  const routes = input.savedRoutes > 0 ? `${input.savedRoutes} ${input.savedRoutes === 1 ? "route is" : "routes are"} saved and watched for changes.` : "Save a route any time to be told when it changes.";
  const steps: Array<[string, string, string]> = [
    ["Check a price", "See what arrives with every provider, and where each number comes from.", `${app}/app/prices`],
    ["Ask the agent", "Describe a payment in your own words and compare the routes.", `${app}/app/agent`],
    ["Invite your team", "Share the dashboard and decide together.", `${app}/app/settings#team`],
  ];

  return {
    to: input.to,
    subject: "You’re all set on Railor",
    text: [
      hello,
      "",
      `Your Railor dashboard, ${input.dashboardName}, is ready.`,
      routes,
      "",
      ...steps.flatMap(([title, body, href]) => [`${title}: ${body}`, href, ""]),
      `Open your dashboard: ${app}/app`,
      "",
      `Railor — ${WEBSITE}`,
      `Privacy: ${WEBSITE}/legal/privacy`,
    ].join("\n"),
    attachments: [
      { filename: "railor-logo.png", content: Buffer.from(logos.railor, "base64"), cid: RAILOR_CID, contentType: "image/png", contentDisposition: "inline" },
    ],
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>You’re all set · Railor</title>
  <style>
    @media screen and (max-width: 600px) {
      .shell { padding: 20px 12px !important; }
      .content { padding: 28px 22px !important; }
      .title { font-size: 26px !important; line-height: 32px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#1c1b19;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Railor dashboard is ready. Here’s where to start.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f3ee">
    <tr><td class="shell" align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fffdfa" style="max-width:560px;border:1px solid #eae5db;border-radius:16px;overflow:hidden;">
        <tr><td height="4" bgcolor="#c84420" style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td bgcolor="#1c1b19" style="padding:24px 32px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td width="38" valign="middle"><img src="cid:${RAILOR_CID}" width="26" height="33" alt="" style="display:block;width:26px;height:33px;"></td>
            <td valign="middle" style="font-size:26px;font-weight:700;letter-spacing:-1px;color:#faf4ea;">Railor<span style="color:#ffad8c;">.</span></td>
          </tr></table>
        </td></tr>
        <tr><td class="content" style="padding:34px 32px 28px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:1.6px;color:#b83d1c;">YOU’RE ALL SET</p>
          <h1 class="title" style="margin:0 0 14px;font-size:30px;font-weight:700;line-height:36px;letter-spacing:-0.8px;">${escapeHtml(hello)} your dashboard is ready.</h1>
          <p style="margin:0 0 6px;font-size:16px;line-height:25px;color:#45413c;"><strong style="color:#1c1b19;">${dashboard}</strong> is set up.</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#45413c;">${escapeHtml(routes)}</p>
          ${steps.map(([title, body, href]) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 10px;border:1px solid #eae5db;border-radius:10px;"><tr><td style="padding:14px 16px;"><a href="${escapeHtml(href)}" style="font-size:15px;font-weight:700;color:#1c1b19;text-decoration:none;">${escapeHtml(title)} &rarr;</a><p style="margin:4px 0 0;font-size:13px;line-height:20px;color:#68635b;">${escapeHtml(body)}</p></td></tr></table>`).join("\n          ")}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;"><tr><td align="center" bgcolor="#c84420" style="border-radius:8px;">
            <a href="${escapeHtml(`${app}/app`)}" style="display:block;padding:15px 20px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">Open your dashboard</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:0 32px 26px;">
          <p style="margin:0;padding-top:18px;border-top:1px solid #eae5db;font-size:12px;line-height:20px;color:#68635b;">
            <a href="${WEBSITE}" style="color:#45413c;font-weight:700;text-decoration:none;">railor.xyz</a> &nbsp;&middot;&nbsp; <a href="${WEBSITE}/legal/privacy" style="color:#68635b;">Privacy policy</a><br>
            You’re getting this because you just set up Railor. We send account emails only.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
