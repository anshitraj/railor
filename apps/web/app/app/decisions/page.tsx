import Link from "next/link";
import { DecisionListQuery, listDecisions, listPolicies, loadProviderInputs } from "@railor/core";
import { requireSession } from "../../../lib/auth";
import { DecisionForm } from "../../../components/app/control-forms";
import { ProductBadge, ProductEmpty, ProductHeader } from "../../../components/app/product-ui";
import { getIntentOptions } from "../../../lib/reference";

export const metadata = { title: "Decisions" };

export const dynamic = "force-dynamic";
export default async function DecisionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSession(); if (!session.organization) return null;
  const params = await searchParams;
  const query = DecisionListQuery.safeParse({ search: params.q, before: params.before, beforeId: params.beforeId, status: params.status });
  const [rows, policies, providers, options] = await Promise.all([listDecisions(session.organization.id, query.success ? query.data : {}), listPolicies(session.organization.id), loadProviderInputs(), getIntentOptions()]);
  return <div className="product-page space-y-7">
    <ProductHeader eyebrow="Control desk / 01" title="Decision Studio" description="Test a proposed payment against active policy, route evidence and current provider conditions. Every result is recorded and can be revalidated." value={rows.length} valueLabel="decisions in view" />
    {session.role !== "viewer" && <DecisionForm policies={policies.filter((p) => p.status === "active")} providers={providers.filter((p) => !p.isDemo).map((p) => ({ slug: p.slug, name: p.name }))} entityCountry={session.organization.entityCountry ?? undefined} options={options} />}
    <section className="space-y-4" aria-labelledby="decision-history-heading">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><span className="product-eyebrow">Record / immutable trail</span><h2 id="decision-history-heading" className="font-display text-2xl font-semibold">Decision history</h2></div><Link className="product-quiet-link" href="/api/decisions/export">Export CSV ↗</Link></div>
      <form className="flex flex-wrap gap-2"><input aria-label="Search decision history" name="q" defaultValue={params.q} placeholder="Provider, currency, country or decision ID" className="product-field !mt-0 min-w-0 flex-1" /><button className="rounded-lg border border-[var(--color-line-strong)] bg-white px-5 text-sm font-semibold transition-colors hover:bg-[var(--color-paper)]" type="submit">Search</button></form>
      {rows.length ? <div className="product-panel">{rows.map((d) => <Link key={d.id} href={`/app/decisions/${d.id}`} className="product-row"><span className="product-row-primary"><ProductBadge status={d.status} /></span><span className="product-row-secondary">{d.proposedExecutor ?? d.recommendedProviderSlug ?? "No provider"}</span><span className="product-mono">{String(d.intentSnapshot.amount)} {String(d.intentSnapshot.sourceCurrency ?? d.intentSnapshot.sourceAsset ?? "")} <span className="text-[var(--color-orange-deep)]">→</span> {String(d.intentSnapshot.destinationCurrency ?? d.intentSnapshot.destinationCountry)}</span><time className="product-row-secondary product-mono">{d.evaluatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</time></Link>)}</div> : <ProductEmpty mark="↗" title="No decisions found" description="Evaluate a payment above to begin your audit history. Results stay available for review and revalidation." />}
      {rows.length === 30 && <Link className="product-quiet-link" href={`/app/decisions?${new URLSearchParams({ q: params.q ?? "", before: rows.at(-1)!.evaluatedAt.toISOString(), beforeId: rows.at(-1)!.id })}`}>Older decisions →</Link>}
    </section>
  </div>;
}
