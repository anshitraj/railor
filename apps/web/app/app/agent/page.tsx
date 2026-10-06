import { redirect } from "next/navigation";
import { listPolicies, loadProviderInputs } from "@railor/core";
import { requireSession } from "../../../lib/auth";
import { recentDecisionChoices } from "../../../lib/decisions";
import { getIntentOptions } from "../../../lib/reference";
import { AgentWorkbench } from "../../../components/app/workflow-forms";
import { AgentConversation } from "../../../components/app/agent-conversation";

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
      <AgentConversation
        policies={policies.filter((p) => p.activeVersionId && p.status === "active").map((p) => ({ id: p.id, name: p.name }))}
        options={options}
        entityCountry={org.entityCountry ?? undefined}
        defaultEmail={session.user.email}
        canDecide={session.role !== "viewer"}
      />
      {session.role !== "viewer" ? <details className="agent-advanced">
        <summary>Advanced tools · policy drafts and stored decisions</summary>
        <div className="p-5 sm:p-7">
        <AgentWorkbench
          policies={policies.filter((p) => p.activeVersionId).map((p) => ({ id: p.id, name: p.name }))}
          decisions={decisions}
          providers={providers}
          options={options}
          entityCountry={org.entityCountry ?? undefined}
          canEditPolicies={["owner", "admin"].includes(session.role ?? "")}
        />
        </div>
      </details> : null}
    </div>
  );
}
