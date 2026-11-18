import Link from "next/link";
import { listPolicies, loadProviderInputs } from "@railor/core";
import { requireSession } from "../../../lib/auth";
import { CompanyGate } from "../../../components/app/company-gate";
import { isCompanyWorkspace } from "../../../lib/workspace-profile";
import { PolicyEditor } from "../../../components/app/control-forms";
import { ProductBadge, ProductEmpty, ProductHeader } from "../../../components/app/product-ui";
import { getIntentOptions } from "../../../lib/reference";

export const metadata = { title: "Policies" };

export const dynamic = "force-dynamic";
export default async function PoliciesPage() {
  const session = await requireSession();
  if (!session.organization) return null;
  if (!isCompanyWorkspace(session.organization.building)) return <div className="product-page"><CompanyGate feature="Company rules" next="/app/policies" /></div>;
  const [policies, providerInputs, options] = await Promise.all([listPolicies(session.organization.id), loadProviderInputs(), getIntentOptions()]);
  const providers = providerInputs.filter((p) => !p.isDemo).map((p) => ({ slug: p.slug, name: p.name }));
  const canEdit = ["owner", "admin"].includes(session.role ?? "");
  return <div className="product-page space-y-7"><ProductHeader eyebrow="Company" title="Company rules" description="Set the limits and approved providers your payments must follow. Railor checks every route against them, and asks a teammate when an amount needs sign-off." value={policies.filter((p) => p.status === "active").length} valueLabel={policies.filter((p) => p.status === "active").length === 1 ? "rule set active" : "rule sets active"} />
    {policies.length ? <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-[18px] font-[650]">Your rule sets</h2><span className="text-[13px] text-[var(--color-muted)]">{policies.length} total</span></div><div className="product-panel">{policies.map((p) => <Link className="product-row" key={p.id} href={`/app/policies/${p.id}`}><span className="product-row-primary">{p.name}</span><ProductBadge status={p.status} /><span className="product-row-secondary">See rules and versions</span><span aria-hidden="true" className="text-[var(--color-muted)]">→</span></Link>)}</div></section> : null}
    <div id="create-policy" className="scroll-mt-24"><PolicyEditor canEdit={canEdit} providers={providers} options={options} entityCountry={session.organization.entityCountry ?? undefined} initialRules={{ requireExactRouteEvidence: true, requireConfirmedEntityEligibility: true, denyDuringActiveIncident: true, maximumEvidenceAgeHours: 168 }} /></div>
  </div>;
}
