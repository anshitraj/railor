import Link from "next/link";
import { notFound } from "next/navigation";
import { loadProviderBySlug } from "@railor/core";
import { CHANGE_KIND_LABEL, confidenceBand, CONFIDENCE_BAND_LABEL } from "@railor/types";
import {
  Card,
  EmptyState,
  EvidencePopover,
  Freshness,
  SectionLabel,
  StageBadge,
  VerdictPill,
} from "@railor/ui";
import { MonitorProviderButton } from "../../../../components/app/monitor-button";

export const dynamic = "force-dynamic";

const PRODUCT_LABELS: Record<string, string> = {
  off_ramp: "Off-ramp",
  on_ramp: "On-ramp",
  payout: "Payouts",
  collection: "Collections",
  virtual_account: "Virtual accounts",
  card_issuing: "Card issuing",
  card_funding: "Card funding",
  wallet: "Wallets",
  treasury: "Treasury",
  kyc_kyb: "KYC / KYB",
};

export default async function ProviderProfile({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadProviderBySlug(slug);
  if (!data) notFound();

  const {
    provider,
    products,
    facets,
    requirements,
    fees,
    limits,
    changes,
    sources,
    health,
    observed,
    conformance,
    incidents,
  } = data;

  const CONFORMANCE_STATUS_STYLE: Record<string, string> = {
    pass: "bg-[var(--color-ok-bg)] text-[var(--color-ok)]",
    fail: "bg-[var(--color-bad-bg)] text-[var(--color-bad)]",
    warning: "bg-[var(--color-warn-bg)] text-[var(--color-warn)]",
    not_tested: "bg-[var(--color-unknown-bg)] text-[var(--color-unknown)]",
    access_required: "bg-[var(--color-unknown-bg)] text-[var(--color-unknown)]",
  };
  const CONFORMANCE_STATUS_LABEL: Record<string, string> = {
    pass: "Pass",
    fail: "Fail",
    warning: "Warning",
    not_tested: "Not tested",
    access_required: "Access required",
  };

  const entity = facets.filter((f) => f.capability.entityCountry);
  const corridors = facets.filter((f) => f.capability.destinationCountry);
  const assets = [
    ...new Set(facets.map((f) => f.capability.sourceAsset).filter(Boolean)),
  ] as string[];
  const networks = [
    ...new Set(facets.map((f) => f.capability.sourceNetwork).filter(Boolean)),
  ] as string[];
  const okRatio = health.length ? health.filter((h) => h.ok).length / health.length : null;

  const entityByCountry = new Map<string, string>();
  for (const f of entity) {
    const country = f.capability.entityCountry!;
    const current = entityByCountry.get(country);
    // An explicit "unsupported" always beats a "supported" row.
    if (current === "unsupported") continue;
    entityByCountry.set(country, f.capability.availability);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-[var(--color-lavender)] text-[17px] font-semibold text-[var(--color-purple)]">
            {provider.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-[24px] font-semibold tracking-tight">{provider.name}</h1>
              {provider.isDemo ? <StageBadge stage="beta" /> : null}
            </div>
            <p className="max-w-2xl text-[14px] leading-relaxed text-[var(--color-muted)]">
              {provider.description}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Freshness date={provider.lastVerifiedAt} />
              {provider.headquartersCountry ? (
                <span className="text-[12px] text-[var(--color-muted)]">
                  HQ {provider.headquartersCountry}
                </span>
              ) : null}
              {okRatio !== null ? (
                <span className="text-[12px] text-[var(--color-muted)]">
                  Health checks {Math.round(okRatio * 100)}% ok
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MonitorProviderButton slug={provider.slug} name={provider.name} />
          <Link
            href={`/app/compare?providers=${provider.slug}`}
            className="rounded-full border border-[var(--color-line)] px-3.5 py-2 text-[13px] hover:border-[var(--color-line-strong)]"
          >
            Compare
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Products</SectionLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-[var(--color-line)] p-3"
                >
                  <span className="flex items-center gap-2 text-[14px] font-medium">
                    {PRODUCT_LABELS[p.product] ?? p.product}
                    <VerdictPill
                      compact
                      verdict={p.availability === "supported" ? "supported" : "unknown"}
                    />
                  </span>
                  <span className="text-[12.5px] text-[var(--color-muted)]">{p.description}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Entity eligibility — whose businesses can onboard</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {[...entityByCountry.entries()].map(([country, availability]) => (
                <span
                  key={country}
                  className={`rounded-full px-2.5 py-1 text-[12px] ${
                    availability === "supported"
                      ? "bg-[var(--color-ok-bg)] text-[var(--color-ok)]"
                      : availability === "partial"
                        ? "bg-[var(--color-warn-bg)] text-[var(--color-warn)]"
                        : "bg-[var(--color-bad-bg)] text-[var(--color-bad)]"
                  }`}
                >
                  {country}
                </span>
              ))}
              {!entityByCountry.size ? (
                <span className="text-[13px] text-[var(--color-muted)]">
                  Railor has no verified entity-eligibility statement for this provider.
                </span>
              ) : null}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Corridors</SectionLabel>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                  <tr>
                    <th className="pb-2">Destination</th>
                    <th className="pb-2">Currency</th>
                    <th className="pb-2">Rail</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {corridors.map((f) => (
                    <tr key={f.capability.id} className="border-t border-[var(--color-line)]">
                      <td className="py-2">{f.capability.destinationCountry}</td>
                      <td className="py-2">{f.capability.destinationCurrency}</td>
                      <td className="py-2 text-[var(--color-muted)]">
                        {f.capability.paymentMethod?.replace(/_/g, " ")}
                      </td>
                      <td className="py-2">
                        <VerdictPill
                          compact
                          verdict={
                            f.capability.availability === "supported"
                              ? "supported"
                              : f.capability.availability === "partial"
                                ? "additional_requirements"
                                : f.capability.availability === "unsupported"
                                  ? "unavailable"
                                  : "unknown"
                          }
                        />
                        {f.capability.note ? (
                          <p className="mt-1 max-w-md text-[12px] leading-snug text-[var(--color-muted)]">
                            {f.capability.note}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-2">
                        {f.evidence ? (
                          <EvidencePopover
                            label="Source"
                            evidence={[
                              {
                                sourceUrl: f.evidence.sourceUrl,
                                sourceTitle: f.evidence.sourceTitle,
                                sourceType: f.evidence.sourceType,
                                retrievedAt: f.evidence.retrievedAt,
                                lastVerifiedAt: f.evidence.lastVerifiedAt,
                                confidence: Number(f.evidence.confidence),
                                rawExcerpt: f.evidence.rawExcerpt ?? undefined,
                              },
                            ]}
                          />
                        ) : (
                          <span className="text-[12px] text-[var(--color-muted)]">Unknown</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!corridors.length ? (
                <p className="py-3 text-[13px] text-[var(--color-muted)]">
                  This provider publishes no payout corridors in the mapped dataset.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Requirements</SectionLabel>
            <ul className="grid gap-2 sm:grid-cols-2">
              {requirements.map((r) => (
                <li
                  key={`${r.key}-${r.entityCountry ?? "any"}`}
                  className="flex flex-col rounded-xl border border-[var(--color-line)] p-3"
                >
                  <span className="text-[13.5px] font-medium">{r.label}</span>
                  <span className="text-[12px] text-[var(--color-muted)]">
                    {r.mandatory ? "Mandatory" : "Optional"}
                    {r.entityCountry ? ` · ${r.entityCountry} entities` : ""}
                    {` · ${r.kind.toUpperCase()}`}
                  </span>
                  {r.note ? (
                    <span className="mt-1 text-[12px] text-[var(--color-ink-soft)]">{r.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Assets & networks</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {assets.map((a) => (
                <span key={a} className="rounded-full bg-[var(--color-lavender)] px-2.5 py-1 text-[12px]">
                  {a}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {networks.map((n) => (
                <span
                  key={n}
                  className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[12px] text-[var(--color-ink-soft)]"
                >
                  {n}
                </span>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Pricing & limits</SectionLabel>
            {fees.length ? (
              <ul className="flex flex-col gap-2">
                {fees.map((f) => (
                  <li key={f.id} className="text-[13px]">
                    <span className="font-medium">{PRODUCT_LABELS[f.product] ?? f.product}</span>
                    <span className="block text-[var(--color-muted)]">{f.summary}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-[var(--color-muted)]">
                No verified pricing. Railor does not estimate fees.
              </p>
            )}
            <div className="border-t border-[var(--color-line)] pt-3">
              {limits.length ? (
                <ul className="flex flex-col gap-2">
                  {limits.map((l) => (
                    <li key={l.id} className="text-[13px]">
                      <span className="font-medium">{PRODUCT_LABELS[l.product] ?? l.product}</span>
                      <span className="block text-[var(--color-muted)]">{l.summary}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-[var(--color-muted)]">No verified limits.</p>
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Developer support</SectionLabel>
            <ul className="flex flex-col gap-1.5 text-[13px]">
              <li>REST API: {provider.hasApi ? "documented" : "not published"}</li>
              <li>Sandbox: {provider.hasSandbox ? "available" : "not published"}</li>
              <li>Webhooks: {provider.hasWebhooks ? "available" : "not published"}</li>
              <li>SDKs: {provider.sdkLanguages?.length ? provider.sdkLanguages.join(", ") : "none published"}</li>
            </ul>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Sources monitored</SectionLabel>
            <ul className="flex flex-col gap-2">
              {sources.map((s) => (
                <li key={s.id} className="flex flex-col">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[13px] hover:text-[var(--color-purple)]"
                  >
                    {s.title} ↗
                  </a>
                  <span className="text-[11px] text-[var(--color-faint)]">
                    {s.sourceType.replace(/_/g, " ")} · every {s.crawlFrequencyHours}h ·{" "}
                    {CONFIDENCE_BAND_LABEL[confidenceBand(0.95, s.lastCheckedAt ?? undefined)]}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Change history</SectionLabel>
            {changes.length ? (
              <ul className="flex flex-col gap-3">
                {changes.map((c) => (
                  <li key={c.id} className="flex flex-col gap-0.5">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-purple)]">
                      {CHANGE_KIND_LABEL[c.kind]}
                    </span>
                    <span className="text-[13px] leading-snug">{c.summary}</span>
                    <span className="text-[11px] text-[var(--color-faint)]">
                      {c.previousValue && c.currentValue
                        ? `${c.previousValue} → ${c.currentValue} · `
                        : ""}
                      {c.detectedAt.toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {c.reviewStatus === "pending" ? " · pending review" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-[var(--color-muted)]">
                Nothing has changed since Railor started tracking this provider.
              </p>
            )}
          </Card>

          <Card className={`flex flex-col gap-2 p-5 ${observed ? "" : "border-dashed"}`}>
            <SectionLabel>Observed performance</SectionLabel>
            {observed ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                    Success rate
                  </p>
                  <p className="tabular text-[18px] font-semibold">
                    {Math.round(observed.successRate * 100)}%
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                    Sample size
                  </p>
                  <p className="tabular text-[18px] font-semibold">{observed.sampleSize}</p>
                </div>
                {observed.p50SettlementMs !== null ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                      P50 settlement
                    </p>
                    <p className="tabular text-[18px] font-semibold">
                      {(observed.p50SettlementMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                ) : null}
                {observed.p95SettlementMs !== null ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                      P95 settlement
                    </p>
                    <p className="tabular text-[18px] font-semibold">
                      {(observed.p95SettlementMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                ) : null}
                <p className="col-span-2 text-[11px] text-[var(--color-faint)]">
                  {provider.isDemo ? "Demo sample · " : ""}
                  {observed.lastObservedAt ? (
                    <Freshness date={observed.lastObservedAt} prefix="Last observed" />
                  ) : null}
                </p>
              </div>
            ) : (
              <EmptyState
                className="border-0 p-0"
                what="No observed data yet"
                why="Railor publishes observed settlement and success rates only from measurements it has actually taken. Until this deployment has them, the advertised figure is shown on its own — never dressed up as measured."
                actionLabel="See advertised settlement"
                href={`/app/providers/${provider.slug}#advertised`}
              />
            )}
            <p id="advertised" className="text-[13px] text-[var(--color-ink-soft)]">
              Advertised: {provider.advertisedSettlement ?? "not published"}
            </p>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Conformance</SectionLabel>
            {conformance.length ? (
              <ul className="flex flex-col gap-1.5">
                {conformance.map((c) => (
                  <li key={c.kind} className="flex items-center gap-2 text-[13px]">
                    <span className="flex-1">{c.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        CONFORMANCE_STATUS_STYLE[c.status] ?? CONFORMANCE_STATUS_STYLE.not_tested
                      }`}
                    >
                      {CONFORMANCE_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-[var(--color-muted)]">
                No conformance tests cataloged for this provider yet.
              </p>
            )}
            <div className="border-t border-[var(--color-line)] pt-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                Incidents, last 30 days
              </p>
              {incidents.length ? (
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {incidents.map((i) => (
                    <li key={i.id} className="text-[13px]">
                      <span className="font-medium">{i.title}</span>
                      <span className="ml-2 text-[11px] text-[var(--color-muted)]">
                        {i.severity} · {i.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[13px] text-[var(--color-muted)]">None recorded.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
