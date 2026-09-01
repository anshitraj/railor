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
import { and, eq, inArray } from "drizzle-orm";
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
  const [existing] = await db
    .select()
    .from(s.sourceDocuments)
    .where(and(eq(s.sourceDocuments.providerId, providerId), eq(s.sourceDocuments.url, url)))
    .limit(1);
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

  // Earlier revisions expanded Xflow's independently named assets and
  // networks into a Cartesian product. These rows are known to be an
  // unsupported inference, so remove only that narrow, previously-seeded
  // shape before adding the unpaired facts below.
  const inferredXflowPairIds = existingEndpoints
    .filter(
      (endpoint) =>
        endpoint.providerId === providerIds.xflow &&
        endpoint.countryCode === "IN" &&
        endpoint.incomingAsset !== null &&
        endpoint.incomingNetwork !== null,
    )
    .map((endpoint) => endpoint.id);
  if (inferredXflowPairIds.length) {
    await db.delete(s.receivingEndpoints).where(inArray(s.receivingEndpoints.id, inferredXflowPairIds));
    log.push(`removed ${inferredXflowPairIds.length} inferred Xflow asset/network endpoint pair(s)`);
  }

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

  // The page names two stablecoins and four networks, but it does not publish
  // the asset/network matrix.  Do not manufacture the eight Cartesian pairs:
  // we preserve the supported assets as independent facts and record the
  // India endpoint without an incoming pair. A USDC/Base → India query stays
  // UNKNOWN until Xflow's API or documentation establishes that exact tuple.
  const xflowAssets = ["USDC", "USDT"];
  const xflowCapabilities = await db
    .select()
    .from(s.providerCapabilities)
    .where(eq(s.providerCapabilities.providerId, providerIds.xflow!));
  let xflowAssetsCreated = 0;
  for (const asset of xflowAssets) {
    const alreadyPresent = xflowCapabilities.some(
      (capability) =>
        capability.product === "payout" &&
        capability.sourceAsset === asset &&
        capability.sourceNetwork === null &&
        capability.destinationCountry === null,
    );
    if (alreadyPresent) continue;
    await db.insert(s.providerCapabilities).values({
      providerId: providerIds.xflow!,
      product: "payout",
      sourceAsset: asset,
      customerType: "business",
      availability: "supported",
      note: "Xflow names this stablecoin as an accepted buyer-payment asset. It does not publish an asset-to-network or asset-to-India route matrix.",
      derivation: "source",
      evidenceId: xflowEvidence,
      lastVerifiedAt: new Date(),
    });
    xflowAssetsCreated += 1;
  }

  const hasXflowEndpoint = existingEndpoints.some(
    (endpoint) =>
      endpoint.providerId === providerIds.xflow &&
      endpoint.countryCode === "IN" &&
      endpoint.endpointType === "bank_account" &&
      endpoint.destinationCurrency === "INR" &&
      endpoint.incomingAsset === null &&
      endpoint.incomingNetwork === null,
  );
  if (!hasXflowEndpoint) {
    await db.insert(s.receivingEndpoints).values({
      providerId: providerIds.xflow!,
      countryCode: "IN",
      endpointType: "bank_account",
      stablecoinMode: "stablecoin_funded_fiat",
      customerType: "business",
      destinationCurrency: "INR",
      complianceDocs: "e-FIRA",
      availability: "supported",
      note: "Xflow documents a stablecoin-funded offshore conversion followed by INR settlement to an Indian business bank account. It does not publish asset/network pairs for that endpoint.",
      derivation: "source",
      evidenceId: xflowEvidence,
      lastVerifiedAt: new Date(),
    });
    log.push("receiving endpoint created: xflow (IN, stablecoin_funded_fiat; asset/network unpaired)");
  } else {
    log.push("receiving endpoint already exists: xflow (IN, unpaired)");
  }
  log.push(`Xflow asset facets created: ${xflowAssetsCreated}; exact asset/network pairs remain UNKNOWN`);

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
