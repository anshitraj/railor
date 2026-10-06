import { listPolicies } from "@railor/core";
import { requireSession } from "../../../lib/auth";
import { getIntentOptions } from "../../../lib/reference";
import { SearchCompare } from "../../../components/app/search-compare";

export const metadata = { title: "Search infrastructure" };
export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const session = await requireSession();
  if (!session.organization) return null;
  const [policies, options] = await Promise.all([listPolicies(session.organization.id), getIntentOptions()]);
  return <SearchCompare policies={policies.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name }))}
    options={options} entityCountry={session.organization.entityCountry ?? ""} canDecide={session.role !== "viewer"} defaultEmail={session.user.email} />;
}
