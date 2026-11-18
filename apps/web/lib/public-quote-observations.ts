import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getDb, providers, sourceDocuments, sourceSnapshots } from "@railor/database";
import { usBankRemittanceCorridor, xoomBankQuoteRow, xoomCalculatorUrl, type PriceCheckInput, type PriceRow } from "@railor/core";
import { z } from "zod";
import { consumeLimit } from "./rate-limit";

const PARSER = "public_calculator_quote";
const VALID_FOR = 15 * 60_000;

function requestKey(input: PriceCheckInput) {
  const { context } = input;
  return [input.sourceCurrency, input.destinationCurrency, input.destinationCountry ?? "", input.amount,
    context?.profile, context?.country, context?.direction, context?.purpose, context?.paymentMethod].join(":");
}

export async function loadPublicQuoteObservations(input: PriceCheckInput, now = new Date()): Promise<PriceRow[]> {
  const db = await getDb();
  const snapshots = await db.select({ payload: sourceSnapshots.rawPayload })
    .from(sourceSnapshots)
    .where(and(gt(sourceSnapshots.fetchedAt, new Date(now.getTime() - VALID_FOR)),
      sql`(${sourceSnapshots.rawPayload}->>'kind') = ${PARSER} and (${sourceSnapshots.rawPayload}->>'requestKey') = ${requestKey(input)}`))
    .orderBy(desc(sourceSnapshots.fetchedAt)).limit(32);
  const rows = new Map<string, PriceRow>();
  for (const { payload } of snapshots) {
    const row = (payload as { row?: PriceRow } | null)?.row;
    if (!row || rows.has(row.providerSlug) || row.basis !== "live_public" || row.recipientAmount === null) continue;
    if (!(Date.parse(row.expiresAt ?? "") > now.getTime()) || !(Date.parse(row.observedAt) <= now.getTime())) continue;
    rows.set(row.providerSlug, row);
  }
  return [...rows.values()];
}

export async function savePublicQuoteObservation(input: PriceCheckInput, quote: PriceRow) {
  if (quote.basis !== "live_public" || !quote.source.url || quote.recipientAmount === null) return;
  const observedAt = Date.parse(quote.observedAt);
  if (!Number.isFinite(observedAt)) return;
  const deadline = Math.min(observedAt + VALID_FOR, Date.parse(quote.expiresAt ?? quote.publicOffer?.displayUntil ?? "") || Infinity);
  if (deadline <= Date.now()) return;

  const db = await getDb();
  const key = requestKey(input);
  const row: PriceRow = { ...quote, partial: true, costComplete: false, shortfall: null, totalCostPct: null, expiresAt: new Date(deadline).toISOString() };
  const contentHash = createHash("sha256").update(JSON.stringify([key, row])).digest("hex");
  const findDocument = async () => (await db.select({ id: sourceDocuments.id }).from(sourceDocuments)
    .where(and(eq(sourceDocuments.url, quote.source.url!), eq(sourceDocuments.parser, PARSER))).limit(1))[0];

  let doc = await findDocument();
  if (!doc) {
    const [provider] = await db.select({ id: providers.id }).from(providers).where(eq(providers.slug, quote.providerSlug)).limit(1);
    const [created] = await db.insert(sourceDocuments).values({
      providerId: provider?.id, url: quote.source.url, title: quote.source.label, sourceType: "pricing", parser: PARSER, enabled: false,
    }).onConflictDoNothing().returning({ id: sourceDocuments.id });
    // The source may already be registered for the general evidence crawler.
    doc = created ?? (await db.select({ id: sourceDocuments.id }).from(sourceDocuments)
      .where(and(eq(sourceDocuments.url, quote.source.url), provider ? eq(sourceDocuments.providerId, provider.id) : undefined)).limit(1))[0];
  }
  if (!doc) return;

  const [prior] = await db.select({ id: sourceSnapshots.id }).from(sourceSnapshots)
    .where(and(eq(sourceSnapshots.sourceDocumentId, doc.id), eq(sourceSnapshots.contentHash, contentHash))).limit(1);
  if (prior) return;
  await db.insert(sourceSnapshots).values({
    sourceDocumentId: doc.id, fetchedAt: new Date(observedAt), httpStatus: 200, contentHash,
    rawPayload: { kind: PARSER, requestKey: key, row },
  });
}

const xoomBrowserResult = z.object({
  status: z.literal("COMPLETED"),
  result: z.object({
    availability: z.literal(true),
    amountUSD: z.number().finite().positive(),
    feeUSD: z.number().finite().nonnegative(),
    recipientAmount: z.number().finite().positive(),
    rate: z.number().finite().positive(),
    destinationCurrency: z.enum(["INR", "SGD"]),
    firstTransfer: z.boolean().nullable(),
    fundingMethod: z.literal("ACH"),
    payoutMethod: z.literal("bank_deposit"),
    sourceUrl: z.url(),
  }),
});

export async function readXoomCalculator(input: PriceCheckInput): Promise<PriceRow | null> {
  const currency = usBankRemittanceCorridor(input);
  const apiKey = process.env.TINYFISH_API_KEY?.trim();
  if (!currency || !apiKey || !await consumeLimit("provider-quote-browser", "xoom", 24, 3_600_000)) return null;
  const url = xoomCalculatorUrl(currency);
  try {
    const response = await fetch("https://agent.tinyfish.ai/v1/automation/run", {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(28_000),
      redirect: "error",
      body: JSON.stringify({
        url, browser_profile: "lite",
        goal: "Use the public quote calculator only. Do not sign in, continue to checkout, submit a transfer or pass an access challenge. Enter exactly " + input.amount + " USD. Expand Show Fees and use the US bank account (ACH) row for bank deposit. Return availability, amountUSD, feeUSD, recipientAmount, rate, destinationCurrency, firstTransfer (boolean when stated, otherwise null), fundingMethod (ACH), payoutMethod (bank_deposit), and sourceUrl. Use null for unavailable figures and never infer a value.",
      }),
    });
    if (!response.ok) return null;
    const parsed = xoomBrowserResult.safeParse(await response.json());
    if (!parsed.success) return null;
    const quote = parsed.data.result;
    if (quote.amountUSD !== input.amount || quote.destinationCurrency !== currency || quote.sourceUrl !== url) return null;
    return xoomBankQuoteRow(currency, input.amount, {
      received: quote.recipientAmount, fee: quote.feeUSD, rate: quote.rate, firstTransfer: quote.firstTransfer,
    }, new Date());
  } catch {
    return null;
  }
}
