import type { MailMessage } from "../mail";
import { ALERT_UPDATES, planName, type Plan } from "../plans";
import { formatMoney, type BestPrice, type DigestReason } from "../rate-alert-rules";
import { BASIS } from "./rate-alert";
import { WEBSITE, changePill, emailDocument, escapeHtml, logoAttachments, priceTable, unsubscribeHeaders } from "./layout";

export interface RateDigestEmailInput {
  to: string;
  from: string;
  toCurrency: string;
  amount: number;
  providerName?: string;
  best: BestPrice;
  /** Up to three other complete prices from the same check, best first. */
  others: BestPrice[];
  /** The best price the last update showed, when there was one. */
  previousAmount: number | null;
  reason: DigestReason;
  plan: Plan;
  compareUrl: string;
  unsubscribeUrl: string;
  manageUrl: string;
  plansUrl: string;
}

/** What the plan sends, and what the next plan up adds. Facts only: WhatsApp is shown as coming, never as sent. */
export function planNote(plan: Plan): { text: string; html: string } {
  const updates = ALERT_UPDATES[plan];
  const name = planName(plan);
  const sends = `${updates.everyDays === 1 ? "a daily" : "a weekly"} rate email${updates.onChange ? ", plus one when the best price moves" : ""}`;
  const upgrade = plan === "free" ? " Plus adds an email when the price moves; Pro makes it daily." : plan === "plus" ? " Pro makes it daily." : "";
  const whatsapp = updates.whatsapp ? " WhatsApp alerts are coming soon." : "";
  const text = `You're on ${name}: ${sends}.${upgrade}${whatsapp}`;
  return { text, html: `<strong style="color:#14130f;">${escapeHtml(name)} plan</strong> · ${escapeHtml(`${sends[0]!.toUpperCase()}${sends.slice(1)}.${upgrade}${whatsapp}`)}` };
}

/**
 * The plan's scheduled update, or "the price moved": the best complete price
 * for a saved pair today, what it did since the last update, and the next three.
 */
export function createRateDigestEmail(input: RateDigestEmailInput): MailMessage {
  const { from, toCurrency, best, previousAmount } = input;
  const pair = `${from} → ${toCurrency}`;
  const scope = input.providerName ? `${input.providerName} · ${pair}` : pair;
  const sent = formatMoney(input.amount, from);
  const arrives = formatMoney(best.amount, toCurrency);
  const via = best.product ?? best.providerName;
  const others = input.others.slice(0, 3);

  const delta = previousAmount === null ? null : best.amount - previousAmount;
  const pct = delta === null || !previousAmount ? null : delta / previousAmount * 100;
  const move = delta === null || pct === null ? null : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatMoney(Math.abs(delta), toCurrency)} (${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%) since your last update`;
  const cadence = ALERT_UPDATES[input.plan].everyDays === 1 ? "daily" : "weekly";
  const headline = input.reason === "change" && move && pct !== null
    ? `${pair}: best price ${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(2)}% · ${arrives} for ${sent}`
    : `${pair}: ${arrives} for ${sent} · your ${cadence} rate update`;
  const note = planNote(input.plan);

  return {
    to: input.to,
    subject: headline,
    headers: unsubscribeHeaders(input.unsubscribeUrl),
    text: [
      input.reason === "change" ? "PRICE MOVED" : `${cadence.toUpperCase()} RATE UPDATE`,
      "",
      `${scope}: sending ${sent} delivers ${arrives} with ${via} (${BASIS[best.basis]}).`,
      ...(move ? [move] : []),
      ...(others.length ? ["", "Next best:", ...others.map((row) => `- ${row.product ?? row.providerName}: ${formatMoney(row.amount, toCurrency)} (${BASIS[row.basis]})`)] : []),
      "",
      `Compare now: ${input.compareUrl}`,
      "Prices move. Check the provider's own quote before you send.",
      "",
      note.text,
      `Plans: ${input.plansUrl}`,
      `Change or remove alerts: ${input.manageUrl}`,
      `Stop this alert: ${input.unsubscribeUrl}`,
      "",
      `Railor — ${WEBSITE}`,
    ].join("\n"),
    attachments: logoAttachments,
    html: emailDocument({
      preheader: move ? `${arrives} with ${via}. ${move}.` : `${arrives} with ${via}.`,
      badge: input.reason === "change" ? "Price moved" : `${cadence[0]!.toUpperCase()}${cadence.slice(1)} update`,
      eyebrow: scope,
      hero: escapeHtml(arrives),
      lead: `arrives when you send <strong style="color:#14130f;">${escapeHtml(sent)}</strong> with <strong style="color:#14130f;">${escapeHtml(via)}</strong> (${escapeHtml(BASIS[best.basis])}).`,
      extra: delta !== null && move ? changePill(delta, move) : undefined,
      body: priceTable("Next best today", others.map((row) => ({ label: row.product ?? row.providerName, detail: BASIS[row.basis], value: formatMoney(row.amount, toCurrency) }))),
      cta: { label: "Compare prices now", url: input.compareUrl },
      note: `${note.html} <a href="${escapeHtml(input.plansUrl)}" style="color:#c84420;font-weight:700;">See plans</a>`,
      footer: { manageUrl: input.manageUrl, unsubscribeUrl: input.unsubscribeUrl, reason: "You get this because you set a rate alert on Railor." },
    }),
  };
}
