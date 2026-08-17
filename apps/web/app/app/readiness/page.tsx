import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, providerRequirements, providers, requirements } from "@railor/database";
import { getSession } from "../../../lib/auth";
import { getKybProfile } from "../../../lib/org";
import { ReadinessBoard } from "../../../components/app/readiness-board";

export const dynamic = "force-dynamic";

export default async function ReadinessPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");

  const db = await getDb();
  const [profile, allRequirements, providerReqs] = await Promise.all([
    getKybProfile(session.organization.id),
    db.select().from(requirements),
    db
      .select({
        slug: providers.slug,
        name: providers.name,
        key: requirements.key,
        mandatory: providerRequirements.mandatory,
      })
      .from(providerRequirements)
      .innerJoin(providers, eq(providerRequirements.providerId, providers.id))
      .innerJoin(requirements, eq(providerRequirements.requirementId, requirements.id)),
  ]);

  const aliasByKey = new Map(allRequirements.map((r) => [r.key, r.aliases ?? []]));

  const byProvider = new Map<string, { slug: string; name: string; keys: string[] }>();
  for (const row of providerReqs) {
    if (!row.mandatory) continue;
    const entry = byProvider.get(row.slug) ?? { slug: row.slug, name: row.name, keys: [] };
    entry.keys.push(row.key);
    byProvider.set(row.slug, entry);
  }

  return (
    <ReadinessBoard
      items={profile.map((p) => ({
        key: p.key,
        label: p.label,
        kind: p.kind,
        description: p.description,
        status: p.status,
        aliases: aliasByKey.get(p.key) ?? [],
      }))}
      providers={[...byProvider.values()]
        .map((p) => ({ slug: p.slug, name: p.name, missing: p.keys, total: p.keys.length }))
        .sort((a, b) => a.total - b.total)
        .slice(0, 10)}
    />
  );
}
