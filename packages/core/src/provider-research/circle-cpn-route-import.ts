/**
 * Phase 1+2+3 combined for Circle CPN: each successful quote is simultaneously
 * proof a route exists AND a live price — see circle-cpn.ts's doc comment.
 *
 * Requires CIRCLE_RESEARCH_API_KEY (sandbox or production — see .env.example).
 * Exits cleanly with a clear message if unset.
 *
 * Each candidate corridor is tried independently. A 4xx from Circle for a
 * specific corridor means "not supported" (or a wrong paymentMethodType
 * guess) and is recorded as a skip, not a crash — this script does not know
 * in advance which of Circle's payment method types are valid for which
 * corridor beyond the one confirmed in Circle's own quickstart (SPEI for
 * US->MX), so several entries here are genuinely candidates being tested
 * for the first time, not known-good routes.
 *
 *   pnpm --filter @railor/core circle-cpn-route-import
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { getDb, providers, sourceDocuments, evidence as evidenceTable, providerRoutes, observations } from "@railor/database";
import { getCpnQuote, isCircleCpnConfigured, CircleCpnRequestError, type CpnQuoteRequest } from "./circle-cpn.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
loadEnv({ path: path.join(repoRoot, ".env") });

const now = () => new Date();
const hash = (v: string) => createHash("sha256").update(v).digest("hex");

const CANDIDATE_CORRIDORS: Array<CpnQuoteRequest & { note: string }> = [
  { paymentMethodType: "SPEI", senderCountry: "US", destinationCountry: "MX", sourceCurrency: "USDC", destinationAmount: "200", destinationCurrency: "MXN", blockchain: "ETH-SEPOLIA", note: "Confirmed valid in Circle's own quickstart example." },
  { paymentMethodType: "SEPA", senderCountry: "US", destinationCountry: "DE", sourceCurrency: "USDC", destinationAmount: "200", destinationCurrency: "EUR", blockchain: "ETH-SEPOLIA", note: "Candidate — SEPA is a real Circle CPN payment method type per public docs, Germany not yet confirmed." },
  { paymentMethodType: "SEPA", senderCountry: "US", destinationCountry: "FR", sourceCurrency: "USDC", destinationAmount: "200", destinationCurrency: "EUR", blockchain: "ETH-SEPOLIA", note: "Candidate, same basis as Germany." },
  { paymentMethodType: "SEPA", senderCountry: "US", destinationCountry: "NL", sourceCurrency: "USDC", destinationAmount: "200", destinationCurrency: "EUR", blockchain: "ETH-SEPOLIA", note: "Candidate, same basis as Germany." },
  { paymentMethodType: "PIX", senderCountry: "US", destinationCountry: "BR", sourceCurrency: "USDC", destinationAmount: "200", destinationCurrency: "BRL", blockchain: "ETH-SEPOLIA", note: "Candidate — PIX is Brazil's real instant rail; untested against CPN." },
  { paymentMethodType: "WIRE", senderCountry: "US", destinationCountry: "GB", sourceCurrency: "USDC", destinationAmount: "200", destinationCurrency: "GBP", blockchain: "ETH-SEPOLIA", note: "Candidate — WIRE as a generic international-transfer method type." },
  { paymentMethodType: "ACH", senderCountry: "MX", destinationCountry: "US", sourceCurrency: "USDC", destinationAmount: "200", destinationCurrency: "USD", blockchain: "ETH-SEPOLIA", note: "Candidate — reverse direction, MX-sender to US/ACH." },
];

async function main() {
  if (!isCircleCpnConfigured()) {
    console.log(JSON.stringify({ status: "not_configured", detail: "CIRCLE_RESEARCH_API_KEY is not set — nothing was called. Add it to .env and rerun." }));
    return;
  }

  const db = await getDb();
  const [provider] = await db.select({ id: providers.id }).from(providers).where(eq(providers.slug, "circle")).limit(1);
  if (!provider) throw new Error("circle provider must already exist");
  const providerId = provider.id;

  const confirmed: string[] = [];
  const rejected: Array<{ corridor: string; reason: string }> = [];
  let routesCreated = 0;
  let observationsCreated = 0;

  for (const corridor of CANDIDATE_CORRIDORS) {
    const label = `${corridor.senderCountry}->${corridor.destinationCountry}/${corridor.paymentMethodType}`;
    const startedAt = Date.now();
    try {
      const quote = await getCpnQuote(corridor);
      const quoteMs = Date.now() - startedAt;
      confirmed.push(label);

      const excerpt = `Live Circle CPN quote (id ${quote.id}), retrieved this session: ${quote.sourceAmount.amount} ${quote.sourceAmount.currency} on ${quote.blockchain} -> ${quote.destinationAmount.amount} ${quote.destinationAmount.currency} via ${quote.paymentMethodType}, rate ${quote.exchangeRate?.rate ?? "n/a"} (${quote.exchangeRate?.pair ?? "n/a"}), fee ${quote.totalFee?.amount ?? "n/a"} ${quote.totalFee?.currency ?? ""}, settlement <= ${quote.settlementMinutesMax ?? "?"} minutes. Quote expires ${quote.quoteExpireDate}.`;
      const rawHash = hash(quote.id + excerpt);
      const quoteUrl = "https://api.circle.com/v1/cpn/quotes";
      const [doc] = await db.insert(sourceDocuments).values({ providerId, url: quoteUrl, title: "Circle CPN — live quote API", sourceType: "api", parser: "api_reference", lastCheckedAt: now() }).onConflictDoNothing({ target: [sourceDocuments.providerId, sourceDocuments.url] }).returning({ id: sourceDocuments.id });
      const docId = doc?.id ?? (await db.select({ id: sourceDocuments.id }).from(sourceDocuments).where(eq(sourceDocuments.url, quoteUrl)).limit(1))[0]!.id;
      const [ev] = await db.insert(evidenceTable).values({
        providerId, sourceDocumentId: docId, sourceUrl: quoteUrl, sourceTitle: `Circle CPN live quote — ${label}`,
        sourceType: "api", verificationType: "provider_reported", retrievedAt: now(), lastVerifiedAt: now(), confidence: "0.98", rawExcerpt: excerpt, rawHash,
      }).returning({ id: evidenceTable.id });

      const existing = await db.select().from(providerRoutes).where(eq(providerRoutes.providerId, providerId));
      const dup = existing.find((r) => r.product === "off_ramp" && r.sourceAsset === quote.sourceAmount.currency && r.destinationCountry === corridor.destinationCountry && r.destinationCurrency === quote.destinationAmount.currency && r.paymentMethod === null);
      if (!dup) {
        await db.insert(providerRoutes).values({
          providerId, product: "off_ramp", customerType: "business",
          sourceCountry: corridor.senderCountry, sourceAsset: quote.sourceAmount.currency,
          destinationCountry: corridor.destinationCountry, destinationCurrency: quote.destinationAmount.currency,
          destinationEndpointType: "bank_account",
          minAmount: quote.sourceAmount.amount, amountCurrency: quote.sourceAmount.currency,
          availability: "supported",
          note: `Live CPN quote proves this exact route (${corridor.paymentMethodType}). Blockchain field returned "${quote.blockchain}" (testnet in sandbox) — network dimension intentionally left unset since CPN's blockchain identifier doesn't map 1:1 to Railor's mainnet blockchain slugs.`,
          evidenceId: ev!.id, lastVerifiedAt: now(),
        });
        routesCreated++;
      }

      if (quote.exchangeRate && quote.totalFee) {
        await db.insert(observations).values({
          providerId, corridorKey: label, quoteMs, success: true,
          spreadBps: null, feeAmount: quote.totalFee.amount, observedAt: now(),
        });
        observationsCreated++;
      }
    } catch (error) {
      const detail = error instanceof CircleCpnRequestError ? `${error.kind}: ${error.message}` : error instanceof Error ? error.message : String(error);
      rejected.push({ corridor: label, reason: detail });
    }
  }

  console.log(JSON.stringify({ status: "ran", confirmed, rejected, routesCreated, observationsCreated }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
