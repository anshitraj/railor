import { archiveBeneficiary } from "@railor/core";
import { v1Route } from "../../../../lib/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /v1/beneficiaries/{id} — archives it. Past payments keep their record. */
export const DELETE = v1Route<{ id: string }>("/v1/beneficiaries/{id}", "DELETE", async (context, _request, { id }) => {
  await archiveBeneficiary(context.organizationId, id);
  return { body: { object: "beneficiary", id, archived: true } };
});
