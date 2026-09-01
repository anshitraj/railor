/**
 * Circle Payments Network (CPN) — real quote client. Verified against
 * Circle's own quickstart (developers.circle.com/cpn/quickstarts/
 * integrate-with-cpn-ofi) which publishes a complete, real request/response
 * example — not a guess, the full shape below is copied from that page.
 *
 * This is a LIVE QUOTE, not a static route-existence check: exchangeRate,
 * fee breakdown, and settlement-time estimate all come back on every call.
 * That means a successful call here can satisfy both "does this route
 * exist" (Phase 2) and "what does it cost right now" (Phase 3) at once.
 *
 * Sandbox and production share the same host per Circle's docs
 * (api.circle.com) — the API key itself determines which environment a
 * request hits, unlike Circle's core Payments API which uses separate
 * api-sandbox.circle.com / api.circle.com hosts (see adapters.ts's
 * circleTestConnection for that other, unrelated Circle surface).
 */
import { z } from "zod";

const CPN_BASE_URL = "https://api.circle.com/v1/cpn";

export function isCircleCpnConfigured(): boolean {
  return Boolean(process.env.CIRCLE_RESEARCH_API_KEY?.trim());
}

export class CircleCpnNotConfiguredError extends Error {
  constructor() {
    super("CIRCLE_RESEARCH_API_KEY is not set.");
  }
}

export class CircleCpnRequestError extends Error {
  constructor(
    readonly status: number,
    readonly kind: "invalid_key" | "rate_limited" | "server_error" | "unknown",
    message: string,
  ) {
    super(message);
  }
}

function classifyStatus(status: number, detail: string): CircleCpnRequestError {
  if (status === 401 || status === 403) return new CircleCpnRequestError(status, "invalid_key", `Circle CPN rejected the API key: ${detail}`);
  if (status === 429) return new CircleCpnRequestError(status, "rate_limited", `Circle CPN rate limit hit: ${detail}`);
  if (status >= 500) return new CircleCpnRequestError(status, "server_error", `Circle CPN server error (${status}): ${detail}`);
  return new CircleCpnRequestError(status, "unknown", `Circle CPN request failed (${status}): ${detail}`);
}

export interface CpnQuoteRequest {
  paymentMethodType: string;
  senderCountry: string;
  destinationCountry: string;
  sourceCurrency: string;
  destinationAmount: string;
  destinationCurrency: string;
  blockchain: string;
  senderType?: "INDIVIDUAL" | "BUSINESS";
  recipientType?: "INDIVIDUAL" | "BUSINESS";
}

const QuoteResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      paymentMethodType: z.string(),
      blockchain: z.string(),
      senderCountry: z.string(),
      destinationCountry: z.string(),
      quoteExpireDate: z.string(),
      sourceAmount: z.object({ amount: z.string(), currency: z.string() }),
      destinationAmount: z.object({ amount: z.string(), currency: z.string() }),
      fiatSettlementTime: z.object({ min: z.string(), max: z.string(), unit: z.string() }).optional(),
      exchangeRate: z.object({ rate: z.string(), pair: z.string() }).optional(),
      fees: z
        .object({
          totalAmount: z.object({ amount: z.string(), currency: z.string() }),
          breakdown: z.array(z.object({ type: z.string(), amount: z.object({ amount: z.string(), currency: z.string() }) })).optional(),
        })
        .optional(),
    }),
  ),
});

export interface CpnQuote {
  id: string;
  paymentMethodType: string;
  blockchain: string;
  senderCountry: string;
  destinationCountry: string;
  sourceAmount: { amount: string; currency: string };
  destinationAmount: { amount: string; currency: string };
  settlementMinutesMax: number | null;
  exchangeRate: { rate: string; pair: string } | null;
  totalFee: { amount: string; currency: string } | null;
  quoteExpireDate: string;
}

/**
 * Requests a real, live quote. A successful response is simultaneously
 * proof the route exists (Phase 2) and a live price (Phase 3) — see the
 * module doc comment. Throws on any non-2xx; callers decide whether a
 * specific corridor's failure means "not supported" or "transient error"
 * by inspecting CircleCpnRequestError.kind.
 *
 * `explicitApiKey` lets a customer-connected caller (adapters.ts's `circle`
 * ProviderAdapter) pass the *customer's own* CPN key instead of Railor's own
 * research key — the two are different Circle products (core Payments API
 * vs Payments Network) with different credential owners, and this function
 * must never silently use Railor's research key to answer a customer's quote.
 */
export async function getCpnQuote(request: CpnQuoteRequest, explicitApiKey?: string): Promise<CpnQuote> {
  const apiKey = explicitApiKey?.trim() || process.env.CIRCLE_RESEARCH_API_KEY?.trim();
  if (!apiKey) throw new CircleCpnNotConfiguredError();

  let response: Response;
  try {
    response = await fetch(`${CPN_BASE_URL}/quotes`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        paymentMethodType: request.paymentMethodType,
        senderCountry: request.senderCountry,
        destinationCountry: request.destinationCountry,
        sourceAmount: { currency: request.sourceCurrency },
        destinationAmount: { amount: request.destinationAmount, currency: request.destinationCurrency },
        blockchain: request.blockchain,
        senderType: request.senderType ?? "BUSINESS",
        recipientType: request.recipientType ?? "BUSINESS",
        transactionVersion: "VERSION_2",
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new CircleCpnRequestError(0, "unknown", `Could not reach Circle CPN: ${(error as Error).message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw classifyStatus(response.status, detail);
  }

  const raw = await response.json().catch(() => null);
  const parsed = QuoteResponseSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.data[0]) {
    throw new CircleCpnRequestError(200, "unknown", `Circle CPN quote response didn't match the expected shape: ${parsed.success ? "empty data array" : parsed.error.message}`);
  }
  const q = parsed.data.data[0];
  return {
    id: q.id,
    paymentMethodType: q.paymentMethodType,
    blockchain: q.blockchain,
    senderCountry: q.senderCountry,
    destinationCountry: q.destinationCountry,
    sourceAmount: q.sourceAmount,
    destinationAmount: q.destinationAmount,
    settlementMinutesMax: q.fiatSettlementTime ? Number(q.fiatSettlementTime.max) : null,
    exchangeRate: q.exchangeRate ?? null,
    totalFee: q.fees?.totalAmount ?? null,
    quoteExpireDate: q.quoteExpireDate,
  };
}
