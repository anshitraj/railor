import { describe, expect, it } from "vitest";
import type { PriceRow } from "@railor/core";
import { alertDecision, alertTarget, bestCompletePrice, formatMoney, NOTIFY_COOLDOWN_MS } from "./rate-alert-rules";
import { createRateAlertEmail } from "./emails/rate-alert";

const row = (slug: string, recipientAmount: number | null, extra: Partial<PriceRow> = {}): PriceRow => ({
  providerSlug: slug, providerName: slug, basis: "published", recipientAmount, feeAmount: 1, feeCurrency: "USD",
  rate: 93, totalCostPct: 0.5, partial: false, delivery: null, observedAt: "", source: { label: slug }, notes: [], ...extra,
});

describe("rate alert rules", () => {
  it("judges only complete prices that apply to the profile", () => {
    const rows = [
      row("market:wise", 99_000, { basis: "market_estimate" }),
      row("wise", 98_000, { partial: true }),
      row("xflow", 97_000, { costComplete: false }),
      row("aspora", 96_000, { profileAssessment: { status: "not_supported" } as PriceRow["profileAssessment"] }),
      row("broken", null),
      row("infinity", 93_000, { basis: "exact" }),
      row("skydo", 92_000),
    ];
    expect(bestCompletePrice(rows)).toMatchObject({ providerSlug: "infinity", amount: 93_000, basis: "exact" });
    expect(bestCompletePrice(rows, "skydo")).toMatchObject({ amount: 92_000 });
    expect(bestCompletePrice(rows, "market:wise")).toBeNull();
  });

  it("rounds the target up to the cent", () => {
    expect(alertTarget(93_000, 1)).toBe(93_930);
    expect(alertTarget(100.01, 0.5)).toBe(100.52);
  });

  it("emails on the first check that reaches the target, once a day at most", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const best = { amount: 94_000, providerSlug: "skydo", providerName: "Skydo", basis: "published" as const };
    expect(alertDecision({ targetAmount: 93_930, lastMet: false, lastNotifiedAt: null }, best, now)).toEqual({ met: true, notify: true });
    expect(alertDecision({ targetAmount: 93_930, lastMet: true, lastNotifiedAt: null }, best, now)).toEqual({ met: true, notify: false });
    expect(alertDecision({ targetAmount: 93_930, lastMet: false, lastNotifiedAt: new Date(now.getTime() - 3_600_000) }, best, now).notify).toBe(false);
    expect(alertDecision({ targetAmount: 93_930, lastMet: false, lastNotifiedAt: new Date(now.getTime() - NOTIFY_COOLDOWN_MS) }, best, now).notify).toBe(true);
    expect(alertDecision({ targetAmount: 95_000, lastMet: true, lastNotifiedAt: null }, best, now)).toEqual({ met: false, notify: false });
    expect(alertDecision({ targetAmount: 1, lastMet: true, lastNotifiedAt: null }, null, now)).toEqual({ met: true, notify: false });
  });

  it("formats unknown currency codes without throwing", () => {
    expect(formatMoney(1234.5, "INR")).toBe("INR 1,234.50");
    expect(formatMoney(10, "USDT")).toBe("USDT 10");
  });
});

describe("rate alert email", () => {
  const base = {
    to: "a@example.com", from: "USD", toCurrency: "INR", amount: 1000, target: 93_930,
    best: { amount: 94_000, providerSlug: "skydo", providerName: "Skydo", product: "Skydo · <b>receive</b>", basis: "published" as const },
    others: [{ amount: 93_000, providerSlug: "infinity", providerName: "Infinity", basis: "exact" as const }],
    compareUrl: "https://www.railor.xyz/app/prices?from=USD&to=INR&amount=1000", unsubscribeUrl: "https://www.railor.xyz/api/alerts/unsubscribe?token=abc", manageUrl: "https://www.railor.xyz/app/saved",
  };

  it("names the amount, provider, basis and target, with one-click unsubscribe", () => {
    const mail = createRateAlertEmail(base);
    expect(mail.subject).toBe("INR 94,000.00 now arrives for USD 1,000.00 · USD → INR");
    expect(mail.text).toContain("published fees");
    expect(mail.text).toContain("INR 93,930.00");
    expect(mail.text).toContain("Infinity: INR 93,000.00 (your account's quote)");
    expect(mail.headers).toEqual({ "List-Unsubscribe": `<${base.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(mail.html).toContain('href="https://www.railor.xyz/app/prices?from=USD&amp;to=INR&amp;amount=1000"');
  });

  it("escapes provider text in the HTML", () => {
    const mail = createRateAlertEmail({ ...base, providerName: "Skydo" });
    expect(mail.html).not.toContain("<b>receive</b>");
    expect(mail.html).toContain("&lt;b&gt;receive&lt;/b&gt;");
    expect(mail.subject).toContain("Skydo · USD → INR");
  });
});
