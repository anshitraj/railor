"use server";

import { requireSession } from "../../../lib/auth";

/** Old tabs must not continue writing the retired checklist. */
export async function setReadiness(_requirementKey: string, _status: "have" | "missing" | "unsure") {
  await requireSession();
  return { ok: false as const, error: "The readiness checklist is no longer available. Review onboarding requirements with your provider." };
}

export async function applyParsedRequirements(_keys: string[]) {
  await requireSession();
  return { ok: false as const, count: 0, error: "The readiness checklist is no longer available. Review onboarding requirements with your provider." };
}
