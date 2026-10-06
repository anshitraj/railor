import Link from "next/link";
import { redirect } from "next/navigation";
import { interpretRules } from "@railor/core";
import { getSession } from "../../lib/auth";
import { getReferenceOptions } from "../../lib/reference";
import { createOrganizationForUser } from "../../lib/org";
import { OnboardingFlow } from "../../components/onboarding/onboarding-flow";
import { RailorBrand } from "../../components/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

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
  const params = await searchParams;
  if (!session.organization) {
    // Signed in without a workspace (left their last one, or declined an invite): make one
    // rather than bouncing between /login and /welcome.
    await createOrganizationForUser(session.user.id, session.user.email);
    const qs = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    redirect(`/welcome${qs.size ? `?${qs}` : ""}`);
  }

  const query = typeof params.q === "string" ? params.q : undefined;
  const reference = await getReferenceOptions();

  // Anything the visitor typed before signing up becomes the starting point.
  const interpretation = query ? interpretRules(query) : null;
  const domain = session.organization.emailDomain ?? "";
  const tld = domain.split(".").pop() ?? "";
  const detectedCountry = interpretation?.query.entityCountry ?? TLD_COUNTRY[tld];

  const org = session.organization;

  return (
    <main id="main" className="min-h-screen">
      <header className="mx-auto flex w-[min(760px,calc(100%-2rem))] flex-wrap items-center gap-3 py-6">
        <Link href="/" className="flex items-center gap-2">
          <RailorBrand />
        </Link>
        <span className="order-3 w-full text-[13px] text-[var(--color-muted)] sm:order-none sm:w-auto">
          {org.name}
        </span>
        <span className="flex-1" />
        <Link href="/app" className="text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)]">
          Do this later
        </Link>
      </header>

      <div className="mx-auto w-[min(760px,calc(100%-2rem))] pb-24">
        <OnboardingFlow
          countries={reference.countries}
          currencies={reference.currencies}
          seed={{
            initialStep: org.onboardingCompletedAt ? 0 : org.onboardingStep,
            assumptions: org.assumptions ?? [],
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
