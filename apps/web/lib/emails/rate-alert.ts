import type { MailMessage } from "../mail";
import { formatMoney, type BestPrice } from "../rate-alert-rules";
import { WEBSITE, emailDocument, escapeHtml, logoAttachments, priceTable, unsubscribeHeaders } from "./layout";

export const BASIS: Record<BestPrice["basis"], string> = {
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
    headers: unsubscribeHeaders(input.unsubscribeUrl),
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
    attachments: logoAttachments,
    html: emailDocument({
      preheader: `${arrives} with ${via}. Your target was ${target}.`,
      badge: "Target reached",
      eyebrow: scope,
      hero: `${escapeHtml(arrives)}`,
      lead: `now arrives when you send <strong style="color:#14130f;">${escapeHtml(sent)}</strong> with <strong style="color:#14130f;">${escapeHtml(via)}</strong> (${escapeHtml(BASIS[best.basis])}). You asked to hear at ${escapeHtml(target)}.`,
      body: priceTable("Also checked", others.map((row) => ({ label: row.product ?? row.providerName, detail: BASIS[row.basis], value: formatMoney(row.amount, toCurrency) }))),
      cta: { label: "See today’s comparison", url: input.compareUrl },
      footer: { manageUrl: input.manageUrl, unsubscribeUrl: input.unsubscribeUrl, reason: "You set this alert on Railor." },
    }),
  };
}
