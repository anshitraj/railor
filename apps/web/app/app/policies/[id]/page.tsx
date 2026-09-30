import { notFound } from "next/navigation";
import Link from "next/link";
import { getPolicy, listPolicyVersions, loadProviderInputs } from "@railor/core";
import { requireSession } from "../../../../lib/auth";
import { PolicyEditor, ControlButton } from "../../../../components/app/control-forms";
import { ProductBadge, ProductHeader, RuleSummary } from "../../../../components/app/product-ui";
import { getIntentOptions } from "../../../../lib/reference";

export const dynamic = "force-dynamic";
export const metadata = { title: "Policy" };
export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const session = await requireSession();
  if (!session.organization) return null;
  const policy = await getPolicy(session.organization.id, id); if (!policy) notFound();
  const [versions, providerInputs, options] = await Promise.all([listPolicyVersions(session.organization.id, id), loadProviderInputs(), getIntentOptions()]);
  const providers = providerInputs.filter((p) => !p.isDemo).map((p) => ({ slug: p.slug, name: p.name }));
  const active = versions.find((v) => v.id === policy.activeVersionId);
  const canEdit = ["owner", "admin"].includes(session.role ?? "");
  return <div className="product-page space-y-7"><Link href="/app/policies" className="product-quiet-link">← Policy library</Link><ProductHeader eyebrow="Policy record / versioned" title={policy.name} description="Changes are saved as new drafts. Activate a reviewed version to make its rules effective for future decisions." value={versions.length} valueLabel="saved versions" />
    <section className="space-y-3"><span className="product-eyebrow">Record / history</span><h2 className="font-display text-2xl font-semibold">Version history</h2>
    {versions.map((version) => <article key={version.id} className="product-panel"><div className="product-panel-head"><div><span className="product-index">POLICY VERSION / {String(version.versionNumber).padStart(2, "0")}</span><h3 className="mt-1">Version {version.versionNumber} · {version.status}</h3><time className="product-mono mt-2 block text-[var(--color-muted)]">Created {version.createdAt.toISOString()}</time></div><ProductBadge status={version.status} /></div><div className="space-y-4 p-5 sm:p-6"><RuleSummary rules={version.rules as Record<string, unknown>} /><details><summary className="cursor-pointer text-xs text-[var(--color-muted)]">View raw rules</summary><pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-[var(--color-paper)] p-4 text-xs">{JSON.stringify(version.rules, null, 2)}</pre></details>
      {canEdit && version.status === "draft" && <ControlButton command={{ action: "activate_policy", policyId: id, versionId: version.id }}>Activate this version</ControlButton>}
      {canEdit && version.status === "superseded" && <ControlButton command={{ action: "version_policy", policyId: id, rules: version.rules }}>Restore as new draft</ControlButton>}
    </div></article>)}</section>
    <PolicyEditor policyId={id} canEdit={canEdit} providers={providers} options={options} entityCountry={session.organization.entityCountry ?? undefined} initialRules={active?.rules ?? versions[0]?.rules ?? {}} />
  </div>;
}
