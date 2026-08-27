/**
 * Bootstraps the receiving-endpoint acceptance test: Skydo vs Xflow, both
 * real Indian receivers, correctly told apart by `stablecoin_mode` — Skydo
 * is `fiat_only` (its own product page lists crypto under what it's NOT
 * for), Xflow is `stablecoin_funded_fiat` (USDC/USDT from overseas buyers,
 * stablecoin leg stays offshore, INR lands with e-FIRA). If Railor's data
 * model can't hold that distinction, the model is still wrong — this file
 * is that test made real.
 *
 * Insert-only, like seed_sources.py's real providers — never touched by
 * seedDemoData's demo-provider delete, since these carry `is_demo: false`.
 *
 *   pnpm --filter @railor/database receiving-endpoints
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

interface RealProviderSeed {
  slug: string;
  name: string;
  category: string;
  description: string;
  websiteUrl: string;
  docsUrl: string;
  headquartersCountry: string;
  apiAccess: "public" | "private" | "partner" | "none" | "unknown";
  hasApi: boolean;
}

const PROVIDERS: RealProviderSeed[] = [
  {
    slug: "skydo",
    name: "Skydo",
    category: "Cross-border payments",
    description:
      "Receiving platform for Indian businesses and freelancers accepting international payments from 150+ countries, settled in INR. Its own product page lists crypto receiving under what Skydo is explicitly not for.",
    websiteUrl: "https://www.skydo.com",
    docsUrl: "https://www.skydo.com/features/global-remittances",
    headquartersCountry: "IN",
    apiAccess: "unknown",
    hasApi: false,
  },
  {
    slug: "xflow",
    name: "Xflow",
    category: "Stablecoin infrastructure",
    description:
      "Lets Indian businesses accept USDC/USDT from overseas buyers on Solana, Tron and EVM chains; the stablecoin leg stays offshore and settlement lands in INR with e-FIRA documentation.",
    websiteUrl: "https://www.xflowpay.com",
    docsUrl: "https://www.xflowpay.com/products/stablecoins",
    headquartersCountry: "IN",
    apiAccess: "public",
    hasApi: true,
  },
];

async function upsertProvider(db: Awaited<ReturnType<typeof getDb>>, p: RealProviderSeed): Promise<string> {
  const [existing] = await db.select().from(s.providers).where(eq(s.providers.slug, p.slug)).limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(s.providers)
    .values({
      slug: p.slug,
      name: p.name,
      isDemo: false,
      category: p.category,
      description: p.description,
      websiteUrl: p.websiteUrl,
      docsUrl: p.docsUrl,
      headquartersCountry: p.headquartersCountry,
      apiAccess: p.apiAccess,
      hasApi: p.hasApi,
    })
    .returning({ id: s.providers.id });
  return row!.id;
}

async function upsertSourceDocument(db: Awaited<ReturnType<typeof getDb>>, providerId: string, url: string, title: string): Promise<string> {
  const [existing] = await db.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.url, url)).limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(s.sourceDocuments)
    .values({ providerId, url, title, sourceType: "official_docs", crawlFrequencyHours: 168 })
    .returning({ id: s.sourceDocuments.id });
  return row!.id;
}

/** retrievedAt/lastVerifiedAt are today: verified live via WebFetch this session, not scraped by the crawler. */
async function upsertEvidence(
  db: Awaited<ReturnType<typeof getDb>>,
  providerId: string,
  sourceDocumentId: string,
  url: string,
  title: string,
  excerpt: string,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(s.evidence)
    .where(and(eq(s.evidence.providerId, providerId), eq(s.evidence.sourceUrl, url)))
    .limit(1);
  if (existing) return existing.id;
  const now = new Date();
  const [row] = await db
    .insert(s.evidence)
    .values({
      providerId,
      sourceDocumentId,
      sourceUrl: url,
      sourceTitle: title,
      sourceType: "official_docs",
      retrievedAt: now,
      lastVerifiedAt: now,
      confidence: "0.95",
      rawExcerpt: excerpt,
      rawHash: hash(url + excerpt),
    })
    .returning({ id: s.evidence.id });
  return row!.id;
}

