import Link from "next/link";
import { listApprovals } from "@railor/core";
import { requireSession } from "../../../lib/auth";
import { CompanyGate } from "../../../components/app/company-gate";
import { isCompanyWorkspace } from "../../../lib/workspace-profile";
import { ProductBadge, ProductEmpty, ProductHeader } from "../../../components/app/product-ui";
export const dynamic = "force-dynamic";
export const metadata = { title: "Approvals" };
export default async function ApprovalsPage() {
  const session = await requireSession(); if (!session.organization) return null;
  if (!isCompanyWorkspace(session.organization.building)) return <div className="product-page"><CompanyGate feature="Team reviews" next="/app/approvals" /></div>;
  const rows = await listApprovals(session.organization.id);
  return <div className="product-page space-y-7"><ProductHeader eyebrow="Company" title="Team reviews" description="Payments above your review amount wait here for a second person to approve. Approvals expire and can be withdrawn." value={rows.filter((r) => r.status === "pending").length} valueLabel="awaiting review" />
    <section className="space-y-3"><h2 className="font-display text-xl font-semibold">Review queue</h2>{rows.length ? <div className="product-panel">{rows.map((approval, i) => <Link key={approval.id} className="product-row" href={`/app/decisions/${approval.decisionId}`}><span className="product-row-primary"><span className="product-index mr-3">{String(i + 1).padStart(2, "0")}</span>Decision {approval.decisionId.slice(0, 8)}</span><ProductBadge status={approval.status} /><time className="product-row-secondary product-mono">Expires {approval.expiresAt.toISOString().slice(0, 16).replace("T", " ")} UTC</time><span aria-hidden="true" className="text-[var(--color-orange-deep)]">↗</span></Link>)}</div> : <ProductEmpty mark="✓" title="Review queue is clear" description="Decisions that need a second person’s approval will appear here, with their expiry and evidence trail." />}</section>
  </div>;
}
