"use client";
import Link from "next/link";
import { ArrowRight, Check, ListChecks, SlidersHorizontal } from "lucide-react";
import { workspacePolicySetup, type SavedSetupPolicy } from "../../lib/workspace-policy-setup";

export function WorkspaceSetup({ profileComplete, policyActive, savedPolicy = null, canEditPolicy }: {
  organizationId: string; profileComplete: boolean; policyActive: boolean; savedPolicy?: SavedSetupPolicy | null; hasDecision: boolean; canEditPolicy: boolean; canDecide: boolean;
}) {
  const rules = workspacePolicySetup(policyActive, savedPolicy, canEditPolicy);
  return <section className="workspace-setup" aria-label="Workspace setup">
    {!profileComplete && <div className="setup-current"><span className="setup-icon"><SlidersHorizontal size={22} /></span><div><h2>Make comparisons relevant to you</h2><p>Add your country and the markets you work with. You can compare providers now.</p></div><Link className="setup-cta" href="/welcome">Personalize workspace<ArrowRight size={15} /></Link></div>}
    <details className="setup-details"><summary><ListChecks size={15} />Optional team controls{policyActive && <span className="ml-auto inline-flex items-center gap-1 text-xs"><Check size={12} />Company rules active</span>}</summary><div className="space-y-3 py-4 text-xs text-[var(--color-muted)]"><p>Company rules set your limits. A rule check records whether a route meets them. Team reviews let another person sign off when needed.</p><div className="flex flex-wrap gap-4"><Link href={rules.href}>{savedPolicy ? rules.action : "Set company rules"} →</Link><Link href="/app/decisions">View rule checks →</Link><Link href="/app/approvals">Team reviews →</Link></div></div></details>
  </section>;
}
