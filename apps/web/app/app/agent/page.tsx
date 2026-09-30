import { redirect } from "next/navigation";
import { listPolicies, loadProviderInputs } from "@railor/core";
import { requireSession } from "../../../lib/auth";
import { recentDecisionChoices } from "../../../lib/decisions";
import { getIntentOptions } from "../../../lib/reference";
import { AgentWorkbench } from "../../../components/app/workflow-forms";
import { ProductHeader } from "../../../components/app/product-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agent" };

export default async function AgentPage() {
  const session = await requireSession();
  if (!session.organization) redirect("/welcome");
  const org = session.organization;
  const [policies, decisions, providerInputs, options] = await Promise.all([
    listPolicies(org.id),
    recentDecisionChoices(org.id),
    loadProviderInputs(),
    getIntentOptions(),
  ]);
  const providers = providerInputs.filter((p) => !p.isDemo).map((p) => ({ slug: p.slug, name: p.name }));
  return (
    <div className="product-page space-y-7">
      <ProductHeader
        eyebrow="Assisted workflow / 04"
        title="Railor Agent"
        description="Turn plain-language instructions into a reviewable payment or policy draft. It identifies missing facts; you stay in control of evaluation and activation."
        value="03"
        valueLabel="drafting tools"
      />
      {session.role === "viewer" ? (
        <p>A member or administrator can generate and save drafts.</p>
      ) : (
        <AgentWorkbench
          policies={policies.filter((p) => p.activeVersionId).map((p) => ({ id: p.id, name: p.name }))}
          decisions={decisions}
          providers={providers}
          options={options}
          entityCountry={org.entityCountry ?? undefined}
          canEditPolicies={["owner", "admin"].includes(session.role ?? "")}
        />
      )}
    </div>
  );
}
