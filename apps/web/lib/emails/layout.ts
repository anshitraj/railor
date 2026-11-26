import type { MailMessage } from "../mail";
import logos from "./logos.json";

/**
 * One look for Railor's price emails, in the manner of exchange and wallet
 * notifications (Binance, Coinbase): the brand bar, one large figure, what it
 * moved by, a short table, a single button, and a quiet footer. Tables and
 * inline styles only, because mail clients ignore most CSS.
 */
export const WEBSITE = "https://www.railor.xyz";
const RAILOR_CID = "railor-logo@mail.railor.xyz";

export const INK = "#14130f";
export const MUTED = "#68635b";
export const LINE = "#ece8df";
export const ORANGE = "#c84420";
const GREEN = { ink: "#0b7a43", bg: "#e5f5ec" };
const RED = { ink: "#b3302a", bg: "#fdebe9" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export const logoAttachments: NonNullable<MailMessage["attachments"]> = [
  { filename: "railor-logo.png", content: Buffer.from(logos.railor, "base64"), cid: RAILOR_CID, contentType: "image/png", contentDisposition: "inline" },
];

/** A coloured pill for a move: green up, red down, grey when nothing moved. */
export function changePill(delta: number, label: string): string {
  const tone = delta > 0 ? GREEN : delta < 0 ? RED : { ink: MUTED, bg: "#f1eee8" };
  const arrow = delta > 0 ? "&#9650;" : delta < 0 ? "&#9660;" : "&#9644;";
  return `<span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${tone.bg};color:${tone.ink};font-size:13px;font-weight:700;line-height:18px;">${arrow}&nbsp;${escapeHtml(label)}</span>`;
}

export interface TableRow { label: string; detail?: string; value: string; strong?: boolean }

/** A short ranked list: provider and basis on the left, the amount on the right. */
export function priceTable(title: string, rows: TableRow[]): string {
  if (!rows.length) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;border:1px solid ${LINE};border-radius:12px;">
    <tr><td colspan="2" style="padding:14px 18px 6px;font-size:11px;font-weight:700;letter-spacing:1.3px;color:${MUTED};">${escapeHtml(title.toUpperCase())}</td></tr>
    ${rows.map((row, index) => `<tr>
      <td style="padding:9px 18px;${index ? `border-top:1px solid ${LINE};` : ""}font-size:14px;line-height:20px;color:${INK};">${escapeHtml(row.label)}${row.detail ? `<br><span style="font-size:12px;color:${MUTED};">${escapeHtml(row.detail)}</span>` : ""}</td>
      <td align="right" style="padding:9px 18px;${index ? `border-top:1px solid ${LINE};` : ""}font-size:14px;font-weight:${row.strong ? 800 : 600};color:${INK};white-space:nowrap;">${escapeHtml(row.value)}</td>
    </tr>`).join("\n    ")}
    <tr><td colspan="2" style="height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
  </table>`;
}

export interface EmailShell {
  /** The text before the message opens, and the tab title. */
  preheader: string;
  /** The small label in the top bar, e.g. "Rate update". */
  badge: string;
  /** Small caps line above the hero. */
  eyebrow: string;
  /** The large figure or headline. */
  hero: string;
  /** Lines under the hero (HTML). */
  lead: string;
  /** Change pill and any other markup directly under the lead. */
  extra?: string;
  /** Tables and notes (HTML). */
  body?: string;
  cta: { label: string; url: string };
  /** A boxed note under the button: the plan, or a caution. */
  note?: string;
  footer: { manageUrl: string; unsubscribeUrl: string; reason: string };
}

export function emailDocument(shell: EmailShell): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(shell.preheader)}</title>
  <style>
    @media screen and (max-width: 600px) {
      .shell { padding: 16px 10px !important; }
      .content { padding: 26px 20px !important; }
      .hero { font-size: 38px !important; line-height: 44px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f2ed;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(shell.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f2ed">
    <tr><td class="shell" align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:560px;border:1px solid ${LINE};border-radius:18px;overflow:hidden;">
        <tr><td height="4" bgcolor="${ORANGE}" style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td bgcolor="${INK}" style="padding:20px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
                <td width="36" valign="middle"><img src="cid:${RAILOR_CID}" width="24" height="30" alt="" style="display:block;width:24px;height:30px;"></td>
                <td valign="middle" style="font-size:24px;font-weight:700;letter-spacing:-1px;color:#faf4ea;">Railor<span style="color:#ffad8c;">.</span></td>
              </tr></table>
            </td>
            <td align="right" valign="middle" style="font-size:11px;font-weight:700;letter-spacing:1.4px;color:#cfc8ba;">${escapeHtml(shell.badge.toUpperCase())}</td>
          </tr></table>
        </td></tr>
        <tr><td class="content" style="padding:34px 30px 26px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:${ORANGE};">${escapeHtml(shell.eyebrow.toUpperCase())}</p>
          <p class="hero" style="margin:0 0 10px;font-size:46px;font-weight:800;line-height:52px;letter-spacing:-1.6px;color:${INK};">${shell.hero}</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:25px;color:#45413c;">${shell.lead}</p>
          ${shell.extra ? `<p style="margin:0 0 24px;">${shell.extra}</p>` : `<div style="height:8px;font-size:0;line-height:0;">&nbsp;</div>`}
          ${shell.body ?? ""}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="${INK}" style="border-radius:999px;">
            <a href="${escapeHtml(shell.cta.url)}" style="display:block;padding:16px 22px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(shell.cta.label)}</a>
          </td></tr></table>
          <p style="margin:14px 0 0;font-size:13px;line-height:20px;color:${MUTED};text-align:center;">Prices move. Check the provider’s own quote before you send.</p>
          ${shell.note ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;"><tr><td style="padding:14px 16px;border-radius:12px;background:#f7f5f0;font-size:13px;line-height:20px;color:#45413c;">${shell.note}</td></tr></table>` : ""}
        </td></tr>
        <tr><td style="padding:0 30px 26px;">
          <p style="margin:0;padding-top:18px;border-top:1px solid ${LINE};font-size:12px;line-height:20px;color:${MUTED};">
            ${escapeHtml(shell.footer.reason)} <a href="${escapeHtml(shell.footer.manageUrl)}" style="color:#45413c;">Change alerts</a> &nbsp;&middot;&nbsp; <a href="${escapeHtml(shell.footer.unsubscribeUrl)}" style="color:${MUTED};">Stop this alert</a><br>
            <a href="${WEBSITE}" style="color:#45413c;font-weight:700;text-decoration:none;">railor.xyz</a> &nbsp;&middot;&nbsp; <a href="${WEBSITE}/legal/privacy" style="color:${MUTED};">Privacy policy</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function unsubscribeHeaders(url: string) {
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
