"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { OnboardingAnswers } from "@railor/types";
import { requireSession } from "../../lib/auth";
import { materializeWorkspace, saveOnboarding } from "../../lib/org";
import { appOrigin, onboardingFinishPath } from "../../lib/security";

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
export async function completeOnboarding(answers: unknown, returnTo?: string) {
  const session = await requireSession();
  if (!session.organization) throw new Error("Workspace unavailable");
  const parsed = OnboardingAnswers.parse(answers);
  const firstTime = !session.organization.onboardingCompletedAt;
  await saveOnboarding(session.organization.id, parsed, 5);
  const savedRoutes = await materializeWorkspace(session.organization.id, session.user.id, parsed);
  // One welcome email, the first time only (not when the questions are redone).
  // It goes out after the response, so onboarding never waits on email; with
  // no RESEND_API_KEY / SMTP_URL configured, sendMail simply does nothing.
  if (firstTime) {
    await scheduleWelcomeEmail({ to: session.user.email, name: session.user.name, dashboardName: session.organization.name, savedRoutes, appUrl: appOrigin() });
  }
  return { destination: onboardingFinishPath(returnTo) };
}

/** Best effort: the welcome email can never break or slow onboarding. */
async function scheduleWelcomeEmail(input: { to: string; name: string | null; dashboardName: string; savedRoutes: number; appUrl: string }) {
  try {
    const [{ sendMail }, { createOnboardedEmail }, { DEMO_EMAIL }] = await Promise.all([import("../../lib/mail"), import("../../lib/emails/onboarded"), import("../../lib/demo")]);
    if (input.to === DEMO_EMAIL) return;
    const message = createOnboardedEmail(input);
    try { after(async () => { await sendMail(message); }); }
    catch { void sendMail(message); } // outside a request (tests, scripts) there is no "after"
  } catch { /* email is optional */ }
}

/** Existing server callers can still finish with a redirect. */
export async function finishOnboarding(answers: unknown, returnTo?: string) {
  const { destination } = await completeOnboarding(answers, returnTo);
  redirect(destination);
}
