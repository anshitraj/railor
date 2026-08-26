import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  alerts,
  apiKeys,
  changeEvents,
  getDb,
  orgKybItems,
  organizationMembers,
  organizations,
  providers,
  requirements,
  savedCorridors,
  users,
  watchlists,
} from "@railor/database";
import { corridorLabel, DEFAULT_LIVE_MONTHLY_CAP, DEFAULT_TEST_MONTHLY_CAP } from "@railor/core";
import type { CorridorQuery, OnboardingAnswers } from "@railor/types";
import { randomBytes } from "node:crypto";
import { hashApiKey, suggestedOrgName } from "./auth";
import { backfillWatchlistAlerts } from "./alerting";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workspace";

/**
 * Creates the organization *and* its starting test key. A developer never has
 * to go find a "create key" button before the docs work for them.
 */
export async function createOrganizationForUser(
  userId: string,
  email: string,
  name?: string,
) {
  const db = await getDb();
  const orgName = name?.trim() || suggestedOrgName(email);
  const base = slugify(orgName);
  const slug = `${base}-${randomBytes(2).toString("hex")}`;

  const [org] = await db
    .insert(organizations)
    .values({
      name: orgName,
      slug,
      emailDomain: email.split("@")[1] ?? null,
    })
    .returning();
  if (!org) throw new Error("organization insert failed");

  await db.insert(organizationMembers).values({
    organizationId: org.id,
    userId,
    role: "owner",
  });

  await createApiKey(org.id, userId, "Default test key", "test");
  return org;
}

/** Test keys stay revealable (Stripe's rule); live keys are shown once. */
export async function createApiKey(
  organizationId: string,
  userId: string | null,
  label: string,
  mode: "test" | "live",
) {
  const db = await getDb();
  const secret = `rail_${mode}_${randomBytes(24).toString("base64url")}`;
  const [key] = await db
    .insert(apiKeys)
    .values({
      organizationId,
      label,
      mode,
      prefix: secret.slice(0, 12),
      keyHash: hashApiKey(secret),
      revealableSecret: mode === "test" ? secret : null,
      // Interim flat default until real billing/plan tiers exist — see @railor/core's analytics module.
      monthlyRequestCap: mode === "test" ? DEFAULT_TEST_MONTHLY_CAP : DEFAULT_LIVE_MONTHLY_CAP,
      createdBy: userId,
    })
    .returning();
  return { key, secret };
}

export async function getOrgTestKey(organizationId: string) {
  const db = await getDb();
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.organizationId, organizationId), eq(apiKeys.mode, "test")))
    .orderBy(desc(apiKeys.createdAt))
    .limit(1);
  return key?.revealableSecret ?? null;
}

export async function saveOnboarding(
  organizationId: string,
  answers: Partial<OnboardingAnswers>,
  step: number,
) {
  const db = await getDb();
  await db
    .update(organizations)
    .set({
      building: answers.building ?? undefined,
      entityCountry: answers.entityCountry ?? undefined,
      targetCountries: answers.targetCountries ?? undefined,
      settlementCurrencies: answers.settlementCurrencies ?? undefined,
      interests: answers.interests ?? undefined,
      assumptions: answers.assumptions ?? undefined,
      onboardingStep: step,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));
}

/** A user's most recent organization, or null — same lookup `getSession` does, usable without a cookie. */
export async function getPrimaryOrgForUser(userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ org: organizations })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(desc(organizations.createdAt))
    .limit(1);
  return row?.org ?? null;
}

/**
 * Wipes an organization's corridors, monitors, alerts and KYB profile.
 *
 * Used only by the demo workspace: it's one fixed, public-facing account, so
 * every "View demo" click resets it to a clean slate first. A visitor can't
 * leave it broken for the next one, and nothing here runs for real users.
 */
