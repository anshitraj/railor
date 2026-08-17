import Link from "next/link";
import { notFound } from "next/navigation";
import { loadProviderBySlug } from "@railor/core";
import { CHANGE_KIND_LABEL } from "@railor/types";
import { Card, EvidencePopover, Freshness, SectionLabel, VerdictPill } from "@railor/ui";

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

/** Public provider profile: the facts and their sources, no workspace actions. */
export default async function PublicProviderProfile({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadProviderBySlug(slug);
  if (!data) notFound();
  const { provider, products, facets, requirements, fees, limits, changes } = data;

  const entity = new Map<string, string>();
  for (const f of facets) {
    if (!f.capability.entityCountry) continue;
    const current = entity.get(f.capability.entityCountry);
    if (current === "unsupported") continue;
    entity.set(f.capability.entityCountry, f.capability.availability);
  }
  const corridors = facets.filter((f) => f.capability.destinationCountry);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/providers" className="text-[13px] text-[var(--color-muted)]">
            ← All providers
          </Link>
          <h1 className="text-[30px] font-semibold tracking-tight">{provider.name}</h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--color-muted)]">
            {provider.description}
          </p>
          <Freshness date={provider.lastVerifiedAt} />
        </div>
        <Link
          href={`/login?intent=start&q=${encodeURIComponent(provider.name)}`}
          className="rounded-full bg-[var(--color-purple)] px-4 py-2.5 text-[14px] font-medium text-white"
        >
          Monitor this provider
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Products</SectionLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              {products.map((p) => (
                <div key={p.id} className="rounded-xl border border-[var(--color-line)] p-3">
                  <p className="text-[14px] font-medium">
                    {PRODUCT_LABELS[p.product] ?? p.product}
                  </p>
                  <p className="text-[12.5px] text-[var(--color-muted)]">{p.description}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Corridors</SectionLabel>
            <ul className="flex flex-col gap-2">
              {corridors.slice(0, 12).map((f) => (
                <li
                  key={f.capability.id}
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] pb-2 text-[13px] last:border-0"
                >
                  <span className="font-medium">
                    {f.capability.destinationCountry} · {f.capability.destinationCurrency}
                  </span>
                  <span className="text-[var(--color-muted)]">
                    {f.capability.paymentMethod?.replace(/_/g, " ")}
                  </span>
                  <span className="flex-1" />
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
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <SectionLabel>Entity eligibility</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {[...entity.entries()].map(([country, availability]) => (
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
            </div>
          </Card>

          <Card className="flex flex-col gap-2 p-5">
            <SectionLabel>Onboarding requirements</SectionLabel>
            <ul className="flex flex-col gap-1 text-[13px] text-[var(--color-ink-soft)]">
              {requirements.map((r) => (
                <li key={`${r.key}-${r.entityCountry ?? "any"}`}>
                  • {r.label}
                  {r.entityCountry ? ` (${r.entityCountry} entities)` : ""}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-col gap-2 p-5">
            <SectionLabel>Pricing & limits</SectionLabel>
            {fees.length || limits.length ? (
              <ul className="flex flex-col gap-1 text-[13px] text-[var(--color-ink-soft)]">
                {fees.map((f) => (
                  <li key={f.id}>• {f.summary}</li>
                ))}
                {limits.map((l) => (
                  <li key={l.id}>• {l.summary}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-[var(--color-muted)]">
                Nothing verified. Railor does not estimate pricing.
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-2 p-5">
            <SectionLabel>Change history</SectionLabel>
            <ul className="flex flex-col gap-2">
              {changes.slice(0, 6).map((c) => (
                <li key={c.id} className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--color-purple)]">
                    {CHANGE_KIND_LABEL[c.kind]}
                  </span>
                  <span className="text-[13px] leading-snug">{c.summary}</span>
                  <Freshness date={c.detectedAt} prefix="Detected" />
                </li>
              ))}
              {!changes.length ? (
                <li className="text-[13px] text-[var(--color-muted)]">
                  Nothing has changed since Railor started tracking this provider.
                </li>
              ) : null}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
