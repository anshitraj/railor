import type { MailMessage } from "../mail";
import { formatMoney, type BestPrice } from "../rate-alert-rules";
import logos from "./logos.json";

const WEBSITE = "https://www.railor.xyz";
const RAILOR_CID = "railor-logo@mail.railor.xyz";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

const BASIS: Record<BestPrice["basis"], string> = {
  exact: "your account's quote",
  live_public: "live public quote",
  published: "published fees",
  market_estimate: "market estimate",
};

export interface RateAlertEmailInput {
  to: string;
  from: string;
  toCurrency: string;
  amount: number;
  /** Set when the alert watches one provider's corridor. */
  providerName?: string;
  target: number;
  best: BestPrice;
  /** Up to three other complete prices from the same check, best first. */
  others: BestPrice[];
  compareUrl: string;
  unsubscribeUrl: string;
  manageUrl: string;
}

/**
 * "Your rate is here": the best complete price for a saved pair reached the
 * target the person set. Every figure names its basis, and the email links
 * back to a fresh comparison rather than asking anyone to act on a stale number.
 */
export function createRateAlertEmail(input: RateAlertEmailInput): MailMessage {
  const { from, toCurrency, best } = input;
  const pair = `${from} → ${toCurrency}`;
  const sent = formatMoney(input.amount, from);
  const arrives = formatMoney(best.amount, toCurrency);
  const target = formatMoney(input.target, toCurrency);
  const via = best.product ?? best.providerName;
  const scope = input.providerName ? `${input.providerName} · ${pair}` : pair;
  const others = input.others.slice(0, 3);

  return {
    to: input.to,
    subject: `${arrives} now arrives for ${sent} · ${scope}`,
    headers: {
      "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    text: [
      "RATE ALERT",
      "",
      `${scope}: sending ${sent} now delivers ${arrives} with ${via} (${BASIS[best.basis]}).`,
      `You asked to hear when at least ${target} arrives.`,
      ...(others.length ? ["", "Also checked:", ...others.map((row) => `- ${row.product ?? row.providerName}: ${formatMoney(row.amount, toCurrency)} (${BASIS[row.basis]})`)] : []),
      "",
      `See today's full comparison: ${input.compareUrl}`,
      "Prices move. Check the provider's own quote before you send.",
      "",
      `Change or remove alerts: ${input.manageUrl}`,
      `Stop this alert: ${input.unsubscribeUrl}`,
      "",
      `Railor — ${WEBSITE}`,
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
  <title>Rate alert · Railor</title>
  <style>
    @media screen and (max-width: 600px) {
      .shell { padding: 20px 12px !important; }
      .content { padding: 28px 22px !important; }
      .title { font-size: 26px !important; line-height: 32px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#1c1b19;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(`${arrives} with ${via}. Your target was ${target}.`)}</div>
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
          <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:1.6px;color:#b83d1c;">RATE ALERT · ${escapeHtml(scope.toUpperCase())}</p>
          <h1 class="title" style="margin:0 0 14px;font-size:30px;font-weight:700;line-height:36px;letter-spacing:-0.8px;">${escapeHtml(arrives)} now arrives</h1>
          <p style="margin:0 0 6px;font-size:16px;line-height:25px;color:#45413c;">Sending <strong style="color:#1c1b19;">${escapeHtml(sent)}</strong> with <strong style="color:#1c1b19;">${escapeHtml(via)}</strong> (${escapeHtml(BASIS[best.basis])}).</p>
          <p style="margin:0 0 22px;font-size:15px;line-height:24px;color:#45413c;">You asked to hear when at least ${escapeHtml(target)} arrives.</p>
          ${others.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;border:1px solid #eae5db;border-radius:10px;">
            <tr><td colspan="2" style="padding:12px 16px 4px;font-size:11px;font-weight:700;letter-spacing:1.2px;color:#68635b;">ALSO CHECKED</td></tr>
            ${others.map((row) => `<tr><td style="padding:6px 16px;font-size:14px;color:#1c1b19;">${escapeHtml(row.product ?? row.providerName)}<br><span style="font-size:12px;color:#68635b;">${escapeHtml(BASIS[row.basis])}</span></td><td align="right" style="padding:6px 16px;font-size:14px;font-weight:700;color:#1c1b19;white-space:nowrap;">${escapeHtml(formatMoney(row.amount, toCurrency))}</td></tr>`).join("\n            ")}
            <tr><td colspan="2" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>` : ""}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#c84420" style="border-radius:8px;">
            <a href="${escapeHtml(input.compareUrl)}" style="display:block;padding:15px 20px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">See today’s comparison</a>
          </td></tr></table>
          <p style="margin:14px 0 0;font-size:13px;line-height:20px;color:#68635b;">Prices move. Check the provider’s own quote before you send.</p>
        </td></tr>
        <tr><td style="padding:0 32px 26px;">
          <p style="margin:0;padding-top:18px;border-top:1px solid #eae5db;font-size:12px;line-height:20px;color:#68635b;">
            You set this alert on Railor. <a href="${escapeHtml(input.manageUrl)}" style="color:#45413c;">Change alerts</a> &nbsp;&middot;&nbsp; <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#68635b;">Stop this alert</a><br>
            <a href="${WEBSITE}" style="color:#45413c;font-weight:700;text-decoration:none;">railor.xyz</a> &nbsp;&middot;&nbsp; <a href="${WEBSITE}/legal/privacy" style="color:#68635b;">Privacy policy</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
