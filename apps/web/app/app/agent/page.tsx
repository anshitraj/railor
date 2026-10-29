import { redirect } from "next/navigation";
import { listPolicies, loadProviderInputs } from "@railor/core";
import { requireSession } from "../../../lib/auth";
import { recentDecisionChoices } from "../../../lib/decisions";
import { getIntentOptions } from "../../../lib/reference";
import { AgentWorkbench } from "../../../components/app/workflow-forms";
import { agentHistoryKey } from "../../../lib/agent-history";
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
    <div>
      <AgentConversation
        key={agentHistoryKey(org.id, session.user.id)}
        historyScope={agentHistoryKey(org.id, session.user.id)}
        policies={policies.filter((p) => p.activeVersionId && p.status === "active").map((p) => ({ id: p.id, name: p.name }))}
        options={options}
        entityCountry={org.entityCountry ?? undefined}
        defaultEmail={session.user.email}
        canDecide={session.role !== "viewer"}
        advancedTools={session.role !== "viewer" ? <AgentWorkbench
          policies={policies.filter((p) => p.activeVersionId).map((p) => ({ id: p.id, name: p.name }))}
          decisions={decisions}
          providers={providers}
          options={options}
          entityCountry={org.entityCountry ?? undefined}
          canEditPolicies={["owner", "admin"].includes(session.role ?? "")}
        />
        : null}
      />
    </div>
  );
}
