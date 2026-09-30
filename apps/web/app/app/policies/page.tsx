import Link from "next/link";
import { listPolicies, loadProviderInputs } from "@railor/core";
import { requireSession } from "../../../lib/auth";
import { PolicyEditor } from "../../../components/app/control-forms";
import { ProductBadge, ProductEmpty, ProductHeader } from "../../../components/app/product-ui";
import { getIntentOptions } from "../../../lib/reference";

export const metadata = { title: "Policies" };

export const dynamic = "force-dynamic";
export default async function PoliciesPage() {
  const session = await requireSession();
  if (!session.organization) return null;
  const [policies, providerInputs, options] = await Promise.all([listPolicies(session.organization.id), loadProviderInputs(), getIntentOptions()]);
  const providers = providerInputs.filter((p) => !p.isDemo).map((p) => ({ slug: p.slug, name: p.name }));
  const canEdit = ["owner", "admin"].includes(session.role ?? "");
  return <div className="product-page space-y-7"><ProductHeader eyebrow="Control desk / 02" title="Policies" description="Define the conditions every payment must satisfy. Drafts are private until you activate a version; previous versions remain in the audit trail." value={policies.filter((p) => p.status === "active").length} valueLabel="active policies" />
    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-display text-xl font-semibold">Your policy library</h2><span className="product-mono text-[var(--color-muted)]">{policies.length} total</span></div>{policies.length ? <div className="product-panel">{policies.map((p, i) => <Link className="product-row" key={p.id} href={`/app/policies/${p.id}`}><span className="product-row-primary"><span className="product-index mr-3">{String(i + 1).padStart(2, "0")}</span>{p.name}</span><ProductBadge status={p.status} /><span className="product-row-secondary">View versions and rules</span><span aria-hidden="true" className="text-[var(--color-orange-deep)]">↗</span></Link>)}</div> : <ProductEmpty mark="≡" title="No policies yet" description="Create a draft below, review its rules, and activate a version before evaluating payments." />}</section>
    <PolicyEditor canEdit={canEdit} providers={providers} options={options} entityCountry={session.organization.entityCountry ?? undefined} initialRules={{ requireExactRouteEvidence: true, requireConfirmedEntityEligibility: true, denyDuringActiveIncident: true, maximumEvidenceAgeHours: 168 }} />
  </div>;
}
