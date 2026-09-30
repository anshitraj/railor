/** Only invoked by the isolated browser harness. Refuses any network database. */
if (process.env.DATABASE_URL?.trim() || !process.env.PGLITE_DATA_DIR?.includes("railor-browser-test-")) throw new Error("Disposable browser-test database required");
const dbModule = await import("@railor/database");
const { ensureMigrated, seedDemoData, getDb, organizations, organizationMembers, users, sessions, providers, providerProducts, providerRoutes, evidence } = dbModule;
await ensureMigrated(); await seedDemoData(); const db = await getDb();
const [org] = await db.insert(organizations).values({ name: "Browser Test Workspace", slug: "browser-test", entityCountry: "IN" }).returning();
for (const [email, role, token, isAdmin] of [["owner@browser.test", "owner", "browser-test-owner", false], ["reviewer@browser.test", "admin", "browser-test-reviewer", false], ["operator@browser.test", "viewer", "browser-test-operator", true]] as const) {
  const [user] = await db.insert(users).values({ email, isAdmin }).returning();
  await db.insert(organizationMembers).values({ organizationId: org!.id, userId: user!.id, role });
  await db.insert(sessions).values({ token, userId: user!.id, expiresAt: new Date(Date.now() + 3600_000) });
}
const [provider] = await db.insert(providers).values({ slug: "browser-fixture", name: "Browser Fixture Provider", isDemo: false, category: "Direct provider", description: "Synthetic fixture only in isolated test DB" }).returning();
await db.insert(providerProducts).values({ providerId: provider!.id, product: "payout", name: "Payouts" });
const [ev] = await db.insert(evidence).values({ providerId: provider!.id, sourceUrl: "https://example.test/route", sourceTitle: "Browser fixture", sourceType: "official_docs", retrievedAt: new Date(), lastVerifiedAt: new Date(), confidence: "0.95", rawExcerpt: "Test-only USDC Base to AED payout for IN business.", rawHash: "browser-fixture" }).returning();
await db.insert(providerRoutes).values({ providerId: provider!.id, product: "payout", entityCountry: "IN", customerType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED", availability: "supported", evidenceId: ev!.id, lastVerifiedAt: new Date() });
// Payout-integrated providers (records only — no credentials, nothing is ever called).
await db.insert(providers).values([
  { slug: "bridge", name: "Bridge", isDemo: false, category: "Direct provider", description: "Fixture record for connection cards" },
  { slug: "circle", name: "Circle", isDemo: false, category: "Direct provider", description: "Fixture record for connection cards" },
  { slug: "wise", name: "Wise", isDemo: false, category: "Direct provider", description: "Fixture record for connection cards" },
  { slug: "airwallex", name: "Airwallex", isDemo: false, category: "Direct provider", description: "Fixture record for connection cards" },
]).onConflictDoNothing();
await (await dbModule.getDbHandle()).close();
console.log("Disposable browser database seeded.");
