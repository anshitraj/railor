import type { MailMessage } from "../mail";
import { FREQUENCY_LABEL, whatsappComing, type AlertFrequency, type Plan } from "../plans";
import { PRICE_CHANGE_PCT, formatMoney, type BestPrice, type DigestReason } from "../rate-alert-rules";
import { INK, LINE, MUTED, ORANGE, WEBSITE, changePill, emailDocument, escapeHtml, logoAttachments, unsubscribeHeaders } from "./layout";

export const CHART_CID = "rate-chart@mail.railor.xyz";

const BASIS: Record<BestPrice["basis"], string> = {
  exact: "your account's quote",
  live_public: "live public quote",
  published: "published fees",
  market_estimate: "market estimate",
};

/** One provider's line in the update: what arrives, how fast, and where to go. */
export interface OfferLine extends BestPrice {
  delivery?: string | null;
  /** The absolute address of the provider's redirect page, when Railor has a site for it. */
  href?: string | null;
}

export interface RateUpdateEmailInput {
  to: string;
  from: string;
  toCurrency: string;
  amount: number;
  frequency: AlertFrequency;
  reason: DigestReason;
  /** The cheapest provider first, then the others, best first. At most three are shown. */
  offers: OfferLine[];
  /** How many providers had a complete price in this check. */
  compared: number;
  /** Today's mid-market rate, and the chart of the last 30 days when one could be drawn. */
  reference: number | null;
  chart: { png: Buffer; caption: string } | null;
  /** The best price the last update showed, when there was one. */
  previousAmount: number | null;
  /** The signed-in person's plan; null for someone who isn't signed in. */
  plan: Plan | null;
  compareUrl: string;
  unsubscribeUrl: string;
  manageUrl: string;
  plansUrl: string;
}

const FREQUENCY_NOTE: Record<AlertFrequency, string> = {
  daily: "You get this update every day.",
  weekly: "You get this update once a week.",
  smart: `You get this update when the best price moves by ${PRICE_CHANGE_PCT}% or more.`,
};

