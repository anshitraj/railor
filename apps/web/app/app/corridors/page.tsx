import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, savedCorridors } from "@railor/database";
import { interpretRules, searchCorridors } from "@railor/core";
import { CorridorQuery } from "@railor/types";
import { getSession } from "../../../lib/auth";
import { getOrgTestKey, getSatisfiedRequirements } from "../../../lib/org";
import { FIELD_LABELS, getReferenceOptions, optionsByField } from "../../../lib/reference";
import { CorridorExplorer } from "../../../components/app/corridor-explorer";

export const dynamic = "force-dynamic";

export default async function CorridorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;
  const params = await searchParams;

  const db = await getDb();
  let query: CorridorQuery;
  let savedId: string | undefined;

  if (typeof params.saved === "string") {
    const [row] = await db
      .select()
      .from(savedCorridors)
      .where(eq(savedCorridors.id, params.saved))
      .limit(1);
    if (row && row.organizationId === org.id) {
      query = CorridorQuery.parse(row.query);
      savedId = row.id;
    } else {
      query = CorridorQuery.parse({ customerType: "business" });
    }
  } else if (typeof params.q === "string") {
    query = interpretRules(params.q).query;
  } else {
    // Opens with the org's own default route rather than an empty form.
    query = CorridorQuery.parse({
      entityCountry: org.entityCountry ?? undefined,
      destinationCountry: org.targetCountries?.[0],
      destinationCurrency: org.settlementCurrencies?.[0],
      sourceAsset: "USDC",
      customerType: "business",
    });
  }

  const [reference, satisfied, apiKey] = await Promise.all([
    getReferenceOptions(),
    getSatisfiedRequirements(org.id),
    getOrgTestKey(org.id),
  ]);

  const result = await searchCorridors(query, { satisfiedRequirements: satisfied });

  // Reuse the interpreter's token shape so the chips render identically to the
  // public search, whether or not the user typed a sentence.
  const tokens = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([field, value]) => ({
      field,
      value: value as string | number,
      label: `${FIELD_LABELS[field] ?? field}: ${value}`,
      confidence: 1,
      matchedText: "selected",
    }));

  return (
    <CorridorExplorer
      initialQuery={query as Record<string, string | number | undefined>}
      savedCorridorId={savedId}
      apiKey={apiKey ?? undefined}
      optionsByField={optionsByField(reference)}
      fieldLabels={FIELD_LABELS}
      initial={{
        interpretation: {
          tokens,
          missing: [],
          query: query as Record<string, string | number | undefined>,
        },
        providersChecked: result.providersChecked,
        counts: result.counts,
        results: JSON.parse(JSON.stringify(result.results)),
      }}
    />
  );
}
