import { z } from "zod";
import { CustomerContext } from "@railor/core";
import { ApiError, snake } from "../../../lib/api-auth";
import { runPriceCheck } from "../../../lib/pricing";
import { camelTop, jsonBody, v1Route } from "../../../lib/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  sourceCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  destinationCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  destinationCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  amount: z.coerce.number().positive().max(10_000_000),
  includeMarket: z.boolean().optional(),
  context: CustomerContext.optional(),
});

/**
 * POST /v1/prices — { source_currency, destination_currency, amount, destination_country?, include_market?, context? }.
 * Every row says where its number came from (`basis`: exact | live_public | published | market_estimate);
 * rows are ranked by recipient_amount, incomplete-cost rows after complete ones.
 */
export const POST = v1Route("/v1/prices", "POST", async (context, request) => {
  const input = Body.parse(camelTop(await jsonBody(request)));
  if (input.sourceCurrency.toUpperCase() === input.destinationCurrency.toUpperCase()) throw new ApiError(400, "invalid_request", "Pick two different currencies.");
  const result = await runPriceCheck(context.organizationId, input);
  return {
    body: {
      object: "price_check",
      source_currency: result.input.sourceCurrency,
      destination_currency: result.input.destinationCurrency,
      amount: result.input.amount,
      destination_country: result.input.destinationCountry ?? null,
      context: result.input.context ?? null,
      comparison_scope: input.context ? "profile_specific" : "unscoped_reference",
      warnings: input.context ? [] : ["No customer context supplied. Prices are unscoped references; supply context.profile, country, direction and purpose to compare eligible products."],
      reference: result.reference ? { rate: result.reference.rate, source: result.reference.source, observed_at: result.reference.observedAt } : null,
      data: result.rows.map((r) => ({
        provider: r.providerSlug,
        provider_name: r.providerName,
        basis: r.basis,
        recipient_amount: r.recipientAmount,
        fee_amount: r.feeAmount,
        fee_currency: r.feeCurrency,
        rate: r.rate,
        rate_source: r.rateSource ? snake(r.rateSource) : null,
        total_cost_pct: r.totalCostPct,
        cost_complete: !r.partial,
        comparable: Boolean(input.context && !r.partial && r.profileAssessment?.status === "documented" && r.basis !== "market_estimate" && !r.publicOffer),
        shortfall_vs_best: input.context ? r.shortfall ?? null : null,
        profile_assessment: r.profileAssessment ? snake({ ...r.profileAssessment }) : null,
        public_comparison: r.publicComparison ? snake(r.publicComparison) : null,
        public_offer: r.publicOffer ? snake(r.publicOffer) : null,
        side: r.side ?? null,
        delivery: r.delivery,
        observed_at: r.observedAt,
        expires_at: r.expiresAt ?? null,
        source: r.source,
        notes: r.notes,
      })),
      unavailable: result.unavailable.map((u) => ({ provider: u.providerSlug, provider_name: u.providerName, reason: u.reason, connectable: Boolean(u.connectable) })),
      generated_at: result.generatedAt,
    },
  };
});
