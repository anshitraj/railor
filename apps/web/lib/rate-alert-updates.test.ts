import { describe, expect, it } from "vitest";
import { ALERT_FREQUENCIES, FREQUENCY_PLAN, allowedFrequencies, whatsappComing, type Plan } from "./plans";
import { updateDecision, PRICE_CHANGE_PCT, type BestPrice } from "./rate-alert-rules";
import { createConfirmEmail, createRateUpdateEmail, planLine } from "./emails/rate-update";

const DAY = 86_400_000;
const T0 = new Date("2026-11-01T02:30:00Z");
const best = (amount: number): BestPrice => ({ amount, providerSlug: "infinity", providerName: "Infinity", basis: "published" });
const after = (days: number, extraMs = 0) => new Date(T0.getTime() + days * DAY + extraMs);
const state = (amount = 93_000) => ({ lastDigestAt: T0, lastDigestAmount: amount });

describe("who can choose which update", () => {
  it("gives everyone weekly, Plus smart too, and Pro all three", () => {
    expect(allowedFrequencies("free")).toEqual(["weekly"]);
    expect(allowedFrequencies("plus")).toEqual(["weekly", "smart"]);
    for (const plan of ["pro", "business", "founding"] as Plan[]) expect(allowedFrequencies(plan)).toEqual(["daily", "weekly", "smart"]);
    expect(FREQUENCY_PLAN).toEqual({ weekly: null, smart: "plus", daily: "pro" });
    expect(ALERT_FREQUENCIES).toEqual(["daily", "weekly", "smart"]);
  });

  it("shows WhatsApp only as coming, and only from Pro up", () => {
    expect((["free", "plus", "pro", "business", "founding"] as Plan[]).filter(whatsappComing)).toEqual(["pro", "business", "founding"]);
  });
});

describe("when an update is due", () => {
  it("sends daily after a day and weekly after seven (cron drift allowed)", () => {
    expect(updateDecision("daily", state(), best(93_000), after(1, -5_000))).toMatchObject({ send: true, reason: "scheduled" });
    expect(updateDecision("daily", state(), best(93_000), after(0, 6 * 3_600_000))).toEqual({ send: false });
    expect(updateDecision("weekly", state(), best(93_000), after(6))).toEqual({ send: false });
    expect(updateDecision("weekly", state(), best(93_000), after(7, -5_000))).toMatchObject({ send: true, reason: "scheduled" });
  });

  it("sends a smart update only when the best price moved, at most once a day", () => {
    const moved = best(93_000 * (1 + (PRICE_CHANGE_PCT + 0.1) / 100));
    expect(updateDecision("smart", state(), moved, after(2))).toMatchObject({ send: true, reason: "change" });
    expect(updateDecision("smart", state(), best(93_000 * 1.002), after(2))).toEqual({ send: false });
    expect(updateDecision("smart", state(), moved, after(0, 6 * 3_600_000))).toEqual({ send: false });
    expect(updateDecision("smart", state(), best(92_000), after(0, 23 * 3_600_000))).toMatchObject({ send: true });
    // Smart never sends on the clock alone.
    expect(updateDecision("smart", state(), best(93_000), after(30))).toEqual({ send: false });
  });

  it("starts the clock instead of mailing a backlog, and does nothing with no price", () => {
    expect(updateDecision("daily", { lastDigestAt: null, lastDigestAmount: null }, best(93_000), after(30))).toEqual({ send: false, baseline: true });
    expect(updateDecision("daily", state(), null, after(30))).toEqual({ send: false });
  });
});

