import "server-only";
import { loadProviderBySlug } from "@railor/core";

export interface CompareCell {
  value: string;
  tone: "ok" | "warn" | "bad" | "neutral";
}

export interface CompareRow {
  label: string;
  group: string;
  cells: CompareCell[];
  /** True when providers disagree — drives the "differences only" filter. */
  differs: boolean;
}

export interface CompareTable {
  providers: Array<{ slug: string; name: string; category: string; verifiedAt: string | null }>;
  rows: CompareRow[];
}

const PRODUCT_LABELS: Record<string, string> = {
  off_ramp: "Off-ramp",
  on_ramp: "On-ramp",
  payout: "Payouts",
  collection: "Collections",
  virtual_account: "Virtual accounts",
  card_issuing: "Card issuing",
  card_funding: "Card funding",
  wallet: "Wallets",
  treasury: "Treasury",
  kyc_kyb: "KYC / KYB",
};

const yes = (v: boolean): CompareCell => ({ value: v ? "Yes" : "No", tone: v ? "ok" : "bad" });

/**
 * Builds a like-for-like comparison. Facts only: anything Railor cannot
 * evidence is rendered as "Unknown" rather than assumed absent.
 */
export async function buildComparison(slugs: string[]): Promise<CompareTable> {
  const loaded = (await Promise.all(slugs.slice(0, 4).map(loadProviderBySlug))).filter(
    (x): x is NonNullable<typeof x> => Boolean(x),
  );

  const providers = loaded.map((row) => ({
    slug: row.provider.slug,
    name: row.provider.name,
    category: row.provider.category,
    verifiedAt: row.provider.lastVerifiedAt?.toISOString() ?? null,
  }));

  const entityCountries = [
    ...new Set(
      loaded.flatMap((row) =>
        row.facets.filter((f) => f.capability.entityCountry).map((f) => f.capability.entityCountry!),
      ),
    ),
  ].sort();

  const destinations = [
    ...new Set(
      loaded.flatMap((row) =>
        row.facets
          .filter((f) => f.capability.destinationCountry)
          .map((f) => `${f.capability.destinationCountry}/${f.capability.destinationCurrency}`),
      ),
    ),
  ].sort();

  const products = [...new Set(loaded.flatMap((row) => row.products.map((p) => p.product)))];
  const assets = [
    ...new Set(
      loaded.flatMap((row) =>
        row.facets.filter((f) => f.capability.sourceAsset).map((f) => f.capability.sourceAsset!),
      ),
    ),
  ].sort();

  const rows: CompareRow[] = [];
  const push = (group: string, label: string, cells: CompareCell[]) => {
    const differs = new Set(cells.map((c) => c.value)).size > 1;
    rows.push({ group, label, cells, differs });
  };

  for (const product of products) {
    push(
      "Products",
      PRODUCT_LABELS[product] ?? product,
      loaded.map((row) => yes(row.products.some((p) => p.product === product))),
    );
  }

  for (const country of entityCountries) {
    push(
      "Entity eligibility",
      `${country} businesses`,
      loaded.map((row) => {
        const facets = row.facets.filter((f) => f.capability.entityCountry === country);
        if (!facets.length) return { value: "Unknown", tone: "neutral" as const };
        if (facets.some((f) => f.capability.availability === "unsupported"))
          return { value: "No", tone: "bad" as const };
        if (facets.some((f) => f.capability.availability === "partial"))
          return { value: "Conditional", tone: "warn" as const };
        return { value: "Yes", tone: "ok" as const };
      }),
    );
  }

  for (const destination of destinations) {
    const [country, currency] = destination.split("/");
    push(
      "Destinations",
      `${country} · ${currency}`,
      loaded.map((row) => {
        const facets = row.facets.filter(
          (f) =>
            f.capability.destinationCountry === country &&
            f.capability.destinationCurrency === currency,
        );
        if (!facets.length) return { value: "Not published", tone: "neutral" as const };
        if (facets.every((f) => f.capability.availability === "unsupported"))
          return { value: "No", tone: "bad" as const };
        if (facets.some((f) => f.capability.availability === "partial"))
          return { value: "Conditional", tone: "warn" as const };
        return { value: "Yes", tone: "ok" as const };
      }),
    );
  }

  for (const asset of assets) {
    push(
      "Assets",
      asset,
      loaded.map((row) =>
        yes(row.facets.some((f) => f.capability.sourceAsset === asset)),
      ),
    );
  }

  push("Developer", "REST API", loaded.map((row) => yes(row.provider.hasApi)));
  push("Developer", "Sandbox", loaded.map((row) => yes(row.provider.hasSandbox)));
  push("Developer", "Webhooks", loaded.map((row) => yes(row.provider.hasWebhooks)));
  push(
    "Developer",
    "SDKs",
    loaded.map((row) => ({
      value: row.provider.sdkLanguages?.length ? row.provider.sdkLanguages.join(", ") : "None",
      tone: row.provider.sdkLanguages?.length ? ("ok" as const) : ("neutral" as const),
    })),
  );

  push(
    "Onboarding",
    "Required documents",
    loaded.map((row) => ({
      value: String(row.requirements.filter((r) => r.mandatory).length),
      tone: "neutral" as const,
    })),
  );
  push(
    "Onboarding",
    "Published time to live",
    loaded.map((row) => ({
      value: row.provider.onboardingDays ? `~${row.provider.onboardingDays} days` : "Not published",
      tone: "neutral" as const,
    })),
  );
  push(
    "Commercials",
    "Published pricing",
    loaded.map((row) => ({
      value: row.fees[0]?.summary ?? "Not published",
      tone: row.fees.length ? ("neutral" as const) : ("neutral" as const),
    })),
  );
  push(
    "Commercials",
    "Published limits",
    loaded.map((row) => ({
      value: row.limits[0]?.summary ?? "Not published",
      tone: "neutral" as const,
    })),
  );
  push(
    "Freshness",
    "Last verified",
    loaded.map((row) => ({
      value: row.provider.lastVerifiedAt
        ? `${Math.max(1, Math.round((Date.now() - row.provider.lastVerifiedAt.getTime()) / 3_600_000))}h ago`
        : "Never",
      tone: "neutral" as const,
    })),
  );

  return { providers, rows };
}
