/**
 * Regression test for an HTTP-pass bug: a non-UUID path segment
 * (`GET /v1/decisions/not-a-uuid`, `.../evidence`, `.../events`,
 * `GET /v1/policies/not-a-uuid`) reached the Postgres driver directly and
 * came back as a raw "invalid input syntax for type uuid" error — leaking
 * the full SQL query text and the caller's own organization_id into the
 * response body, as an uncaught 400 instead of a clean 404. Fixed with a
 * single isUuid() guard at the top of every id-keyed lookup in
 * decision-repository.ts. These tests call those functions directly with a
 * garbage id and assert two things: no exception escapes, and the result is
 * the same "not found" shape a well-formed-but-nonexistent id would produce.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "railor-malformed-id-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.DATABASE_URL = "";

const { getDb, getDbHandle, ensureMigrated, organizations } = await import("@railor/database");
const {
  getPolicy,
  getPolicyVersion,
  listPolicyVersions,
  loadDecision,
  loadDecisionEvents,
  appendDecisionEvent,
  markRevalidationRequired,
} = await import("../decision-repository.js");

let organizationId: string;
const GARBAGE_IDS = ["not-a-uuid", "'; DROP TABLE decisions; --", "", "00000000-0000-0000-0000-00000000000"]; // last one is one character short

beforeAll(async () => {
  await ensureMigrated();
  const db = await getDb();
  const [org] = await db.insert(organizations).values({ name: "Malformed Id Test Org", slug: `malformed-id-${crypto.randomUUID()}` }).returning();
  organizationId = org!.id;
}, 30_000);

afterAll(async () => {
  const { close } = await getDbHandle();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("malformed ids never reach the driver", () => {
  it.each(GARBAGE_IDS)("getPolicy(%j) returns null, never throws", async (id) => {
    await expect(getPolicy(organizationId, id)).resolves.toBeNull();
  });

  it.each(GARBAGE_IDS)("getPolicyVersion(%j) returns null, never throws", async (id) => {
    await expect(getPolicyVersion(organizationId, id)).resolves.toBeNull();
  });

  it.each(GARBAGE_IDS)("listPolicyVersions(%j) returns an empty array, never throws", async (id) => {
    await expect(listPolicyVersions(organizationId, id)).resolves.toEqual([]);
  });

  it.each(GARBAGE_IDS)("loadDecision(%j) returns null, never throws", async (id) => {
    await expect(loadDecision(organizationId, id)).resolves.toBeNull();
  });

  it.each(GARBAGE_IDS)("loadDecisionEvents(%j) returns null, never throws", async (id) => {
    await expect(loadDecisionEvents(organizationId, id)).resolves.toBeNull();
  });

  it.each(GARBAGE_IDS)("appendDecisionEvent(%j) returns null, never throws", async (id) => {
    await expect(appendDecisionEvent(organizationId, id, "revalidation_requested", "test")).resolves.toBeNull();
  });

  it.each(GARBAGE_IDS)("markRevalidationRequired(%j) resolves without throwing", async (id) => {
    await expect(markRevalidationRequired(organizationId, id)).resolves.toBeUndefined();
  });
});
