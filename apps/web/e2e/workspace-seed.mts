if (process.env.DATABASE_URL?.trim() || !process.env.PGLITE_DATA_DIR?.includes("railor-browser-test-")) throw new Error("Disposable browser-test database required");
const { ensureMigrated, seedDemoData, getDbHandle, getDb, organizations, organizationMembers, users, sessions } = await import("@railor/database");
await ensureMigrated();
await seedDemoData();
const db = await getDb();
for (const role of ["owner", "viewer"] as const) {
  const [org] = await db.insert(organizations).values({ name: `Fresh ${role} workspace`, slug: `fresh-${role}` }).returning();
  const [user] = await db.insert(users).values({ email: `fresh-${role}@browser.test`, name: "Sam" }).returning();
  await db.insert(organizationMembers).values({ organizationId: org!.id, userId: user!.id, role });
  await db.insert(sessions).values({ token: `fresh-${role}`, userId: user!.id, expiresAt: new Date(Date.now() + 3600_000) });
}
console.log("Fresh onboarding fixtures ready");
await (await getDbHandle()).close();
