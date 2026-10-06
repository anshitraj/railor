import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformPaymentFlags, liveMoneyMovementEnabled } from "@railor/core";
import { getSession } from "../../../../lib/auth";
import { getConnectionDirectory } from "../../../../lib/connections";
import { getEntitlement } from "../../../../lib/entitlements";
import { appOrigin } from "../../../../lib/security";
import { ConnectionDirectory } from "../../../../components/app/connection-directory";
import type { ConnectionCardProps } from "../../../../components/app/connection-card";
import { connectionProviderSlug } from "../../../../lib/connection-navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Provider connections" };

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;

  const [rows, flags, entitlement] = await Promise.all([getConnectionDirectory(org.id), getPlatformPaymentFlags(), getEntitlement(org.id)]);
  const canManage = session.role === "owner" || session.role === "admin";
  const params = await searchParams;
  const selectedSlug = typeof params.provider === "string" ? connectionProviderSlug(params.provider) : null;
  // A webhook URL needs the deployment's public origin. If it is misconfigured the page must still work; the
  // URL is simply unavailable (the readiness check reports the misconfiguration).
  let origin: string | null = null;
  try {
    origin = appOrigin();
  } catch {
    origin = null;
  }

  const cards: ConnectionCardProps[] = rows.map(({ provider, adapter, payout, connections, requested }) => ({
      providerId: provider.id,
      slug: provider.slug,
      name: provider.name,
      category: provider.category,
      description: provider.description,
      docsUrl: provider.docsUrl,
      pricingSourceUrl: provider.pricingSourceUrl,
      requested,
      defaultEmail: session.user.email,
      canManage: canManage && entitlement.limits.providerConnections,
      hasAdapter: Boolean(adapter),
      canQuote: Boolean(adapter?.getQuote),
      payout: payout ? { verification: payout.verification, methods: payout.supportedMethods } : null,
      liveApproved: flags.liveProviders.includes(provider.slug),
      credentialFields: [...(adapter?.credentialFields ?? []), ...(payout?.payoutCredentialFields ?? [])],
      connections: connections.map((c) => ({
        id: c.id,
        environment: c.environment,
        status: c.status,
        lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null,
        lastCheckDetail: c.lastCheckDetail,
        webhookUrl: origin && payout?.verifyWebhook ? `${origin}/api/webhooks/providers/${provider.slug}/${c.id}` : null,
      })),
  }));

  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <div className="workspace-heading flex flex-col gap-1">
        <Link href="/app/settings" className="text-[12.5px] font-medium text-[var(--color-purple)]">
          ← Settings
        </Link>
        <h1 className="font-semibold tracking-tight">Connections</h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          Connect the provider accounts you already hold. Sandbox connections carry test-mode payments; production connections carry live ones. Money always moves inside your own provider account — never through Railor.
        </p>
      </div>

      {!entitlement.limits.providerConnections ? (
        <div className="rounded-xl border border-[var(--color-warn)]/30 bg-[var(--color-warn-bg)] p-4 text-[13px]">
          Provider connections are part of Founding access.{" "}
          <Link href="/app/upgrade" className="font-semibold underline">
            See Founding access →
          </Link>{" "}
          Test-mode payments still work without one, simulated by Railor&apos;s sandbox rail.
        </div>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-[12.5px] sm:grid-cols-3">
        <Fact label="Live payments on this deployment" value={liveMoneyMovementEnabled() ? "Enabled" : "Disabled"} good={liveMoneyMovementEnabled()} />
        <Fact label="Providers approved for live payouts" value={flags.liveProviders.length ? flags.liveProviders.join(", ") : "None yet"} good={flags.liveProviders.length > 0} />
        <Fact label="Payments" value={flags.paused ? `Paused${flags.pausedReason ? ` — ${flags.pausedReason}` : ""}` : "Running"} good={!flags.paused} />
      </div>

      <ConnectionDirectory providers={cards} selectedSlug={selectedSlug} />
    </div>
  );
}

function Fact({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-faint)]">{label}</span>
      <span className={good ? "font-semibold text-[var(--color-ok)]" : "font-semibold text-[var(--color-ink-soft)]"}>{value}</span>
    </div>
  );
}
