import "server-only";
import type { OnboardingAnswers } from "@railor/types";
import { findOrCreateUserByEmail, startSession } from "./auth";
import {
  createOrganizationForUser,
  getPrimaryOrgForUser,
  materializeWorkspace,
  renameOrganization,
  resetOrgWorkspace,
  saveOnboarding,
  setKybItem,
} from "./org";

export const DEMO_EMAIL = "demo@railor.dev";
const DEMO_ORG_NAME = "Demo Workspace";

const DEMO_ANSWERS: OnboardingAnswers = {
  building: "payments",
  entityCountry: "IN",
  targetCountries: ["AE", "GB"],
  settlementCurrencies: ["AED", "GBP"],
  interests: ["stablecoin_to_fiat", "bank_payouts", "kyc_kyb"],
  assumptions: [],
};

/**
 * The exact mandatory-requirement set Northwind Rails and Ironwood Settlement
 * both ask for. Marking precisely this set — not a plausible-looking subset —
 * is what promotes them from "additional requirements" to "supported for
 * you" on the primary IN→AE corridor, which is the story the rest of the
 * marketing site tells about that same route.
 */
const DEMO_KYB_HAVE = [
  "company_registration",
  "director_identity",
  "ubo_disclosure",
  "business_address_proof",
  "sanctions_screening",
  "source_of_funds",
];

/**
 * Signs the visitor into one fixed, public-facing workspace — same identity
 * every time, reset to the same curated state on every entry.
 *
 * Deliberately not "the visitor's own scratch org": a fresh org per click
 * would mean the very first thing a curious visitor sees is an empty
 * onboarding flow, which is exactly what the demo exists to skip. A shared
 * account is simpler, but only if nothing a previous visitor changed can
 * survive — so this rebuilds the corridors, monitor, alerts and KYB profile
 * from the canned answers before anyone lands on /app.
 */
export async function provisionDemoSession(): Promise<void> {
  const user = await findOrCreateUserByEmail(DEMO_EMAIL, "Demo User");
  if (!user) throw new Error("failed to provision demo user");

  const org =
    (await getPrimaryOrgForUser(user.id)) ??
    (await createOrganizationForUser(user.id, DEMO_EMAIL, DEMO_ORG_NAME));

  await resetOrgWorkspace(org.id);
  await renameOrganization(org.id, DEMO_ORG_NAME);
  await saveOnboarding(org.id, DEMO_ANSWERS, 3);
  await materializeWorkspace(org.id, user.id, DEMO_ANSWERS);

  for (const key of DEMO_KYB_HAVE) {
    await setKybItem(org.id, key, "have", user.id);
  }

  await startSession(user.id);
}