function offerCard(offer: OfferLine, index: number, toCurrency: string): string {
  const price = formatMoney(offer.amount, toCurrency);
  const via = offer.product ?? offer.providerName;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;border:1px solid ${LINE};border-radius:14px;">
    <tr>
      <td width="40" valign="top" style="padding:16px 0 16px 16px;"><span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:#f4f2ed;color:${INK};font-size:13px;font-weight:800;line-height:28px;text-align:center;">${index + 1}</span></td>
      <td valign="top" style="padding:14px 8px;font-size:15px;line-height:21px;color:${INK};"><strong>${escapeHtml(via)}</strong><br><span style="font-size:12.5px;color:${MUTED};">${escapeHtml(offer.delivery ? `${offer.delivery} · ` : "")}${escapeHtml(BASIS[offer.basis])}</span></td>
      <td align="right" valign="top" style="padding:14px 16px 14px 8px;white-space:nowrap;"><span style="font-size:11px;font-weight:700;letter-spacing:1px;color:${MUTED};">RECIPIENT GETS</span><br><span style="font-size:18px;font-weight:800;color:${INK};">${escapeHtml(price)}</span></td>
    </tr>
    ${offer.href ? `<tr><td colspan="3" style="padding:0 16px 14px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="${ORANGE}" style="border-radius:10px;"><a href="${escapeHtml(offer.href)}" style="display:block;padding:12px 16px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Go to ${escapeHtml(offer.providerName)}</a></td></tr></table></td></tr>` : ""}
  </table>`;
}

/** The plan line under the button: what the plan sends, what unlocks more, and WhatsApp as coming. */
export function planLine(plan: Plan | null, frequency: AlertFrequency): { text: string; html: string } {
  const base = FREQUENCY_NOTE[frequency];
  const upgrade = plan === null ? " Create a free account to choose daily or smart updates on a paid plan." : plan === "free" ? " Plus adds smart updates and Pro adds daily ones." : plan === "plus" ? " Pro adds daily updates." : "";
  const whatsapp = plan && whatsappComing(plan) ? " WhatsApp alerts are coming soon." : "";
  const text = `${FREQUENCY_LABEL[frequency]} update. ${base}${upgrade}${whatsapp}`;
  return { text, html: `<strong style="color:${INK};">${escapeHtml(FREQUENCY_LABEL[frequency])} update</strong> · ${escapeHtml(`${base}${upgrade}${whatsapp}`)}` };
}

/**
 * The update itself, laid out like the best of these emails: today's best
 * figure up top, the cheapest provider and its button, the mid-market rate with
 * a 30-day chart, and the three cheapest providers with a button each.
 */
export function createRateUpdateEmail(input: RateUpdateEmailInput): MailMessage {
  const { from, toCurrency } = input;
  const pair = `${from} → ${toCurrency}`;
  const sent = formatMoney(input.amount, from);
  const offers = input.offers.slice(0, 3);
  const best = offers[0]!;
  const receives = formatMoney(best.amount, toCurrency);
  const via = best.product ?? best.providerName;
  const delta = input.previousAmount === null ? null : best.amount - input.previousAmount;
  const pct = delta === null || !input.previousAmount ? null : delta / input.previousAmount * 100;
  const move = delta === null || pct === null ? null : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatMoney(Math.abs(delta), toCurrency)} (${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%) since your last update`;
  const note = planLine(input.plan, input.frequency);
  const subject = input.reason === "change" && pct !== null
    ? `${pair}: best price ${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(2)}% · ${receives} for ${sent}`
    : `Get ${receives} for a ${sent} ${pair} transfer today`;

  const rate = input.reference
    ? `<p style="margin:0 0 4px;font-size:13px;color:${MUTED};text-align:center;">Today’s exchange rate (mid-market)</p>
       <p style="margin:0 0 14px;font-size:24px;font-weight:800;color:${INK};text-align:center;">1 ${escapeHtml(from)} = ${escapeHtml(input.reference.toLocaleString("en-US", { maximumSignificantDigits: 6 }))} ${escapeHtml(toCurrency)}</p>`
    : "";
  const chart = input.chart
    ? `${rate}<img src="cid:${CHART_CID}" width="496" alt="${escapeHtml(input.chart.caption)}" style="display:block;width:100%;max-width:496px;height:auto;margin:0 auto 6px;border-radius:10px;"><p style="margin:0 0 24px;font-size:12px;color:${MUTED};text-align:center;">${escapeHtml(input.chart.caption)}</p>`
    : rate;

  const body = `${chart}
    <p style="margin:6px 0 12px;font-size:11px;font-weight:700;letter-spacing:1.4px;color:${MUTED};text-align:center;">TOP ${offers.length} CHEAPEST PROVIDERS TODAY</p>
    <p style="margin:0 0 14px;font-size:12.5px;color:${MUTED};text-align:center;">${escapeHtml(sent)} to ${escapeHtml(toCurrency)} · prices checked just now</p>
    ${offers.map((offer, index) => offerCard(offer, index, toCurrency)).join("\n    ")}
    <div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>`;

  return {
    to: input.to,
    subject,
    headers: unsubscribeHeaders(input.unsubscribeUrl),
    text: [
      `${FREQUENCY_LABEL[input.frequency].toUpperCase()} RATE UPDATE · ${pair}`,
      "",
      `Get ${receives} for a ${sent} transfer today. ${via} is the cheapest provider of the ${input.compared} compared (${BASIS[best.basis]}).`,
      ...(move ? [move] : []),
      ...(input.reference ? ["", `Today's mid-market rate: 1 ${from} = ${input.reference.toLocaleString("en-US", { maximumSignificantDigits: 6 })} ${toCurrency}`] : []),
      "",
      `Top ${offers.length} cheapest providers today:`,
      ...offers.map((offer, index) => `${index + 1}. ${offer.product ?? offer.providerName}: ${formatMoney(offer.amount, toCurrency)}${offer.delivery ? ` (${offer.delivery})` : ""}${offer.href ? ` - ${offer.href}` : ""}`),
      "",
      `Compare all ${input.compared} providers: ${input.compareUrl}`,
      "Prices move. Check the provider's own quote before you send.",
      "",
      note.text,
      `Plans: ${input.plansUrl}`,
      `Change how often you get updates: ${input.manageUrl}`,
      `Unsubscribe: ${input.unsubscribeUrl}`,
      "",
      `Railor — ${WEBSITE}`,
    ].join("\n"),
    attachments: [
      ...logoAttachments,
      ...(input.chart ? [{ filename: "rate-chart.png", content: input.chart.png, cid: CHART_CID, contentType: "image/png" as const, contentDisposition: "inline" as const }] : []),
    ],
    html: emailDocument({
      preheader: `${via} is the cheapest of ${input.compared} providers for ${pair}. ${move ?? ""}`.trim(),
      badge: input.reason === "change" ? "Price moved" : `${FREQUENCY_LABEL[input.frequency]} update`,
      eyebrow: pair,
      hero: escapeHtml(receives),
      lead: `for a <strong style="color:${INK};">${escapeHtml(sent)}</strong> transfer today. <strong style="color:${INK};">${escapeHtml(via)}</strong> is the cheapest provider Railor found (${escapeHtml(BASIS[best.basis])}).`,
      extra: delta !== null && move ? changePill(delta, move) : undefined,
      body,
      cta: { label: `Compare all ${input.compared} providers`, url: input.compareUrl },
      note: `${note.html} <a href="${escapeHtml(input.manageUrl)}" style="color:${ORANGE};font-weight:700;">Change how often</a> · <a href="${escapeHtml(input.plansUrl)}" style="color:${ORANGE};font-weight:700;">See plans</a>`,
      footer: { manageUrl: input.manageUrl, unsubscribeUrl: input.unsubscribeUrl, reason: "You get this because you asked Railor for rate updates." },
    }),
  };
}

