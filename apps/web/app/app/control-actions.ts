"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PaymentIntent, PolicyRules } from "@railor/types";
import { createPolicy, createPolicyVersion, activatePolicyVersion, getActivePolicyVersion, runDecisionEngine,
  persistDecision, requireProductRole, reviewApproval, revalidateDecision, simulatePolicy, loadDecision,
  reviewDiscovery, registerConnector, revokeConnector, queueConnectorSimulation, draftPaymentIntent, draftPolicy, explainDecision, loadProviderInputs, monitorDecisions, searchPreview, getDefaultActivePolicy } from "@railor/core";
import { requireSession } from "../../lib/auth";
import { buildFetchQuote } from "../../lib/decisions";
import { platformQuoteProviders } from "../../lib/platform-pricing";

const Command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_policy"), name: z.string().trim().min(1).max(120), rules: PolicyRules }),
  z.object({ action: z.literal("version_policy"), policyId: z.string().uuid(), rules: PolicyRules }),
  z.object({ action: z.literal("activate_policy"), policyId: z.string().uuid(), versionId: z.string().uuid() }),
  z.object({ action: z.literal("simulate"), intent: PaymentIntent, rules: PolicyRules, baseline: PolicyRules }),
  z.object({ action: z.literal("decision"), intent: PaymentIntent, policyId: z.string().uuid(), mode: z.enum(["enforce", "optimize"]), provider: z.string().max(100).optional() }),
  z.object({ action: z.literal("search_preview"), intent: PaymentIntent, policyId: z.string().uuid() }),
  z.object({ action: z.literal("approval"), id: z.string().uuid(), review: z.enum(["approve", "reject", "revoke"]), comment: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("revalidate"), id: z.string().uuid() }),
  z.object({ action: z.literal("review_discovery"), id: z.string().uuid(), status: z.enum(["investigate", "dismissed"]), comment: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("register_connector"), name: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal("revoke_connector"), id: z.string().uuid() }),
  z.object({ action: z.literal("simulate_connector"), installationId: z.string().uuid(), decisionId: z.string().uuid(), idempotencyKey: z.string().min(8).max(128), operation: z.enum(["simulate_transfer", "get_quote"]).default("simulate_transfer") }),
  z.object({ action: z.literal("agent_draft"), kind: z.enum(["payment", "policy", "explain"]), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("agent_search"), text: z.string().trim().min(1).max(2000), policyId: z.string().uuid().optional() }),
  z.object({ action: z.literal("monitor_decisions") }),
]);

