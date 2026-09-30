import Link from "next/link";
import { redirect } from "next/navigation";
import { getDefaultActivePolicy, getOrgPaymentSettings, liveMoneyMovementEnabled, listBeneficiaries } from "@railor/core";
import { getSession } from "../../../../lib/auth";
import { getSavedCorridors } from "../../../../lib/org";
import { getIntentOptions } from "../../../../lib/reference";
import { ProductHeader } from "../../../../components/app/product-ui";
import { PaymentComposer } from "../../../../components/app/payments/payment-composer";

export const dynamic = "force-dynamic";
export const metadata = { title: "New payment" };

/** A currency spoken by exactly one country names that country; USD defaults to the US. Otherwise the person picks. */
function countryForCurrency(currency: string, currencyByCountry: Record<string, string>) {
  if (currency === "USD") return "US";
  const countries = Object.entries(currencyByCountry).filter(([, c]) => c === currency).map(([country]) => country);
  return countries.length === 1 ? countries[0] : undefined;
}

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  if (session.role === "viewer") redirect("/app/payments");
  const org = session.organization;
  const [options, corridors, beneficiaries, settings, policy, params] = await Promise.all([
    getIntentOptions(),
    getSavedCorridors(org.id),
    listBeneficiaries(org.id),
    getOrgPaymentSettings(org.id),
    getDefaultActivePolicy(org.id),
    searchParams,
  ]);
  const liveAvailable = liveMoneyMovementEnabled() && settings.liveEnabled;
  // Arriving from a price check: start from that exact pair, amount and provider.
  const code = (v?: string) => (v && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : undefined);
  const from = code(params.from);
  const to = code(params.to);
  const prefill =
    from && to && Number(params.amount) > 0
      ? {
          sourceCurrency: from,
          destinationCurrency: to,
          destinationCountry: countryForCurrency(to, options.currencyByCountry),
          amount: Math.min(10_000_000, Number(params.amount)),
          provider: params.provider && /^[a-z0-9-]{1,64}$/.test(params.provider) ? params.provider : undefined,
        }
      : undefined;
  return (
    <div className="product-page space-y-6">
      <Link href="/app/payments" className="product-quiet-link">
        ← Payments
      </Link>
      <ProductHeader
        eyebrow="Money movement / new"
        title="New payment"
        description="Pick the route and who gets paid. Railor checks your policy, plans the route across eligible providers, and shows you both before anything is sent."
      />
      <PaymentComposer
        options={options}
        corridors={corridors.map((c) => ({ id: c.id, label: c.label, query: c.query as Record<string, unknown> }))}
        beneficiaries={beneficiaries.map((b) => ({ id: b.id, label: b.label, holderName: b.holderName, country: b.country, currency: b.currency, method: b.method, displayHint: b.displayHint }))}
        entityCountry={org.entityCountry ?? undefined}
        prefill={prefill}
        hasActivePolicy={Boolean(policy)}
        live={{
          available: liveAvailable,
          reason: !liveMoneyMovementEnabled()
            ? "Live money movement is switched off on this deployment."
            : "Live payments are not enabled for this workspace yet — Railor enables them after review.",
        }}
      />
    </div>
  );
}