export interface ConfirmEmailInput {
  to: string;
  from: string;
  toCurrency: string;
  amount: number;
  frequency: AlertFrequency;
  confirmUrl: string;
  unsubscribeUrl: string;
}

/** "Confirm it's you": sent to an address that asked for updates, so nobody can sign up someone else's inbox. */
export function createConfirmEmail(input: ConfirmEmailInput): MailMessage {
  const pair = `${input.from} → ${input.toCurrency}`;
  const sent = formatMoney(input.amount, input.from);
  return {
    to: input.to,
    subject: `Confirm your ${FREQUENCY_LABEL[input.frequency].toLowerCase()} ${pair} rate updates`,
    headers: unsubscribeHeaders(input.unsubscribeUrl),
    text: [
      `CONFIRM YOUR RATE UPDATES`,
      "",
      `Someone asked Railor to send ${FREQUENCY_LABEL[input.frequency].toLowerCase()} updates for ${sent} ${pair} to this address. ${FREQUENCY_NOTE[input.frequency]}`,
      `Confirm it was you: ${input.confirmUrl}`,
      "",
      "If it wasn't you, ignore this email. Nothing is sent until you confirm.",
      `Unsubscribe: ${input.unsubscribeUrl}`,
      "",
      `Railor — ${WEBSITE}`,
    ].join("\n"),
    attachments: logoAttachments,
    html: emailDocument({
      preheader: `Confirm to start your ${FREQUENCY_LABEL[input.frequency].toLowerCase()} ${pair} updates.`,
      badge: "Confirm",
      eyebrow: `${pair} · ${FREQUENCY_LABEL[input.frequency]} updates`,
      hero: "One tap to confirm",
      lead: `Confirm that you want ${escapeHtml(FREQUENCY_LABEL[input.frequency].toLowerCase())} updates for <strong style="color:${INK};">${escapeHtml(sent)} ${escapeHtml(pair)}</strong>. ${escapeHtml(FREQUENCY_NOTE[input.frequency])}`,
      cta: { label: "Yes, send me updates", url: input.confirmUrl },
      note: "If it wasn’t you, ignore this email. Nothing is sent until you confirm.",
      footer: { manageUrl: `${WEBSITE}/prices`, unsubscribeUrl: input.unsubscribeUrl, reason: "Someone entered this address on Railor." },
    }),
  };
}