describe("the update email", () => {
  const png = Buffer.from("png");
  const input = (over: Partial<Parameters<typeof createRateUpdateEmail>[0]> = {}) => ({
    to: "a@example.com", from: "USD", toCurrency: "INR", amount: 100,
    frequency: "weekly" as const, reason: "scheduled" as const,
    offers: [
      { amount: 9_324.81, providerSlug: "moneygram", providerName: "MoneyGram", basis: "live_public" as const, delivery: "In minutes", href: "https://www.railor.xyz/go/moneygram?from=USD&to=INR&amount=100" },
      { amount: 9_290.17, providerSlug: "wu", providerName: "Western <b>Union</b>", basis: "published" as const, delivery: null, href: null },
      { amount: 9_286, providerSlug: "remitly", providerName: "Remitly", basis: "published" as const, delivery: "Same day", href: "https://www.railor.xyz/go/remitly" },
    ],
    compared: 8, reference: 92.4844, chart: { png, caption: "Evolution of the USD to INR mid-market rate over the past 30 days" }, previousAmount: null,
    plan: "free" as Plan, compareUrl: "https://www.railor.xyz/prices?from=USD&to=INR&amount=100", unsubscribeUrl: "https://www.railor.xyz/api/alerts/unsubscribe?token=t",
    manageUrl: "https://www.railor.xyz/app/saved", plansUrl: "https://www.railor.xyz/pricing", ...over,
  });

  it("leads with what arrives, names the cheapest provider and shows the rate chart and three offers", () => {
    const mail = createRateUpdateEmail(input());
    expect(mail.subject).toBe("Get INR 9,324.81 for a USD 100.00 USD → INR transfer today");
    expect(mail.html).toContain("INR 9,324.81");
    expect(mail.html).toContain("1 USD = 92.4844 INR");
    expect(mail.html).toContain('src="cid:rate-chart@mail.railor.xyz"');
    expect(mail.html).toContain("TOP 3 CHEAPEST PROVIDERS TODAY");
    expect(mail.html).toContain("Compare all 8 providers");
    expect(mail.html).toContain("Go to MoneyGram");
    expect(mail.html).not.toContain("Go to Western");
    expect(mail.html).toContain("Western &lt;b&gt;Union&lt;/b&gt;");
    expect(mail.attachments?.some((item) => item.cid === "rate-chart@mail.railor.xyz" && item.content === png)).toBe(true);
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(mail.text).toContain("Unsubscribe: https://www.railor.xyz/api/alerts/unsubscribe?token=t");
  });

  it("is sent without a chart when none could be drawn, and says a smart update is about a move", () => {
    const mail = createRateUpdateEmail(input({ chart: null, frequency: "smart", reason: "change", previousAmount: 9_100 }));
    expect(mail.html).not.toContain("cid:rate-chart");
    expect(mail.subject).toContain("best price up 2.47%");
    expect(mail.html).toContain("&#9650;");
    expect(mail.text).toContain("since your last update");
  });

  it("names the plan and what unlocks more, and shows WhatsApp as coming from Pro only", () => {
    expect(planLine("free", "weekly").text).toContain("Plus adds smart updates and Pro adds daily ones");
    expect(planLine("plus", "smart").text).toContain("Pro adds daily updates");
    expect(planLine("pro", "daily").text).toContain("WhatsApp alerts are coming soon.");
    expect(planLine("plus", "weekly").text).not.toContain("WhatsApp");
    expect(planLine(null, "weekly").text).toContain("Create a free account");
  });

  it("asks an address to confirm before anything is sent", () => {
    const mail = createConfirmEmail({ to: "a@example.com", from: "USD", toCurrency: "INR", amount: 1000, frequency: "weekly", confirmUrl: "https://www.railor.xyz/api/alerts/confirm?token=c", unsubscribeUrl: "https://www.railor.xyz/api/alerts/unsubscribe?token=u" });
    expect(mail.subject).toBe("Confirm your weekly USD → INR rate updates");
    expect(mail.html).toContain("Yes, send me updates");
    expect(mail.text).toContain("Nothing is sent until you confirm");
    expect(mail.text).toContain("https://www.railor.xyz/api/alerts/confirm?token=c");
  });
});
