import { loadChangeFeed, loadPlatformCounts, remittanceProviderCatalog, searchCorridors } from "@railor/core";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { ensureMigrated, evidence as evidenceTable, getDb, providerCapabilities, providers } from "@railor/database";
import {
  CHANGE_KIND_LABEL,
  CONFIDENCE_BAND_LABEL,
  CorridorQuery,
  confidenceBand,
  decayConfidence,
  type ChangeKind,
  type SourceType,
} from "@railor/types";
import { MarketingNav } from "../components/marketing/nav";
import { MarketingFooter } from "../components/marketing/footer";
import { MarketingLanding } from "../components/marketing/landing";
import { LANDING_SIGNALS, type LandingChange, type LandingEvidence, type LandingSignal } from "../components/marketing/landing-data";
import { FIELD_LABELS, getReferenceOptions, optionsByField } from "../lib/reference";

export const dynamic = "force-dynamic";

function relativeTime(date: Date, now = Date.now()) {
  const minutes = Math.max(1, Math.round((now - date.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Every number and verdict on the landing page is computed from the live dataset — never written into the page. */
async function loadSignals(): Promise<LandingSignal[]> {
  return Promise.all(
    LANDING_SIGNALS.map(async (signal) => {
      try {
        const result = await searchCorridors(
          CorridorQuery.parse({
            entityCountry: signal.sourceCode,
            customerType: "business",
            sourceAsset: signal.asset,
            sourceNetwork: signal.sourceNetwork,
            destinationCountry: signal.destinationCode,
            destinationCurrency: signal.fiat,
          }),
          { recordTelemetry: false },
        );
        const eligible = result.results.filter((r) => r.eligibility === "supported" || r.eligibility === "additional_requirements");
        const confident = eligible.map((r) => r.confidence);
        return {
          ...signal,
          checked: result.providersChecked,
          supported: result.counts.supported,
          partial: result.counts.additional_requirements,
          topConfidence: confident.length ? Math.max(...confident) : null,
          evidenceCount: new Set(eligible.flatMap((r) => r.evidence.map((e) => e.sourceUrl))).size,
        };
      } catch {
        return { ...signal, checked: 0, supported: 0, partial: 0, topConfidence: null, evidenceCount: 0 };
      }
    }),
  );
}

async function loadChanges(): Promise<LandingChange[]> {
  try {
    const rows = await loadChangeFeed({ limit: 3 });
    return rows.map((r) => ({
      id: r.change.id,
      provider: r.providerName,
      summary: r.change.summary,
      kind: CHANGE_KIND_LABEL[r.change.kind as ChangeKind] ?? r.change.kind,
      when: relativeTime(r.change.detectedAt),
    }));
  } catch {
    return [];
  }
}

const SOURCE_TYPE_LABEL: Record<string, string> = {
  official_docs: "Official documentation",
  api: "Official API",
  pricing: "Pricing page",
  help_center: "Help centre",
  terms: "Terms",
  status_page: "Status page",
  github: "GitHub",
  official_announcement: "Official announcement",
  manual_verified: "Manually verified",
};

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The freshest supported capability with evidence — real providers first — shown as proof, not illustration. */
async function loadShowcaseEvidence(): Promise<LandingEvidence | null> {
  try {
    const db = await getDb();
    const [row] = await db
      .select({ capability: providerCapabilities, evidence: evidenceTable, provider: providers })
      .from(providerCapabilities)
      .innerJoin(evidenceTable, eq(providerCapabilities.evidenceId, evidenceTable.id))
      .innerJoin(providers, eq(providerCapabilities.providerId, providers.id))
      .where(and(eq(providerCapabilities.availability, "supported"), isNotNull(evidenceTable.lastVerifiedAt)))
      .orderBy(asc(providers.isDemo), desc(evidenceTable.lastVerifiedAt))
      .limit(1);
    if (!row) return null;
    const c = row.capability;
    const e = row.evidence;
    const verifiedAt = e.lastVerifiedAt ?? e.retrievedAt;
    const confidence = decayConfidence(Number(e.confidence), verifiedAt, e.sourceType as SourceType);
    const route = [c.sourceAsset, c.sourceNetwork && `on ${c.sourceNetwork}`, c.destinationCountry && `→ ${c.destinationCountry}`, c.destinationCurrency].filter(Boolean).join(" ");
    let host = e.sourceUrl;
    try {
      host = new URL(e.sourceUrl).host;
    } catch {
      /* keep raw */
    }
    return {
      provider: row.provider.name + (row.provider.isDemo ? " (demo dataset)" : ""),
      providerSlug: row.provider.slug,
      claim: `Supported · ${c.product.replaceAll("_", " ")}${route ? ` · ${route}` : ""}${c.entityCountry ? ` · for ${c.entityCountry}-incorporated entities` : ""}`,
      sourceType: SOURCE_TYPE_LABEL[e.sourceType] ?? e.sourceType,
      sourceTitle: e.sourceTitle,
      sourceHost: host,
      sourceUrl: e.sourceUrl,
      confidence,
      bandKey: confidenceBand(confidence, verifiedAt),
      band: CONFIDENCE_BAND_LABEL[confidenceBand(confidence, verifiedAt)],
      retrievedAt: fmtDate(e.retrievedAt),
      verifiedAt: fmtDate(verifiedAt),
    };
  } catch {
    return null;
  }
}

export default async function HomePage() {
  await ensureMigrated();
  const [reference, counts, signals, changes, evidence] = await Promise.all([
    getReferenceOptions(),
    loadPlatformCounts(),
    loadSignals(),
    loadChanges(),
    loadShowcaseEvidence(),
  ]);

  return (
    <>
      <MarketingNav />

      <MarketingLanding
        counts={counts}
        surveyProviderCount={remittanceProviderCatalog().length}
        optionsByField={optionsByField(reference)}
        fieldLabels={FIELD_LABELS}
        signals={signals}
        changes={changes}
        evidence={evidence}
      />

      <MarketingFooter
        counts={{
          providers: counts.providers,
          countries: counts.countries,
          sources: counts.sources,
          capabilities: counts.capabilities,
        }}
      />
    </>
  );
}
