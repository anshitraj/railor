import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { PriceCheckInput, PriceCheckResult } from "@railor/core";
import { emailSubscriptions, getDb } from "@railor/database";
import { createConfirmEmail } from "./emails/rate-update";
import { SENDER_COUNTRY } from "./guides/comparison";
import { sendMail, smtpConfigured } from "./mail";
import { ALERT_FREQUENCIES, type AlertFrequency } from "./plans";
import { resolvePriceInput, runPriceCheck } from "./pricing";
import { consumeLimit } from "./rate-limit";
import { completePrices, updateDecision } from "./rate-alert-rules";
import { composeRateUpdate } from "./rate-update-compose";
import { appOrigin } from "./security";

/**
 * Rate updates for someone who isn't signed in: an email address and a pair.
 * Nothing is sent until the address confirms from its own inbox (a signed-out
 * form must never be able to enrol someone else's email), every message carries
 * a one-click unsubscribe, and the only frequency without an account is weekly.
 */
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const DAY = 86_400_000;
const SLACK = 2 * 3_600_000;
const RESEND_AFTER_MS = 10 * 60_000;
const token = () => randomBytes(24).toString("base64url");
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export type SubscribeResult =
  | { ok: true; status: "confirm_sent" | "already_confirmed"; email: string }
  | { ok: false; error: string };

export interface SubscribeInput { email: string; from: string; to: string; amount: number; identity: string; origin?: string }

export async function subscribeByEmail(input: SubscribeInput): Promise<SubscribeResult> {
  const email = input.email.trim().toLowerCase();
  const from = input.from.trim().toUpperCase();
  const to = input.to.trim().toUpperCase();
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to) return { ok: false, error: "Choose two different currencies." };
  if (!Number.isFinite(amount) || amount < 1 || amount > 10_000_000_000) return { ok: false, error: "Enter an amount to watch." };
  if (!await consumeLimit("alert-subscribe-email", email, 3, 3_600_000) || !await consumeLimit("alert-subscribe-identity", input.identity, 10, 3_600_000)) {
    return { ok: false, error: "Too many requests. Try again in an hour." };
  }

  const db = await getDb();
  const [existing] = await db.select().from(emailSubscriptions)
    .where(and(eq(emailSubscriptions.email, email), eq(emailSubscriptions.sourceCurrency, from), eq(emailSubscriptions.destinationCurrency, to), eq(emailSubscriptions.amount, amount), isNull(emailSubscriptions.unsubscribedAt))).limit(1);
  if (existing?.confirmedAt) return { ok: true, status: "already_confirmed", email };

  const now = new Date();
  const row = existing ?? (await db.insert(emailSubscriptions).values({
    email, sourceCurrency: from, destinationCurrency: to, amount, frequency: "weekly", confirmToken: token(), unsubscribeToken: token(),
  }).returning())[0]!;
  if (existing?.lastConfirmSentAt && now.getTime() - existing.lastConfirmSentAt.getTime() < RESEND_AFTER_MS) return { ok: true, status: "confirm_sent", email };

  const origin = (input.origin ?? appOrigin()).replace(/\/$/, "");
  if (!smtpConfigured()) return { ok: false, error: "Email isn’t set up on this site yet." };
  const sent = await sendMail(createConfirmEmail({
    to: email, from, toCurrency: to, amount, frequency: "weekly",
    confirmUrl: `${origin}/api/alerts/confirm?token=${encodeURIComponent(row.confirmToken)}`,
    unsubscribeUrl: `${origin}/api/alerts/unsubscribe?token=${encodeURIComponent(row.unsubscribeToken)}`,
  }));
  if (!sent.sent) return { ok: false, error: "We couldn’t send the confirmation email. Try again in a moment." };
  await db.update(emailSubscriptions).set({ lastConfirmSentAt: now }).where(eq(emailSubscriptions.id, row.id));
  return { ok: true, status: "confirm_sent", email };
}

/** Confirm an address from the link in its own inbox. Returns what was confirmed, or null for an unknown or stopped link. */
export async function confirmSubscription(value: string): Promise<{ email: string; label: string; frequency: AlertFrequency } | null> {
  if (!TOKEN.test(value)) return null;
  const db = await getDb();
  const [row] = await db.select().from(emailSubscriptions).where(and(eq(emailSubscriptions.confirmToken, value), isNull(emailSubscriptions.unsubscribedAt))).limit(1);
  if (!row) return null;
  if (!row.confirmedAt) await db.update(emailSubscriptions).set({ confirmedAt: new Date() }).where(eq(emailSubscriptions.id, row.id));
  return { email: row.email, label: `${row.sourceCurrency} → ${row.destinationCurrency}`, frequency: row.frequency as AlertFrequency };
}

