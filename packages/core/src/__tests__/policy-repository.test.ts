/**
 * Policy version immutability + PaymentIntent validation, against a
 * throwaway PGlite DB (same isolation as decision-engine.test.ts).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "railor-policy-repository-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.DATABASE_URL = "";

const { getDbHandle, ensureMigrated, organizations, getDb } = await import("@railor/database");
const { createPolicy, createPolicyVersion, activatePolicyVersion, getPolicyVersion } = await import("../decision-repository.js");
const { PaymentIntent, PolicyRules } = await import("@railor/types");

let organizationId: string;

beforeAll(async () => {
  await ensureMigrated();
  const db = await getDb();
  const [org] = await db.insert(organizations).values({ name: "Policy Repo Test Org", slug: `policy-repo-${crypto.randomUUID()}` }).returning();
  organizationId = org!.id;
}, 30_000);

afterAll(async () => {
  const { close } = await getDbHandle();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("PaymentIntent validation", () => {
  it("accepts a well-formed intent", () => {
    const result = PaymentIntent.safeParse({
      sourceEntityCountry: "IN",
      destinationCountry: "AE",
      destinationCurrency: "AED",
      sourceAsset: "USDC",
      amount: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing required field (destinationCountry)", () => {
    const result = PaymentIntent.safeParse({ sourceEntityCountry: "IN", amount: 1000 });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed country code instead of coercing or guessing", () => {
    const result = PaymentIntent.safeParse({
      sourceEntityCountry: "India", // not ISO 3166-1 alpha-2
      destinationCountry: "AE",
      amount: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    const result = PaymentIntent.safeParse({ sourceEntityCountry: "IN", destinationCountry: "AE", amount: 0 });
    expect(result.success).toBe(false);
  });

  it("defaults sourceEntityType, beneficiaryType and preference without fabricating any other field", () => {
    const result = PaymentIntent.parse({ sourceEntityCountry: "IN", destinationCountry: "AE", amount: 1000 });
    expect(result.sourceEntityType).toBe("business");
    expect(result.beneficiaryType).toBe("business");
    expect(result.preference).toBe("balanced");
    expect(result.sourceAsset).toBeUndefined();
    expect(result.destinationCurrency).toBeUndefined();
  });
});

describe("policy version immutability", () => {
  it("activating a version supersedes the previously-active one, and both are then immutable", async () => {
    const { policy, version: v1 } = await createPolicy(organizationId, `immutable-test-${crypto.randomUUID()}`, PolicyRules.parse({}));
    const activated1 = await activatePolicyVersion(organizationId, policy.id, v1.id);
    expect(activated1.ok).toBe(true);
    if (!activated1.ok) return;
    expect(activated1.version.status).toBe("active");
    expect(activated1.version.activatedAt).not.toBeNull();

    const v2 = await createPolicyVersion(organizationId, policy.id, PolicyRules.parse({ requireLiveQuote: true }));
    expect(v2).not.toBeNull();
    const activated2 = await activatePolicyVersion(organizationId, policy.id, v2!.id);
    expect(activated2.ok).toBe(true);

    const v1After = await getPolicyVersion(organizationId, v1.id);
    expect(v1After!.status).toBe("superseded");
    expect(v1After!.supersededAt).not.toBeNull();
    // The superseded version's own rules are exactly what they were created with — never rewritten by the later activation.
    expect(v1After!.rules).toEqual(PolicyRules.parse({}));
  });

  it("a superseded version can never be re-activated", async () => {
    const { policy, version: v1 } = await createPolicy(organizationId, `immutable-test-2-${crypto.randomUUID()}`, PolicyRules.parse({}));
    await activatePolicyVersion(organizationId, policy.id, v1.id);
    const v2 = await createPolicyVersion(organizationId, policy.id, PolicyRules.parse({}));
    await activatePolicyVersion(organizationId, policy.id, v2!.id);

    const reactivation = await activatePolicyVersion(organizationId, policy.id, v1.id);
    expect(reactivation.ok).toBe(false);
  });

  it("creating a new version never mutates an existing one — each version_number is a distinct, permanent row", async () => {
    const { policy, version: v1 } = await createPolicy(organizationId, `immutable-test-3-${crypto.randomUUID()}`, PolicyRules.parse({ maximumEtaMinutes: 60 }));
    const v2 = await createPolicyVersion(organizationId, policy.id, PolicyRules.parse({ maximumEtaMinutes: 30 }));
    const v1Reloaded = await getPolicyVersion(organizationId, v1.id);
    expect(v1Reloaded!.rules).toEqual(PolicyRules.parse({ maximumEtaMinutes: 60 }));
    expect(v2!.versionNumber).toBe(v1.versionNumber + 1);
  });
});
