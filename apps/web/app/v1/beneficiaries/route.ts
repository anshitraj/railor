import { createBeneficiary, listBeneficiaries } from "@railor/core";
import { camelTop, jsonBody, v1Route } from "../../../lib/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const serialize = (b: Awaited<ReturnType<typeof listBeneficiaries>>[number]) => ({
  object: "beneficiary",
  id: b.id,
  label: b.label,
  holder_type: b.holderType,
  holder_name: b.holderName,
  country: b.country,
  currency: b.currency,
  method: b.method,
  network: b.network,
  display_hint: b.displayHint,
  created_at: new Date(b.createdAt).toISOString(),
});

/** GET /v1/beneficiaries — account details are never returned, only a masked hint. */
export const GET = v1Route("/v1/beneficiaries", "GET", async (context) => {
  const rows = await listBeneficiaries(context.organizationId);
  return { body: { object: "list", data: rows.map(serialize), has_more: false } };
});

/**
 * POST /v1/beneficiaries — { holder_type, holder_name, country, currency,
 * method: bank_us|iban|gb|clabe|pix|in_bank|crypto_address, network?, details: {...} }.
 * Validated (IBAN checksum, ABA routing, address format), encrypted at rest,
 * deduplicated: re-posting the same account returns the existing beneficiary.
 */
export const POST = v1Route("/v1/beneficiaries", "POST", async (context, request) => {
  const body = camelTop(await jsonBody(request));
  const details = body.details && typeof body.details === "object" ? camelTop(body.details as Record<string, unknown>) : {};
  const { beneficiary, created } = await createBeneficiary(context.organizationId, null, { ...body, details });
  return { status: created ? 201 : 200, body: serialize(beneficiary) };
});
