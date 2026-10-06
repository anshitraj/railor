/** Synthetic route evidence only. Never seed this into a shared database. */
if (process.env.DATABASE_URL?.trim() || !process.env.PGLITE_DATA_DIR?.includes("railor-browser-test-")) throw new Error("Disposable browser-test database required");
const database = await import("@railor/database");
const core = await import("@railor/core");
const { PolicyRules } = await import("@railor/types");
const { ensureMigrated, seedDemoData, getDb, getDbHandle, organizations, organizationMembers, users, sessions, providers, providerProducts, providerRoutes, evidence } = database;
await ensureMigrated(); await seedDemoData();
const db = await getDb();
for (const [slug, name] of [["browser-permitted", "Atlas Test Rail"], ["browser-blocked", "Harbor Test Rail"]]) {
  const [provider] = await db.insert(providers).values({ slug, name, isDemo: false, category: "Direct provider", description: "Synthetic route fixture in disposable browser-test DB only" }).returning();
  await db.insert(providerProducts).values({ providerId: provider!.id, product: "payout", name: "Fixture payouts" });
  const [source] = await db.insert(evidence).values({ providerId: provider!.id, sourceUrl: "https://example.test/route", sourceTitle: "Synthetic browser route fixture", sourceType: "official_docs", retrievedAt: new Date(), lastVerifiedAt: new Date(), confidence: "0.95", rawExcerpt: "Synthetic evidence, not real provider access", rawHash: slug }).returning();
  await db.insert(providerRoutes).values([
    { providerId: provider!.id, product: "payout", entityCountry: "SG", customerType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "MX", destinationCurrency: "MXN", destinationNamedRail: "SPEI", availability: "supported", evidenceId: source!.id, lastVerifiedAt: new Date() },
    { providerId: provider!.id, product: "payout", entityCountry: "IN", customerType: "business", sourceCurrency: "INR", destinationCountry: "AE", destinationCurrency: "AED", availability: "supported", evidenceId: source!.id, lastVerifiedAt: new Date() },
  ]);
}
const [org] = await db.insert(organizations).values({ name: "Agent acceptance", slug: "agent-acceptance", entityCountry: "IN" }).returning();
for (const role of ["owner", "viewer"] as const) {
  const [user] = await db.insert(users).values({ email: `${role}@acceptance.test` }).returning();
  await db.insert(organizationMembers).values({ organizationId: org!.id, userId: user!.id, role });
  await db.insert(sessions).values({ token: `agent-test-${role}`, userId: user!.id, expiresAt: new Date(Date.now() + 3600000) });
}
const policy = await core.createPolicy(org!.id, "Acceptance policy", PolicyRules.parse({ requireExactRouteEvidence: true, requireConfirmedEntityEligibility: true, providerDenylist: ["browser-blocked"] }));
await core.activatePolicyVersion(org!.id, policy.policy.id, policy.version.id);
await (await getDbHandle()).close();
console.log("Agent acceptance fixtures seeded; no provider accounts, quotes or payments.");
