import { redirect } from "next/navigation";
import { AgentSetup } from "../../../../components/app/agent-setup";
import { getSession } from "../../../../lib/auth";
import { SETUP_CLIENTS } from "../../../../lib/developer-setup";
import { appOrigin } from "../../../../lib/security";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your agent" };

export default async function AgentSetupPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const { client } = await searchParams;
  const initialClient = SETUP_CLIENTS.find((name) => name === client) ?? "Claude Code";
  return <AgentSetup initialClient={initialClient} baseUrl={appOrigin()} canManage={session.role === "owner" || session.role === "admin"} />;
}
