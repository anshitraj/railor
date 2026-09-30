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
  if (!session.organization) redirect("/welcome");

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
    { id: "action:new-corridor", label: "New corridor search", group: "Action", href: "/app/corridors", keywords: "route search find" },
    { id: "action:pay", label: "Send a payment", group: "Action", href: "/app/payments/new", keywords: "payout transfer send money pay" },
    { id: "action:prices", label: "Compare prices (fees & FX)", group: "Action", href: "/app/prices", keywords: "price fee fx rate cheapest wise airwallex skydo payzoll compare cost" },
    { id: "action:beneficiary", label: "Add a beneficiary", group: "Action", href: "/app/beneficiaries", keywords: "recipient payee bank account iban wallet" },
    { id: "action:connect", label: "Connect a provider account", group: "Action", href: "/app/settings/connections", keywords: "credentials api key sandbox production circle bridge" },
    { id: "action:routing", label: "Routing settings", group: "Action", href: "/app/routing", keywords: "fallback preset preferred providers" },
    { id: "action:evaluate", label: "Evaluate a payment", group: "Action", href: "/app/decisions", keywords: "decision check policy" },
    { id: "action:policy", label: "Create a policy", group: "Action", href: "/app/policies", keywords: "rules guardrails" },
    { id: "action:compare", label: "Compare providers", group: "Action", href: "/app/compare", keywords: "diff side by side" },
    { id: "action:monitor", label: "Monitor a provider or corridor", group: "Action", href: "/app/monitoring", keywords: "watch alert notify" },
    { id: "action:readiness", label: "Update KYB readiness profile", group: "Action", href: "/app/readiness", keywords: "kyc kyb documents" },
    { id: "action:invite", label: "Invite a teammate", group: "Action", href: "/app/settings#team", keywords: "member team user" },
    { id: "action:keys", label: "Create or reveal API key", group: "Developer", href: "/app/developers", keywords: "token test live" },
    { id: "docs:start", label: "Docs — Getting started", group: "Docs", href: "/docs" },
    { id: "docs:api", label: "Docs — API reference", group: "Docs", href: "/docs/api" },
    { id: "docs:sdks", label: "Docs — SDKs", group: "Docs", href: "/docs/sdks" },
    { id: "docs:mcp", label: "Docs — MCP server", group: "Docs", href: "/docs/mcp" },
    { id: "docs:cli", label: "Docs — CLI", group: "Docs", href: "/docs/cli" },
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
