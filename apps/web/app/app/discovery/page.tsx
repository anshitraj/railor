import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@railor/ui";
import { listDiscoveryReviews } from "@railor/core";
import { MarketDiscoveryCandidate } from "@railor/types";
import { requireSession } from "../../../lib/auth";
import { DiscoveryReviewForm } from "../../../components/app/workflow-forms";
import { ProductBadge, ProductEmpty, ProductHeader } from "../../../components/app/product-ui";
export const dynamic = "force-dynamic";
export const metadata = { title: "Discovery review" };
export default async function DiscoveryPage() {
  const session = await requireSession(); if (!session.organization) redirect("/welcome");
  const rows = await listDiscoveryReviews(session.organization.id);
  const canReview = ["owner", "admin"].includes(session.role ?? "");
  return <div className="product-page space-y-7"><ProductHeader eyebrow="Market intelligence / 05" title="Discovery review" description="Fresh web leads from corridor research. A lead is not an eligible route or executable price until its sources and terms are verified." value={rows.filter((r) => r.status === "pending").length} valueLabel="leads to review" action={<Link href="/app/corridors" className="product-quiet-link">Research a corridor ↗</Link>} />
    {!rows.length && <ProductEmpty mark="⌕" title="No web leads saved" description="Run a corridor search with fresh discovery. New providers and pricing claims will land here for human review." />}
    {rows.map((row) => { const candidate = MarketDiscoveryCandidate.safeParse(row.candidate); if (!candidate.success) return null; const lead = candidate.data;
      return <Card key={row.id} className="product-panel"><div className="product-panel-head"><div><span className="product-index">WEB LEAD / {row.discoveredAt.toISOString().slice(0, 10)}</span><h2 className="mt-1">{lead.name}</h2></div><ProductBadge status={row.status} /></div><div className="space-y-5 p-5 sm:p-7"><p className="max-w-3xl font-display text-lg leading-snug">{lead.routeSummary}</p>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">Research lead only. Check direction, availability, pricing conditions and publication dates in the source excerpts before relying on it.</div>
        <div className="space-y-3"><h3 className="product-index">SOURCE EXCERPTS</h3>{lead.sources.map((s) => <blockquote key={s.url} className="border-l-2 border-[var(--color-orange)] bg-[var(--color-paper)] p-4"><p className="text-sm leading-relaxed">{s.excerpt}</p>{/^https?:\/\//i.test(s.url) && <a href={s.url} target="_blank" rel="noreferrer noopener" className="product-quiet-link mt-2 inline-block">{s.title} ↗</a>}</blockquote>)}</div>
        <details className="text-sm"><summary className="cursor-pointer font-semibold">Requested corridor</summary><pre className="mt-3 overflow-auto rounded-lg bg-[var(--color-paper)] p-4 text-xs">{JSON.stringify(row.query, null, 2)}</pre></details>
        {row.status === "pending" && canReview ? <DiscoveryReviewForm id={row.id} /> : <p className="text-sm text-[var(--color-muted)]">{row.comment || "Awaiting an administrator’s review."}</p>}</div></Card>;
    })}</div>;
}
