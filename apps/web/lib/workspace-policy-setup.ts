export interface SavedSetupPolicy { id: string; name: string }

/** Saved drafts are progress; activation is a separate, explicit review step. */
export function workspacePolicySetup(active: boolean, saved: SavedSetupPolicy | null, canEdit: boolean) {
  if (active) return {
    title: "Company policy active", description: "Your active guardrails are ready for route comparison.",
    action: "View policy", href: saved ? `/app/policies/${saved.id}` : "/app/policies", done: true,
  };
  if (saved) return {
    title: "Review your saved policy", description: canEdit ? `${saved.name} is saved. Review and activate a version to use its guardrails.` : `${saved.name} is saved. Ask a workspace owner or admin to activate it.`,
    action: canEdit ? "Review & activate" : "View saved policy", href: `/app/policies/${saved.id}`, done: false,
  };
  return {
    title: "Set your company policy", description: canEdit ? "Choose your guardrails, then review and activate your policy." : "Ask your workspace owner to create and activate a company policy.",
    action: canEdit ? "Create a policy" : "View policies", href: canEdit ? "/app/policies#create-policy" : "/app/policies", done: false,
  };
}