export async function resetOrgWorkspace(organizationId: string) {
  const db = await getDb();
  await db.delete(alerts).where(eq(alerts.organizationId, organizationId));
  await db.delete(watchlists).where(eq(watchlists.organizationId, organizationId));
  await db.delete(savedCorridors).where(eq(savedCorridors.organizationId, organizationId));
  await db.delete(orgKybItems).where(eq(orgKybItems.organizationId, organizationId));
}

export async function renameOrganization(organizationId: string, name: string) {
  const db = await getDb();
  await db
    .update(organizations)
    .set({ name, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));
}

export async function getOrgMembers(organizationId: string) {
  const db = await getDb();
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organizationMembers.role,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(desc(organizationMembers.createdAt));
}

const INTEREST_TO_PRODUCT: Record<string, CorridorQuery["product"]> = {
  stablecoin_to_fiat: "off_ramp",
  fiat_to_stablecoin: "on_ramp",
  cards: "card_issuing",
  bank_payouts: "payout",
  collections: "collection",
  virtual_accounts: "virtual_account",
  kyc_kyb: "kyc_kyb",
  treasury: "treasury",
  wallet_infrastructure: "wallet",
};

/**
 * Which interests describe a *route* — something with an origin, a destination
 * and a rail — in the order we'd rather build the first corridor from.
 *
 * "KYC / KYB", "Treasury" and "Wallet infrastructure" are real interests, but
 * they are not corridor-shaped: constraining a country-to-country money
 * movement by `product: kyc_kyb` matches nothing, which used to hand a brand
 * new user a dashboard reading "0 compatible / 15 checked" plus a false
 * coverage warning. They still drive what Railor monitors; they just never
 * become the route's product filter.
 */
const CORRIDOR_PRODUCT_PRIORITY: ReadonlyArray<NonNullable<CorridorQuery["product"]>> = [
  "off_ramp",
  "payout",
  "on_ramp",
  "collection",
  "virtual_account",
  "card_issuing",
];

/** The best corridor-shaped product among the answers, or undefined for "any". */
function corridorProduct(interests: string[]): CorridorQuery["product"] | undefined {
  const chosen = new Set(
    interests.map((i) => INTEREST_TO_PRODUCT[i]).filter(Boolean),
  );
  return CORRIDOR_PRODUCT_PRIORITY.find((p) => chosen.has(p));
}

/**
 * Turns onboarding answers into a working workspace: corridors, a monitor and
 * a filtered change feed. This is why a new user never sees an empty
 * dashboard - the first screen is built from what they just told us.
 */
export async function materializeWorkspace(
  organizationId: string,
  userId: string,
  answers: OnboardingAnswers,
) {
  const db = await getDb();

  const entityCountry = answers.entityCountry ?? "US";
  const targets = answers.targetCountries.length ? answers.targetCountries : ["AE"];
  const currencies = answers.settlementCurrencies;
  const product = corridorProduct(answers.interests) ?? "payout";

  const asset = "USDC";
  const created: string[] = [];

  for (const [index, country] of targets.slice(0, 3).entries()) {
    const query: CorridorQuery = {
      entityCountry,
      customerType: "business",
      destinationCountry: country,
      destinationCurrency: currencies[index] ?? currencies[0],
      sourceAsset: asset,
      product,
    };
    const [row] = await db
      .insert(savedCorridors)
      .values({
        organizationId,
        label: corridorLabel(query),
        query: query as Record<string, unknown>,
        suggested: true,
        createdBy: userId,
      })
      .returning();
    if (row) created.push(row.id);
  }

  // One monitor armed on the primary corridor, so the change feed is live.
  const primary = created[0];
  if (primary) {
    const [corridor] = await db
      .select()
      .from(savedCorridors)
      .where(eq(savedCorridors.id, primary))
      .limit(1);
    if (corridor) {
      const [watch] = await db
        .insert(watchlists)
        .values({
          organizationId,
          targetType: "corridor",
          targetId: corridor.id,
          label: corridor.label,
          kinds: ["coverage_changed", "requirement_changed", "pricing_changed", "limit_changed"],
          createdBy: userId,
        })
        .returning();
      if (watch) await backfillWatchlistAlerts(watch.id);
    }
  }

  // Seed the org's alert feed with the changes that already touch its markets.
  const relevant = await db
    .select()
    .from(changeEvents)
    .orderBy(desc(changeEvents.detectedAt))
    .limit(40);
  const wanted = new Set<string>([entityCountry, ...targets]);
  const matching = relevant.filter((c) => {
    const values = Object.values(c.affects ?? {});
    return values.length === 0 ? false : values.some((v) => wanted.has(v));
  });
  if (matching.length) {
    await db.insert(alerts).values(
      matching.slice(0, 6).map((c) => ({
        organizationId,
        changeEventId: c.id,
      })),
    );
  }

  await db
    .update(organizations)
    .set({ onboardingCompletedAt: new Date(), onboardingStep: 3 })
    .where(eq(organizations.id, organizationId));

  return created.length;
}

