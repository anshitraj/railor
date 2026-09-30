import { redirect } from "next/navigation";
import { getOrgPaymentSettings, loadProviderInputs } from "@railor/core";
import { getSession } from "../../../lib/auth";
import { getIntentOptions } from "../../../lib/reference";
import { ProductHeader } from "../../../components/app/product-ui";
import { RouteTester, RoutingSettings } from "../../../components/app/payments/routing-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Routing" };

export default async function RoutingPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;
  const [settings, providers, options] = await Promise.all([getOrgPaymentSettings(org.id), loadProviderInputs(), getIntentOptions()]);
  const providerOptions = providers.filter((p) => !p.isDemo).map((p) => ({ value: p.slug, label: p.name }));
  return (
    <div className="product-page space-y-6">
      <ProductHeader
        eyebrow="Money movement / orchestration"
        title="Routing"
        description="Route each payment by eligibility, compliance, health, observed reliability, cost, speed, limits and your own preferences — with automatic fallback when a provider says no."
        value={settings.routingPreset.replaceAll("_", " ")}
        valueLabel="current preset"
      />
      <RoutingSettings
        initial={{
          routingPreset: settings.routingPreset,
          preferredProviders: settings.preferredProviders,
          blockedProviders: settings.blockedProviders,
          fallbackEnabled: settings.fallbackEnabled,
          maxAttempts: settings.maxAttempts,
        }}
        providers={providerOptions}
        canEdit={session.role === "owner" || session.role === "admin"}
      />
      {session.role !== "viewer" ? <RouteTester options={options} entityCountry={org.entityCountry ?? undefined} /> : null}
    </div>
  );
}