/** One-click unsubscribe. Returns what it stopped, or null for an unknown link. */
export async function unsubscribeSubscription(value: string): Promise<{ label: string } | null> {
  if (!TOKEN.test(value)) return null;
  const db = await getDb();
  const [row] = await db.update(emailSubscriptions).set({ unsubscribedAt: new Date() }).where(eq(emailSubscriptions.unsubscribeToken, value)).returning();
  return row ? { label: `${row.sourceCurrency} → ${row.destinationCurrency}` } : null;
}

export interface SubscriptionRun { subscriptions: number; checks: number; updates: number; failedChecks: number; failedEmails: number; skipped: number }

/** Email the confirmed subscribers who are due: the first update soon after confirming, then on their frequency. */
export async function checkEmailSubscriptions(options: { limit?: number; budgetMs?: number; now?: () => Date } = {}): Promise<SubscriptionRun> {
  const clock = options.now ?? (() => new Date());
  const started = Date.now();
  const db = await getDb();
  const rows = await db.select().from(emailSubscriptions)
    .where(and(isNotNull(emailSubscriptions.confirmedAt), isNull(emailSubscriptions.unsubscribedAt)))
    .orderBy(asc(emailSubscriptions.lastSentAt)).limit(options.limit ?? 500);
  const now = clock();
  // Daily and weekly are due by the clock alone; smart is due a day after the last one and then judged on the price.
  const due = rows.filter((row) => {
    if (!row.lastSentAt) return true;
    const since = now.getTime() - row.lastSentAt.getTime();
    return since >= (row.frequency === "weekly" ? 7 * DAY : DAY) - SLACK;
  });
  const run: SubscriptionRun = { subscriptions: due.length, checks: 0, updates: 0, failedChecks: 0, failedEmails: 0, skipped: 0 };
  const mail = smtpConfigured();
  const origin = appOrigin().replace(/\/$/, "");
  const groups = new Map<string, typeof due>();
  for (const row of due) {
    const key = `${row.sourceCurrency}|${row.destinationCurrency}|${row.amount}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const members of groups.values()) {
    if (Date.now() - started > (options.budgetMs ?? 240_000)) { run.skipped += members.length; continue; }
    const { sourceCurrency: from, destinationCurrency: to, amount } = members[0]!;
    let result: PriceCheckResult;
    let priceInput: PriceCheckInput;
    try {
      const resolved = await resolvePriceInput({ from, to, amount: String(amount), market: "1", profile: "personal", direction: "send", purpose: "personal", ...(SENDER_COUNTRY[from] ? { country: SENDER_COUNTRY[from]! } : {}) }, null, "personal");
      priceInput = { sourceCurrency: resolved.from, destinationCurrency: resolved.to, amount: resolved.amount, includeMarket: true, context: resolved.context, ...(resolved.destinationCountry ? { destinationCountry: resolved.destinationCountry } : {}) };
      result = await runPriceCheck(null, priceInput);
      run.checks += 1;
    } catch { run.failedChecks += 1; continue; }
    const best = completePrices(result.rows)[0] ?? null;
    for (const row of members) {
      const frequency = (ALERT_FREQUENCIES as readonly string[]).includes(row.frequency) ? row.frequency as AlertFrequency : "weekly";
      // The first update goes out as soon as there is a price; later ones follow the frequency.
      const decision = row.lastSentAt ? updateDecision(frequency, { lastDigestAt: row.lastSentAt, lastDigestAmount: row.lastAmount }, best, now) : { send: Boolean(best), reason: "scheduled" as const };
      if (!decision.send || !best || !mail || !decision.reason) continue;
      const message = await composeRateUpdate({
        to: row.email, priceInput, result, frequency, reason: decision.reason, previousAmount: row.lastAmount, plan: null, origin,
        compareUrl: `${origin}/prices?from=${from}&to=${to}&amount=${amount}`, manageUrl: `${origin}/prices?from=${from}&to=${to}&amount=${amount}`,
        unsubscribeUrl: `${origin}/api/alerts/unsubscribe?token=${encodeURIComponent(row.unsubscribeToken)}`,
      });
      if (!message) continue;
      const sent = await sendMail(message);
      if (!sent.sent) { run.failedEmails += 1; continue; }
      run.updates += 1;
      await db.update(emailSubscriptions).set({ lastSentAt: now, lastAmount: best.amount }).where(eq(emailSubscriptions.id, row.id));
    }
  }
  return run;
}
