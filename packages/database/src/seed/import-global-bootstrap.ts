/**
 * Imports a user-supplied global-source registry and stablecoin/network seed.
 *
 * This does NOT create provider capabilities, payout corridors, or receiving
 * endpoints.  Token/network support is a reference fact only; a provider
 * route remains UNKNOWN until its own API or docs establish the full tuple.
 *
 * pnpm --filter @railor/database import-global-bootstrap -- \
 *   --registry C:\path\railor_global_source_registry.json \
 *   --stablecoins C:\path\railor_stablecoin_network_seed.json
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

type Verification = "provider_reported" | "railor_observed" | "provider_verified";

interface RegistrySource {
  id: string;
  category: string;
  authority: string;
  entity?: string;
  url: string;
  recommended_refresh?: string;
}

interface StablecoinInput {
  symbol: string;
  issuer: string;
  reference_currency: string;
  verification_type: string;
  source_url: string;
  source_as_of?: string;
  networks: string[];
  conflict_note?: string;
  refresh_note?: string;
  regional_note?: string;
  status?: string;
  note?: string;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const refreshHours = (value: string | undefined): number =>
  ({ daily: 24, weekly: 168, monthly: 24 * 30, quarterly: 24 * 90, annual: 24 * 365 } as Record<string, number>)[
    value?.toLowerCase() ?? ""
  ] ?? 24 * 7;

const verificationFor = (value: string | undefined): Verification =>
  value === "RAILOR_OBSERVED"
    ? "railor_observed"
    : value === "PROVIDER_VERIFIED"
      ? "provider_verified"
      : "provider_reported";

const assetNames: Record<string, string> = {
  USDC: "USD Coin",
  EURC: "Euro Coin",
  USDT: "Tether USD",
  PYUSD: "PayPal USD",
  RLUSD: "Ripple USD",
  USDG: "Global Dollar",
  FDUSD: "First Digital USD",
  GHO: "GHO",
  USDS: "USDS",
};

/** Human source labels are preserved; this only normalizes a database key. */
const networkSlugs: Record<string, string> = {
  "OP Mainnet": "optimism",
  "Polygon PoS": "polygon",
  "BNB Chain": "bnb-chain",
  TRON: "tron",
  "XRPL EVM": "xrpl-evm",
};

