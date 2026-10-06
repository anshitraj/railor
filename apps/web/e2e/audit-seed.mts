/**
 * Seeds a disposable database with enough state that every screen renders its real controls:
 * a policy, beneficiaries, payments in every status, an approval waiting, a webhook endpoint.
 * Only invoked by the UI audit. Refuses any network database; nothing here can move money —
 * payments run on Railor's own test rail.
 */
if (process.env.DATABASE_URL?.trim() || !process.env.PGLITE_DATA_DIR?.includes("railor-browser-test-")) throw new Error("Disposable browser-test database required");
const dbModule = await import("@railor/database");
const core = await import("@railor/core");
const { PolicyRules } = await import("@railor/types");
const { ensureMigrated, seedDemoData, getDb, organizations, organizationMembers, users, sessions, providers, providerProducts, providerRoutes, providerCapabilities, evidence, payments: paymentsTable } = dbModule;
await ensureMigrated();
await seedDemoData();
const db = await getDb();
const { eq } = await import("drizzle-orm");

const [org] = await db.insert(organizations).values({ name: "Audit Workspace", slug: "browser-test", entityCountry: "IN" }).returning();
const people: Record<string, string> = {};
for (const [email, role, token, isAdmin] of [
  ["owner@browser.test", "owner", "browser-test-owner", false],
  ["reviewer@browser.test", "admin", "browser-test-reviewer", false],
  ["operator@browser.test", "viewer", "browser-test-operator", true],
] as const) {
  const [user] = await db.insert(users).values({ email, isAdmin }).returning();
  people[role === "viewer" ? "operator" : role] = user!.id;
  await db.insert(organizationMembers).values({ organizationId: org!.id, userId: user!.id, role });
  await db.insert(sessions).values({ token, userId: user!.id, expiresAt: new Date(Date.now() + 6 * 3600_000) });
}

// A provider with a verified route, plus the four payout-integrated providers as connection-card records.
const [provider] = await db.insert(providers).values({ slug: "browser-fixture", name: "Browser Fixture Provider", isDemo: false, category: "Direct provider", description: "Synthetic fixture only in isolated test DB" }).returning();
await db.insert(providerProducts).values({ providerId: provider!.id, product: "payout", name: "Payouts" });
const [ev] = await db.insert(evidence).values({ providerId: provider!.id, sourceUrl: "https://example.test/route", sourceTitle: "Browser fixture", sourceType: "official_docs", retrievedAt: new Date(), lastVerifiedAt: new Date(), confidence: "0.95", rawExcerpt: "Test-only USDC Base to AED payout for IN business.", rawHash: "browser-fixture" }).returning();
await db.insert(providerRoutes).values({ providerId: provider!.id, product: "payout", entityCountry: "IN", customerType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED", availability: "supported", evidenceId: ev!.id, lastVerifiedAt: new Date() });
// A medium-confidence capability exercises the public evidence preview, including long source titles.
const [folioEvidence] = await db.insert(evidence).values({ providerId: provider!.id, sourceUrl: "https://example.test/evidence", sourceTitle: "Browser fixture — Supported countries, entity eligibility and bank account payout requirements", sourceType: "official_docs", retrievedAt: new Date(), lastVerifiedAt: new Date(), confidence: "0.72", rawExcerpt: "Synthetic capability for isolated UI tests only.", rawHash: "browser-folio-fixture" }).returning();
await db.insert(providerCapabilities).values({ providerId: provider!.id, product: "payout", entityCountry: "IN", customerType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED", availability: "supported", evidenceId: folioEvidence!.id, lastVerifiedAt: new Date() });
await db.insert(providers).values([
  { slug: "bridge", name: "Bridge", isDemo: false, category: "Direct provider", description: "Fixture record for connection cards" },
  { slug: "circle", name: "Circle", isDemo: false, category: "Direct provider", description: "Fixture record for connection cards" },
  { slug: "wise", name: "Wise", isDemo: false, category: "Direct provider", description: "Fixture record for connection cards" },
  { slug: "airwallex", name: "Airwallex", isDemo: false, category: "Direct provider", description: "Fixture record for connection cards" },
]).onConflictDoNothing();

// An active policy that asks for approval above 5,000.
const policy = await core.createPolicy(org!.id, "Audit policy", PolicyRules.parse({ humanApprovalAboveAmount: 5000 }));
await core.activatePolicyVersion(org!.id, policy.policy.id, policy.version.id);

const owner = people.owner!;
const actor = { userId: owner, source: "user" as const, role: "owner" };
const UAE_IBAN = "AE070331234567890123456";
const dubai = await core.createBeneficiary(org!.id, owner, { holderType: "business", holderName: "Dubai Supplier LLC", country: "AE", currency: "AED", method: "iban", details: { iban: UAE_IBAN, bankName: "Emirates Test Bank" } });
await core.createBeneficiary(org!.id, owner, { holderType: "business", holderName: "Acme Supplies LLC", country: "US", currency: "USD", method: "bank_us", details: { accountNumber: "1234567890", routingNumber: "021000021", bankName: "Chase" } });
await core.createBeneficiary(org!.id, owner, { holderType: "individual", holderName: "Jane Doe", country: "GB", currency: "GBP", method: "gb", details: { accountNumber: "55779911", sortCode: "200000" } });
await core.createBeneficiary(org!.id, owner, { holderType: "business", holderName: "Mumbai Traders Pvt Ltd", country: "IN", currency: "INR", method: "in_bank", details: { ifsc: "HDFC0001234", accountNumber: "123456789012" } });

const intent = (amount: number) => ({ sourceEntityCountry: "IN", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED", amount });
const make = async (amount: number) => (await core.createPayment(org!.id, actor, { mode: "test", intent: intent(amount), beneficiaryId: dubai.beneficiary.id, reference: `Invoice ${Math.round(amount)}` })).payment;
const forceStatus = (id: string, status: "completed" | "returned") => db.update(paymentsTable).set({ status, ...(status === "completed" ? { completedAt: new Date() } : {}) }).where(eq(paymentsTable.id, id));

await make(1000); // ready
const processing = await make(1200);
await core.submitPayment(org!.id, actor, processing.id); // processing
const done = await make(1300);
await core.submitPayment(org!.id, actor, done.id);
await forceStatus(done.id, "completed"); // completed
const returned = await make(1400.77);
await core.submitPayment(org!.id, actor, returned.id);
await forceStatus(returned.id, "returned"); // returned
await core.submitPayment(org!.id, actor, (await make(1500.55)).id); // awaiting funds
await core.submitPayment(org!.id, actor, (await make(1600.66)).id); // failed (compliance)
await core.submitPayment(org!.id, actor, (await make(1700.99)).id); // unknown
await core.cancelPayment(org!.id, actor, (await make(1800)).id); // cancelled
await make(6000); // requires approval
await core.createPayment(org!.id, actor, { mode: "test", intent: { ...intent(900), destinationCountry: "NG", destinationCurrency: "NGN" }, beneficiaryId: dubai.beneficiary.id }).catch(() => undefined); // mismatch: refused

await core.createWebhookEndpoint(org!.id, owner, { url: "https://example.com/hooks/railor", mode: "test" });

await (await dbModule.getDbHandle()).close();
console.log("Audit database seeded.");
