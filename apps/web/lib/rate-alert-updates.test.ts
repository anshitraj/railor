import { describe, expect, it } from "vitest";
import { ALERT_UPDATES, alertUpdatesLine, type Plan } from "./plans";
import { digestDecision, PRICE_CHANGE_PCT, type BestPrice } from "./rate-alert-rules";
import { createRateDigestEmail, planNote } from "./emails/rate-digest";

const DAY = 86_400_000;
const T0 = new Date("2026-11-01T02:30:00Z");
const best = (amount: number): BestPrice => ({ amount, providerSlug: "infinity", providerName: "Infinity", basis: "published" });
const after = (days: number, extraMs = 0) => new Date(T0.getTime() + days * DAY + extraMs);
const state = (amount = 93_000) => ({ lastDigestAt: T0, lastDigestAmount: amount });

describe("which plan sends what", () => {
  it("is weekly on Free and Plus, daily from Pro up, with price-move emails from Plus up", () => {
    expect(ALERT_UPDATES.free).toMatchObject({ everyDays: 7, onChange: false });
    expect(ALERT_UPDATES.plus).toMatchObject({ everyDays: 7, onChange: true });
    for (const plan of ["pro", "business", "founding"] as Plan[]) expect(ALERT_UPDATES[plan]).toMatchObject({ everyDays: 1, onChange: true });
  });

  it("shows WhatsApp only as coming, and only from Pro up", () => {
    expect((Object.keys(ALERT_UPDATES) as Plan[]).filter((plan) => ALERT_UPDATES[plan].whatsapp).sort()).toEqual(["business", "founding", "pro"]);
    expect(alertUpdatesLine("free")).toBe("A weekly rate email.");
    expect(alertUpdatesLine("plus")).toContain("when the best price moves");
    expect(alertUpdatesLine("pro")).toMatch(/^A daily/);
  });
});

describe("when an update is due", () => {
  it("sends on schedule: weekly after seven days (cron drift allowed), daily after one", () => {
    expect(digestDecision(ALERT_UPDATES.free, state(), best(93_000), after(6))).toEqual({ send: false });
    expect(digestDecision(ALERT_UPDATES.free, state(), best(93_000), after(7, -5_000))).toMatchObject({ send: true, reason: "scheduled" });
    expect(digestDecision(ALERT_UPDATES.pro, state(), best(93_000), after(1, -5_000))).toMatchObject({ send: true, reason: "scheduled" });
    expect(digestDecision(ALERT_UPDATES.pro, state(), best(93_000), after(0, 6 * 60 * 60_000))).toEqual({ send: false });
  });

  it("sends when the best price moves from Plus up, but never on Free, and never twice in a day", () => {
    const moved = best(93_000 * (1 + (PRICE_CHANGE_PCT + 0.1) / 100));
    expect(digestDecision(ALERT_UPDATES.plus, state(), moved, after(2))).toMatchObject({ send: true, reason: "change" });
    expect(digestDecision(ALERT_UPDATES.free, state(), moved, after(2))).toEqual({ send: false });
    expect(digestDecision(ALERT_UPDATES.plus, state(), moved, after(0, 6 * 60 * 60_000))).toEqual({ send: false });
    expect(digestDecision(ALERT_UPDATES.plus, state(), best(93_000 * 1.002), after(2))).toEqual({ send: false });
  });

  it("counts a fall as a move too", () => {
    expect(digestDecision(ALERT_UPDATES.pro, state(), best(92_000), after(0, 23 * 60 * 60_000))).toMatchObject({ send: true });
  });

  it("starts the clock instead of mailing a backlog, and does nothing with no price", () => {
    expect(digestDecision(ALERT_UPDATES.pro, { lastDigestAt: null, lastDigestAmount: null }, best(93_000), after(30))).toEqual({ send: false, baseline: true });
    expect(digestDecision(ALERT_UPDATES.pro, state(), null, after(30))).toEqual({ send: false });
  });
});

describe("the update email", () => {
  const input = (over: Partial<Parameters<typeof createRateDigestEmail>[0]> = {}) => ({
    to: "a@example.com", from: "USD", toCurrency: "INR", amount: 1000, best: best(94_116), others: [{ ...best(93_500), providerName: "Skydo <b>" }],
    previousAmount: 93_000, reason: "change" as const, plan: "plus" as Plan,
    compareUrl: "https://www.railor.xyz/prices?from=USD", unsubscribeUrl: "https://www.railor.xyz/api/alerts/unsubscribe?token=t", manageUrl: "https://www.railor.xyz/app/saved", plansUrl: "https://www.railor.xyz/pricing", ...over,
  });

  it("leads with the figure and what it moved by, and keeps one-click unsubscribe", () => {
    const mail = createRateDigestEmail(input());
    expect(mail.subject).toContain("up 1.20%");
    expect(mail.subject).toContain("INR 94,116.00");
    expect(mail.text).toContain("+INR 1,116.00 (+1.20%) since your last update");
    expect(mail.html).toContain("&#9650;");
    expect(mail.html).toContain("INR 94,116.00");
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("says a fall is a fall, and escapes provider names", () => {
    const mail = createRateDigestEmail(input({ best: best(92_000), previousAmount: 93_000 }));
    expect(mail.subject).toContain("down 1.08%");
    expect(mail.html).toContain("&#9660;");
    expect(mail.html).toContain("Skydo &lt;b&gt;");
    expect(mail.html).not.toContain("Skydo <b>");
  });

  it("names the plan, and mentions WhatsApp as coming on Pro only", () => {
    expect(planNote("free").text).toContain("weekly rate email");
    expect(planNote("free").text).toContain("Plus adds an email when the price moves");
    expect(planNote("free").text).not.toContain("WhatsApp");
    expect(planNote("plus").text).not.toContain("WhatsApp");
    expect(planNote("pro").text).toContain("a daily rate email");
    expect(planNote("pro").text).toContain("WhatsApp alerts are coming soon.");
    expect(createRateDigestEmail(input({ plan: "pro", reason: "scheduled" })).subject).toContain("your daily rate update");
    expect(createRateDigestEmail(input({ plan: "free", reason: "scheduled" })).text).toContain("You're on Free");
  });
});
