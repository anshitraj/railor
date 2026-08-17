"use server";

import { redirect } from "next/navigation";
import { OnboardingAnswers } from "@railor/types";
import { requireSession } from "../../lib/auth";
import { materializeWorkspace, saveOnboarding } from "../../lib/org";

/** Autosave after every answer, so a reload never costs the user their work. */
export async function saveStep(step: number, answers: unknown) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  const parsed = OnboardingAnswers.partial().parse(answers);
  await saveOnboarding(session.organization.id, parsed, step);
  return { ok: true as const };
}

/**
 * Builds the workspace from the answers: corridors, provider eligibility, an
 * armed monitor and a filtered change feed. The dashboard is never empty.
 */
export async function finishOnboarding(answers: unknown) {
  const session = await requireSession();
  if (!session.organization) return;
  const parsed = OnboardingAnswers.parse(answers);
  await saveOnboarding(session.organization.id, parsed, 3);
  await materializeWorkspace(session.organization.id, session.user.id, parsed);
  redirect("/app");
}
