import { redirect } from "next/navigation";
import { getOrgPaymentSettings, loadProviderInputs } from "@railor/core";
import { getSession } from "../../../lib/auth";
import { getIntentOptions } from "../../../lib/reference";
import styles from "../../../components/app/payments/routing-settings.module.css";
import { RoutingWorkspace } from "../../../components/app/payments/routing-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Routing" };

export default async function RoutingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;
  const params = await searchParams;
  const [settings, providers, options] = await Promise.all([getOrgPaymentSettings(org.id), loadProviderInputs(), getIntentOptions()]);
  const providerOptions = providers.filter((p) => !p.isDemo).map((p) => ({ value: p.slug, label: p.name }));
  return (
    <div className="product-page space-y-6">
      <header className={styles.pageHeading}><h1>Routing</h1><p>Choose how eligible providers are ranked, then preview a route against your saved settings.</p></header>
      <RoutingWorkspace
        initial={{
          routingPreset: settings.routingPreset,
          preferredProviders: settings.preferredProviders,
          blockedProviders: settings.blockedProviders,
          fallbackEnabled: settings.fallbackEnabled,
          maxAttempts: settings.maxAttempts,
        }}
        providers={providerOptions}
        canEdit={session.role === "owner" || session.role === "admin"}
        canPreview={session.role !== "viewer"}
        options={options}
        entityCountry={org.entityCountry ?? undefined}
        initialTab={params.tab === "preview" && session.role !== "viewer" ? "preview" : "settings"}
      />
    </div>
  );
}