function networkSlug(name: string): string {
  return networkSlugs[name] ?? name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${(error as Error).message}`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function parseRegistry(raw: string): { generatedAt: Date; sources: RegistrySource[] } {
  const value = parseJson<Record<string, unknown>>(raw, "registry");
  const generatedAt = new Date(requireString(value.generated_at, "registry.generated_at"));
  if (Number.isNaN(generatedAt.getTime())) throw new Error("registry.generated_at is not a valid date");
  if (!Array.isArray(value.sources)) throw new Error("registry.sources must be an array");
  const sources = value.sources.map((item, index) => {
    const source = item as Record<string, unknown>;
    const url = requireString(source.url, `registry.sources[${index}].url`);
    try {
      new URL(url);
    } catch {
      throw new Error(`registry.sources[${index}].url is invalid`);
    }
    return {
      id: requireString(source.id, `registry.sources[${index}].id`),
      category: requireString(source.category, `registry.sources[${index}].category`),
      // The supplied registry intentionally leaves this out for issuer and
      // provider records. Preserve the record without pretending a global
      // standards body endorsed it.
      authority: typeof source.authority === "string" && source.authority.trim()
        ? source.authority.trim()
        : "issuer_or_provider",
      entity: typeof source.entity === "string" ? source.entity : undefined,
      url,
      recommended_refresh: typeof source.recommended_refresh === "string" ? source.recommended_refresh : undefined,
    };
  });
  return { generatedAt, sources };
}

function parseStablecoins(raw: string): { generatedAt: Date; notice: string; stablecoins: StablecoinInput[] } {
  const value = parseJson<Record<string, unknown>>(raw, "stablecoin seed");
  const generatedAt = new Date(requireString(value.generated_at, "stablecoin_seed.generated_at"));
  if (Number.isNaN(generatedAt.getTime())) throw new Error("stablecoin_seed.generated_at is not a valid date");
  if (!Array.isArray(value.stablecoins)) throw new Error("stablecoin_seed.stablecoins must be an array");
  const stablecoins = value.stablecoins.map((item, index) => {
    const token = item as Record<string, unknown>;
    const sourceUrl = requireString(token.source_url, `stablecoin_seed.stablecoins[${index}].source_url`);
    try {
      new URL(sourceUrl);
    } catch {
      throw new Error(`stablecoin_seed.stablecoins[${index}].source_url is invalid`);
    }
    if (!Array.isArray(token.networks) || !token.networks.every((network) => typeof network === "string" && network.trim())) {
      throw new Error(`stablecoin_seed.stablecoins[${index}].networks must be a string array`);
    }
    return {
      symbol: requireString(token.symbol, `stablecoin_seed.stablecoins[${index}].symbol`).toUpperCase(),
      issuer: requireString(token.issuer, `stablecoin_seed.stablecoins[${index}].issuer`),
      reference_currency: requireString(token.reference_currency, `stablecoin_seed.stablecoins[${index}].reference_currency`).toUpperCase(),
      verification_type: requireString(token.verification_type, `stablecoin_seed.stablecoins[${index}].verification_type`),
      source_url: sourceUrl,
      source_as_of: typeof token.source_as_of === "string" ? token.source_as_of : undefined,
      networks: token.networks.map((network) => network.trim()),
      conflict_note: typeof token.conflict_note === "string" ? token.conflict_note : undefined,
      refresh_note: typeof token.refresh_note === "string" ? token.refresh_note : undefined,
      regional_note: typeof token.regional_note === "string" ? token.regional_note : undefined,
      status: typeof token.status === "string" ? token.status : undefined,
      note: typeof token.note === "string" ? token.note : undefined,
    };
  });
  return { generatedAt, notice: typeof value.notice === "string" ? value.notice : "", stablecoins };
}

function sourceExcerpt(source: RegistrySource): string {
  return `Imported source-registry record: ${source.category}; authority=${source.authority}${source.entity ? `; entity=${source.entity}` : ""}.`;
}

function tokenExcerpt(token: StablecoinInput): string {
  return `Imported issuer/protocol-reported ${token.symbol} reference: ${token.networks.length} listed network(s). This is not provider-route evidence.`;
}

async function upsertReferenceSource(
  db: Awaited<ReturnType<typeof getDb>>,
  source: RegistrySource,
  generatedAt: Date,
  inputHash: string,
): Promise<void> {
  await db
    .insert(s.referenceSources)
    .values({
      id: source.id,
      category: source.category,
      authority: source.authority,
      entity: source.entity,
      sourceUrl: source.url,
      sourceType: "official_docs",
      verificationType: "provider_reported",
      retrievedAt: generatedAt,
      lastVerifiedAt: generatedAt,
      evidenceExcerpt: sourceExcerpt(source),
      confidence: "0.80",
      recommendedRefreshHours: refreshHours(source.recommended_refresh),
      inputHash,
    })
    .onConflictDoUpdate({
      target: s.referenceSources.id,
      set: {
        category: source.category,
        authority: source.authority,
        entity: source.entity,
        sourceUrl: source.url,
        retrievedAt: generatedAt,
        lastVerifiedAt: generatedAt,
        evidenceExcerpt: sourceExcerpt(source),
        recommendedRefreshHours: refreshHours(source.recommended_refresh),
        inputHash,
        active: true,
      },
    });
}

async function ensureTokenSource(
  db: Awaited<ReturnType<typeof getDb>>,
  token: StablecoinInput,
  generatedAt: Date,
  inputHash: string,
  sourceByUrl: Map<string, string>,
): Promise<string> {
  const known = sourceByUrl.get(token.source_url);
  if (known) return known;
  const id = `stablecoin:${token.symbol.toLowerCase()}`;
  const source: RegistrySource = {
    id,
    category: token.verification_type === "PROTOCOL_REPORTED" ? "stablecoin_protocol" : "stablecoin_issuer",
    authority: token.verification_type.toLowerCase(),
    entity: token.symbol,
    url: token.source_url,
    recommended_refresh: "daily",
  };
  await upsertReferenceSource(db, source, generatedAt, inputHash);
  sourceByUrl.set(token.source_url, id);
  return id;
}

export async function importGlobalBootstrap(registryPath: string, stablecoinsPath: string) {
  const [registryRaw, stablecoinsRaw] = await Promise.all([readFile(registryPath, "utf8"), readFile(stablecoinsPath, "utf8")]);
  const registry = parseRegistry(registryRaw);
  const seed = parseStablecoins(stablecoinsRaw);
  const db = await getDb();
  const registryHash = hash(registryRaw);
  const stablecoinHash = hash(stablecoinsRaw);
  const sourceByUrl = new Map(registry.sources.map((source) => [source.url, source.id]));
  const summary = { sources: 0, assets: 0, chains: 0, acceptedEdges: 0, heldEdges: 0 };

  for (const source of registry.sources) {
    await upsertReferenceSource(db, source, registry.generatedAt, registryHash);
    summary.sources += 1;
  }

  for (const token of seed.stablecoins) {
    const referenceSourceId = await ensureTokenSource(db, token, seed.generatedAt, stablecoinHash, sourceByUrl);
    const status = token.status === "RESEARCH_REQUIRED"
      ? "research_required"
      : token.conflict_note
        ? "accepted_with_conflict"
        : "accepted";
    const note = [token.conflict_note, token.refresh_note, token.regional_note, token.note].filter(Boolean).join(" ") || null;
    const sourceAsOf = token.source_as_of ? new Date(`${token.source_as_of}T00:00:00.000Z`) : null;
    if (sourceAsOf && Number.isNaN(sourceAsOf.getTime())) throw new Error(`${token.symbol}.source_as_of is not a valid date`);
    const verificationType = verificationFor(token.verification_type);

    await db
      .insert(s.assets)
      .values({
        symbol: token.symbol,
        name: assetNames[token.symbol] ?? token.symbol,
        kind: "stablecoin",
        issuer: token.issuer,
        peggedTo: token.reference_currency,
      })
      .onConflictDoUpdate({
        target: s.assets.symbol,
        set: {
          name: assetNames[token.symbol] ?? token.symbol,
          kind: "stablecoin",
          issuer: token.issuer,
          peggedTo: token.reference_currency,
        },
      });
    summary.assets += 1;

    const [assetReference] = await db
      .insert(s.assetReferences)
      .values({
        assetSymbol: token.symbol,
        referenceSourceId,
        issuer: token.issuer,
        referenceCurrency: token.reference_currency,
        sourceUrl: token.source_url,
        sourceType: "official_docs",
        verificationType,
        sourceAsOf,
        retrievedAt: seed.generatedAt,
        lastVerifiedAt: seed.generatedAt,
        evidenceExcerpt: tokenExcerpt(token),
        confidence: "0.85",
        status,
        note,
        inputHash: stablecoinHash,
      })
      .onConflictDoUpdate({
        target: [s.assetReferences.assetSymbol, s.assetReferences.referenceSourceId],
        set: {
          issuer: token.issuer,
          referenceCurrency: token.reference_currency,
          sourceUrl: token.source_url,
          verificationType,
          sourceAsOf,
          retrievedAt: seed.generatedAt,
          lastVerifiedAt: seed.generatedAt,
          evidenceExcerpt: tokenExcerpt(token),
          confidence: "0.85",
          status,
          note,
          inputHash: stablecoinHash,
        },
      })
      .returning({ id: s.assetReferences.id });

    for (const networkName of token.networks) {
      const slug = networkSlug(networkName);
      await db
        .insert(s.blockchains)
        .values({ slug, name: networkName })
        .onConflictDoNothing({ target: s.blockchains.slug });
      summary.chains += 1;

      const edgeStatus = token.conflict_note && token.symbol === "FDUSD" ? "conflict" : status;
      await db
        .insert(s.assetNetworkReferences)
        .values({
          assetReferenceId: assetReference!.id,
          networkName,
          blockchainSlug: slug,
          sourceUrl: token.source_url,
          sourceType: "official_docs",
          verificationType,
          retrievedAt: seed.generatedAt,
          lastVerifiedAt: seed.generatedAt,
          evidenceExcerpt: `${token.symbol} is listed on ${networkName} in the imported issuer/protocol source. Not provider-route evidence.`,
          confidence: "0.85",
          status: edgeStatus,
          note,
          inputHash: stablecoinHash,
        })
        .onConflictDoUpdate({
          target: [s.assetNetworkReferences.assetReferenceId, s.assetNetworkReferences.networkName],
          set: {
            blockchainSlug: slug,
            sourceUrl: token.source_url,
            verificationType,
            retrievedAt: seed.generatedAt,
            lastVerifiedAt: seed.generatedAt,
            confidence: "0.85",
            status: edgeStatus,
            note,
            inputHash: stablecoinHash,
          },
        });

      if (edgeStatus === "accepted" || edgeStatus === "accepted_with_conflict") {
        await db
          .insert(s.assetNetworks)
          .values({ assetSymbol: token.symbol, blockchainSlug: slug })
          .onConflictDoNothing({ target: [s.assetNetworks.assetSymbol, s.assetNetworks.blockchainSlug] });
        summary.acceptedEdges += 1;
      } else {
        summary.heldEdges += 1;
      }
    }
  }

  return summary;
}

function argumentValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const registryPath = argumentValue("--registry");
  const stablecoinsPath = argumentValue("--stablecoins");
  if (!registryPath || !stablecoinsPath) {
    throw new Error("Usage: import-global-bootstrap --registry <file> --stablecoins <file>");
  }
  const { close } = await getDbHandle();
  try {
    const summary = await importGlobalBootstrap(registryPath, stablecoinsPath);
    console.log(`sources=${summary.sources} assets=${summary.assets} chain-references=${summary.chains} accepted-edges=${summary.acceptedEdges} held-for-review=${summary.heldEdges}`);
  } finally {
    await close();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