export async function bootstrap(): Promise<string[]> {
  const db = await getDb();
  const log: string[] = [];

  const providerIds: Record<string, string> = {};
  for (const p of PROVIDERS) {
    providerIds[p.slug] = await upsertProvider(db, p);
    log.push(`provider ready: ${p.slug}`);
  }

  const skydoDoc = await upsertSourceDocument(
    db,
    providerIds.skydo!,
    "https://www.skydo.com/features/global-remittances",
    "Skydo — Global Remittances",
  );
  const skydoEvidence = await upsertEvidence(
    db,
    providerIds.skydo!,
    skydoDoc,
    "https://www.skydo.com/features/global-remittances",
    "Skydo — Global Remittances",
    "Skydo lists \"Receiving payments via credit cards/crypto\" under what Skydo is explicitly not for; 150+ countries supported sending to Indian receiving accounts, settled in INR.",
  );

  const xflowDoc = await upsertSourceDocument(
    db,
    providerIds.xflow!,
    "https://www.xflowpay.com/products/stablecoins",
    "Xflow — Stablecoins",
  );
  const xflowEvidence = await upsertEvidence(
    db,
    providerIds.xflow!,
    xflowDoc,
    "https://www.xflowpay.com/products/stablecoins",
    "Xflow — Stablecoins",
    "\"Stablecoins stay outside India. Buyers pay in USDC or USDT, funds convert offshore into USD, and only fiat is settled into India.\" Networks: Solana, Tron, EVM (Polygon, Ethereum). \"Every payout comes with an e-FIRA issued by an AD Category I bank.\" API/integration guide referenced in-page.",
  );

  const existingEndpoints = await db.select().from(s.receivingEndpoints);
  const has = (providerId: string) => existingEndpoints.some((e) => e.providerId === providerId);
  const hasAssetRow = (providerId: string, asset: string, network: string) =>
    existingEndpoints.some(
      (e) => e.providerId === providerId && e.incomingAsset === asset && e.incomingNetwork === network,
    );

  if (!has(providerIds.skydo!)) {
    await db.insert(s.receivingEndpoints).values({
      providerId: providerIds.skydo!,
      countryCode: "IN",
      endpointType: "bank_account",
      stablecoinMode: "fiat_only",
      customerType: "business",
      destinationCurrency: "INR",
      availability: "supported",
      note: "Receives international fiat payments from 150+ originating countries via global/local receiving accounts, settled in INR. Explicitly does not support crypto or card receiving — this is a real, useful receiver with zero stablecoin path in or out.",
      evidenceId: skydoEvidence,
      lastVerifiedAt: new Date(),
    });
    log.push("receiving endpoint created: skydo (IN, fiat_only)");
  } else {
    log.push("receiving endpoint already exists: skydo");
  }

  // One row per (asset, network) pair the product page itself names — "Buyers
  // pay in USDC or USDT ... Networks: Solana, Tron, EVM (Polygon, Ethereum)" —
  // rather than one asset-less row, so a query for a specific asset/network
  // (the shape every real corridor search uses) actually matches Xflow.
  const xflowAssets = ["USDC", "USDT"];
  const xflowNetworks = ["solana", "tron", "polygon", "ethereum"];
  let xflowCreated = 0;
  for (const asset of xflowAssets) {
    for (const network of xflowNetworks) {
      if (hasAssetRow(providerIds.xflow!, asset, network)) continue;
      await db.insert(s.receivingEndpoints).values({
        providerId: providerIds.xflow!,
        countryCode: "IN",
        endpointType: "bank_account",
        stablecoinMode: "stablecoin_funded_fiat",
        customerType: "business",
        incomingAsset: asset,
        incomingNetwork: network,
        destinationCurrency: "INR",
        complianceDocs: "e-FIRA",
        availability: "supported",
        note: "Accepts USDC/USDT from overseas buyers on Solana, Tron and EVM chains (Polygon, Ethereum). The stablecoin leg never enters India — it converts offshore, and only INR fiat is settled to the Indian business's bank account. Public API/integration docs referenced on the product page.",
        evidenceId: xflowEvidence,
        lastVerifiedAt: new Date(),
      });
      xflowCreated += 1;
    }
  }
  log.push(`receiving endpoints created: xflow (IN, stablecoin_funded_fiat) — ${xflowCreated} asset/network row(s), ${xflowAssets.length * xflowNetworks.length - xflowCreated} already present`);

  return log;
}

async function main() {
  const { close } = await getDbHandle();
  for (const line of await bootstrap()) console.log(line);
  await close();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