export async function controlCommand(raw: unknown): Promise<{ ok: boolean; error?: string; data?: unknown; href?: string }> {
  try {
    const input = Command.parse(raw);
    const session = await requireSession();
    const org = session.organization?.id;
    if (!org) throw new Error("organization_required");
    if (!["agent_search", "agent_draft", "search_preview"].includes(input.action)) {
      await requireProductRole(org, session.user.id, ["create_policy", "version_policy", "activate_policy", "approval", "review_discovery", "register_connector", "revoke_connector", "monitor_decisions"].includes(input.action));
    }
    let data: unknown;
    let href: string | undefined;
    switch (input.action) {
      case "agent_search": {
        const draft = draftPaymentIntent(input.text, session.organization?.entityCountry ?? undefined);
        const policy = input.policyId ? await getActivePolicyVersion(org, input.policyId) : await getDefaultActivePolicy(org);
        const state = !draft.valid ? "needs_input" : draft.needsReview ? "needs_confirmation" : !policy ? "needs_policy" : "ready";
        const preview = state === "ready" && policy ? await searchPreview(PaymentIntent.parse(draft.draft), {
          policyId: policy.policy.id, policyVersionId: policy.version.id,
          policyVersionNumber: policy.version.versionNumber, rules: PolicyRules.parse(policy.version.rules),
        }, { organizationId: org, fetchQuote: buildFetchQuote(org, false, true), referenceQuoteProviders: platformQuoteProviders() }) : null;
        data = { kind: "agent_search", state, draft, preview };
        break;
      }
      case "review_discovery": data = await reviewDiscovery(org, session.user.id, { id: input.id, status: input.status, comment: input.comment }); break;
      case "register_connector": data = await registerConnector(org, session.user.id, input.name); break;
      case "revoke_connector": await revokeConnector(org, session.user.id, input.id); break;
      case "simulate_connector": data = await queueConnectorSimulation(org, session.user.id, { installationId: input.installationId, decisionId: input.decisionId, idempotencyKey: input.idempotencyKey, operation: input.operation }); break;
      case "monitor_decisions": data = await monitorDecisions({ organizationId: org, limit: 25 }); break;
      case "agent_draft": {
        data = input.kind === "explain" ? await explainDecision(org, input.text)
          : input.kind === "payment" ? draftPaymentIntent(input.text, session.organization?.entityCountry ?? undefined)
          : draftPolicy(input.text, (await loadProviderInputs()).filter((p) => !p.isDemo).map((p) => p.slug));
        break;
      }
      case "create_policy": {
        const result = await createPolicy(org, input.name, input.rules);
        href = `/app/policies/${result.policy.id}`;
        break;
      }
      case "version_policy": {
        data = await createPolicyVersion(org, input.policyId, input.rules);
        if (!data) throw new Error("policy_not_found");
        break;
      }
      case "activate_policy": {
        const result = await activatePolicyVersion(org, input.policyId, input.versionId);
        if (!result.ok) throw new Error(result.error);
        data = result;
        break;
      }
      case "simulate": data = await simulatePolicy(input.intent, input.baseline, input.rules, { organizationId: org }); break;
      case "search_preview": {
        const policy = await getActivePolicyVersion(org, input.policyId);
        if (!policy) throw new Error("active_policy_required");
        data = await searchPreview(input.intent, { policyId: policy.policy.id,
          policyVersionId: policy.version.id, policyVersionNumber: policy.version.versionNumber, rules: PolicyRules.parse(policy.version.rules),
        }, { organizationId: org, fetchQuote: buildFetchQuote(org, false, true), referenceQuoteProviders: platformQuoteProviders() });
        break;
      }
      case "decision": {
        const policy = await getActivePolicyVersion(org, input.policyId);
        if (!policy) throw new Error("active_policy_required");
        const decision = await runDecisionEngine(input.intent, { policyId: policy.policy.id,
          policyVersionId: policy.version.id, policyVersionNumber: policy.version.versionNumber, rules: PolicyRules.parse(policy.version.rules),
        }, { organizationId: org, mode: input.mode, proposedExecutor: input.mode === "enforce" ? { provider: input.provider?.trim().toLowerCase() ?? "" } : undefined, createdBy: session.user.id, fetchQuote: buildFetchQuote(org, true) });
        const created = await persistDecision(decision);
        href = `/app/decisions/${created.id}`;
        break;
      }
      case "approval": data = await reviewApproval(org, session.user.id, { id: input.id, action: input.review, comment: input.comment }); break;
      case "revalidate": {
        const previous = await loadDecision(org, input.id);
        if (!previous) throw new Error("decision_not_found");
        const active = await getActivePolicyVersion(org, previous.decision.policyId);
        if (!active) throw new Error("active_policy_required");
        const result = await revalidateDecision(input.id, { organizationId: org, trigger: "manual", fetchQuote: buildFetchQuote(org, true),
          policyOverride: { policyId: active.policy.id, policyVersionId: active.version.id,
            policyVersionNumber: active.version.versionNumber, rules: PolicyRules.parse(active.version.rules) } });
        if (!result.ok) throw new Error(result.error);
        href = `/app/decisions/${result.decisionId}`;
        break;
      }
    }
    if (!["agent_search", "agent_draft", "search_preview"].includes(input.action)) revalidatePath("/app", "layout");
    return { ok: true, data: data ? JSON.parse(JSON.stringify(data)) : undefined, href };
  } catch (error) {
    return { ok: false, error: error instanceof z.ZodError ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message.replaceAll("_", " ") : "Unable to complete this action. Please retry." };
  }
}
