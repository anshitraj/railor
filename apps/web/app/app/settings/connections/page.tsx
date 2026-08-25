import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionLabel } from "@railor/ui";
import { getSession } from "../../../../lib/auth";
import { getConnectableProviders } from "../../../../lib/connections";
import { ConnectionCard } from "../../../../components/app/connection-card";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");

  const rows = await getConnectableProviders(session.organization.id);

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/app/settings" className="text-[12.5px] font-medium text-[var(--color-purple)]">
          ← Settings
        </Link>
        <h1 className="text-[24px] font-semibold tracking-tight">Connections</h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          Connect your own accounts with the providers Railor tracks. Credentials are encrypted at
          rest and never leave the server; only a live connection test confirms they work.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <SectionLabel>{rows.length} providers</SectionLabel>
        <div className="grid gap-3">
          {rows.map(({ provider, connection, adapter }) => (
            <ConnectionCard
              key={provider.id}
              providerId={provider.id}
              name={provider.name}
              category={provider.category}
              description={provider.description}
              docsUrl={provider.docsUrl}
              status={connection?.status ?? "not_connected"}
              hasAdapter={Boolean(adapter)}
              credentialFields={adapter?.credentialFields ?? []}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
