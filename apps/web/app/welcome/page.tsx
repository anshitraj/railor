import Link from "next/link";
import { redirect } from "next/navigation";
import { interpretRules } from "@railor/core";
import { getSession } from "../../lib/auth";
import { getReferenceOptions } from "../../lib/reference";
import { OnboardingFlow } from "../../components/onboarding/onboarding-flow";
import { RailorMark } from "../../components/marketing/nav";

export const dynamic = "force-dynamic";

/** ccTLD → country. A defensible guess, always shown as "Detected" and editable. */
const TLD_COUNTRY: Record<string, string> = {
  in: "IN",
  ae: "AE",
  sg: "SG",
  uk: "GB",
  de: "DE",
  fr: "FR",
  nl: "NL",
  ng: "NG",
  br: "BR",
  mx: "MX",
  ke: "KE",
  za: "ZA",
  ph: "PH",
  id: "ID",
  ca: "CA",
  au: "AU",
  hk: "HK",
  ch: "CH",
  sa: "SA",
  tr: "TR",
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.organization) redirect("/login?error=no_org");

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : undefined;
  const reference = await getReferenceOptions();

  // Anything the visitor typed before signing up becomes the starting point.
  const interpretation = query ? interpretRules(query) : null;
  const domain = session.organization.emailDomain ?? "";
  const tld = domain.split(".").pop() ?? "";
  const detectedCountry = interpretation?.query.entityCountry ?? TLD_COUNTRY[tld];

  const org = session.organization;

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex w-[min(900px,calc(100%-2rem))] items-center gap-3 py-8">
        <Link href="/" className="flex items-center gap-2">
          <RailorMark />
          <span className="text-[15px] font-semibold">Railor</span>
        </Link>
        <span className="text-[13px] text-[var(--color-muted)]">
          Setting up {org.name}
        </span>
        <span className="flex-1" />
        <Link href="/app" className="text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)]">
          Skip to dashboard
        </Link>
      </header>

      <div className="mx-auto w-[min(900px,calc(100%-2rem))] pb-24">
        <OnboardingFlow
          countries={reference.countries}
          currencies={reference.currencies}
          seed={{
            building: org.building ?? undefined,
            entityCountry: org.entityCountry ?? interpretation?.query.entityCountry,
            detectedCountry,
            targetCountries:
              org.targetCountries?.length
                ? org.targetCountries
                : interpretation?.query.destinationCountry
                  ? [interpretation.query.destinationCountry]
                  : [],
            settlementCurrencies:
              org.settlementCurrencies?.length
                ? org.settlementCurrencies
                : interpretation?.query.destinationCurrency
                  ? [interpretation.query.destinationCurrency]
                  : [],
            interests: org.interests ?? [],
            fromQuery: query,
          }}
        />
      </div>
    </main>
  );
}