export async function getSavedCorridors(organizationId: string) {
  const db = await getDb();
  return db
    .select()
    .from(savedCorridors)
    .where(eq(savedCorridors.organizationId, organizationId))
    .orderBy(desc(savedCorridors.createdAt));
}

export async function getWatchlists(organizationId: string) {
  const db = await getDb();
  return db
    .select()
    .from(watchlists)
    .where(eq(watchlists.organizationId, organizationId))
    .orderBy(desc(watchlists.createdAt));
}

export async function getOrgAlerts(organizationId: string, limit = 20) {
  const db = await getDb();
  return db
    .select({
      alert: alerts,
      change: changeEvents,
      providerName: providers.name,
      providerSlug: providers.slug,
    })
    .from(alerts)
    .innerJoin(changeEvents, eq(alerts.changeEventId, changeEvents.id))
    .innerJoin(providers, eq(changeEvents.providerId, providers.id))
    .where(eq(alerts.organizationId, organizationId))
    .orderBy(desc(changeEvents.detectedAt))
    .limit(limit);
}

/** Requirement keys the organization has marked as "have". */
export async function getSatisfiedRequirements(organizationId: string) {
  const db = await getDb();
  const rows = await db
    .select({ key: requirements.key, status: orgKybItems.status })
    .from(orgKybItems)
    .innerJoin(requirements, eq(orgKybItems.requirementId, requirements.id))
    .where(eq(orgKybItems.organizationId, organizationId));
  return rows.filter((r) => r.status === "have").map((r) => r.key);
}

export async function setKybItem(
  organizationId: string,
  requirementKey: string,
  status: "have" | "missing" | "unsure",
  userId: string,
) {
  const db = await getDb();
  const [req] = await db
    .select()
    .from(requirements)
    .where(eq(requirements.key, requirementKey))
    .limit(1);
  if (!req) return;

  const existing = await db
    .select()
    .from(orgKybItems)
    .where(
      and(
        eq(orgKybItems.organizationId, organizationId),
        eq(orgKybItems.requirementId, req.id),
      ),
    )
    .limit(1);

  if (existing.length) {
    await db
      .update(orgKybItems)
      .set({ status, updatedBy: userId, updatedAt: new Date() })
      .where(eq(orgKybItems.id, existing[0]!.id));
  } else {
    await db.insert(orgKybItems).values({
      organizationId,
      requirementId: req.id,
      status,
      updatedBy: userId,
    });
  }
}

export async function getKybProfile(organizationId: string) {
  const db = await getDb();
  const all = await db.select().from(requirements);
  const items = await db
    .select()
    .from(orgKybItems)
    .where(eq(orgKybItems.organizationId, organizationId));
  const byId = new Map(items.map((i) => [i.requirementId, i.status]));
  return all.map((r) => ({
    key: r.key,
    label: r.label,
    kind: r.kind,
    description: r.description,
    status: byId.get(r.id) ?? ("unsure" as const),
  }));
}

export async function providersByIds(ids: string[]) {
  if (!ids.length) return [];
  const db = await getDb();
  return db.select().from(providers).where(inArray(providers.id, ids));
}

