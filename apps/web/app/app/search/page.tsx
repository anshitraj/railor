import { interpretRules, listPolicies } from "@railor/core";
import type { IntentDraft } from "../../../components/app/intent-builder";
import { requireSession } from "../../../lib/auth";
import { getIntentOptions } from "../../../lib/reference";
import { SearchCompare } from "../../../components/app/search-compare";

export const metadata = { title: "Search infrastructure" };
export const dynamic = "force-dynamic";

/** A question typed on the public site becomes the starting point of the route search. */
function draftFromQuery(q: string): Partial<IntentDraft> {
  const query = interpretRules(q).query as Record<string, string | number | undefined>;
  const text = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const draft: Partial<IntentDraft> = {};
  if (text("entityCountry")) draft.sourceEntityCountry = text("entityCountry");
  if (text("customerType") === "business" || text("customerType") === "individual") draft.sourceEntityType = text("customerType") as IntentDraft["sourceEntityType"];
  if (text("sourceAsset")) { draft.sourceKind = "asset"; draft.sourceAsset = text("sourceAsset"); }
  else if (text("sourceCurrency")) { draft.sourceKind = "fiat"; draft.sourceCurrency = text("sourceCurrency"); }
  if (text("sourceNetwork")) draft.sourceNetwork = text("sourceNetwork");
  if (text("destinationCountry")) draft.destinationCountry = text("destinationCountry");
  if (text("destinationCurrency")) draft.destinationCurrency = text("destinationCurrency");
  if (text("endpointType")) draft.endpointType = text("endpointType");
  if (typeof query.amount === "number" && query.amount > 0) draft.amount = query.amount;
  return draft;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSession();
  if (!session.organization) return null;
  const q = (await searchParams).q?.trim().slice(0, 300);
  const [policies, options] = await Promise.all([listPolicies(session.organization.id), getIntentOptions()]);
  const savedPolicy = policies.find((p) => p.status === "draft" || p.status === "active");
  return <SearchCompare policies={policies.filter((p) => p.status === "active" && p.activeVersionId).map((p) => ({ id: p.id, name: p.name }))}
    savedPolicy={savedPolicy ? { id: savedPolicy.id, name: savedPolicy.name } : null} canEditPolicies={["owner", "admin"].includes(session.role ?? "")}
    options={options} entityCountry={session.organization.entityCountry ?? ""} canDecide={session.role !== "viewer"} defaultEmail={session.user.email}
    prefill={q ? { text: q, draft: draftFromQuery(q) } : undefined} />;
}
