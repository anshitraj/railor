import { redirect } from "next/navigation";
import { loadProviderSummaries } from "@railor/core";
import { getSession } from "../../lib/auth";
import { DEMO_EMAIL } from "../../lib/demo";
import { getSavedCorridors } from "../../lib/org";
import { AppShell } from "../../components/app/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.organization) redirect("/login?error=no_org");

  const [providers, corridors] = await Promise.all([
    loadProviderSummaries(),
    getSavedCorridors(session.organization.id),
  ]);

  const palette = [
    ...corridors.map((c) => ({
      id: `corridor:${c.id}`,
      label: c.label,
      group: "Corridor",
      href: `/app/corridors?saved=${c.id}`,
    })),
    ...providers.map((p) => ({
      id: `provider:${p.slug}`,
      label: p.name,
      group: "Provider",
      hint: p.category,
      href: `/app/providers/${p.slug}`,
    })),
    { id: "action:new-corridor", label: "New corridor search", group: "Action", href: "/app/corridors" },
    { id: "action:monitoring", label: "Monitoring", group: "Action", href: "/app/monitoring" },
    { id: "action:readiness", label: "KYB readiness profile", group: "Action", href: "/app/readiness" },
    { id: "action:keys", label: "API keys", group: "Developer", href: "/app/developers" },
    { id: "action:docs", label: "Documentation", group: "Developer", href: "/docs" },
  ];

  return (
    <AppShell
      orgName={session.organization.name}
      userEmail={session.user.email}
      isDemo={session.user.email === DEMO_EMAIL}
      palette={palette}
    >
      {children}
    </AppShell>
  );
}
