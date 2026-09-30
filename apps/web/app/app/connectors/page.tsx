import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { connectorInstallations, connectorJobs, getDb } from "@railor/database";
import { Card } from "@railor/ui";
import { requireSession } from "../../../lib/auth";
import { recentDecisionChoices } from "../../../lib/decisions";
import { ConnectorRegistration, ConnectorSimulation } from "../../../components/app/workflow-forms";
import { ControlButton } from "../../../components/app/control-forms";
import { ProductBadge, ProductEmpty, ProductHeader } from "../../../components/app/product-ui";
export const dynamic = "force-dynamic";
export const metadata = { title: "Connectors" };
export default async function ConnectorsPage() {
  const session = await requireSession(); if (!session.organization) redirect("/welcome"); const db = await getDb(); const org = session.organization.id;
  const installations = await db.select({ id: connectorInstallations.id, name: connectorInstallations.name, lastSeenAt: connectorInstallations.lastSeenAt }).from(connectorInstallations).where(and(eq(connectorInstallations.organizationId, org), isNull(connectorInstallations.revokedAt)));
  const jobs = await db.select().from(connectorJobs).where(eq(connectorJobs.organizationId, org)).orderBy(desc(connectorJobs.createdAt)).limit(50);
  const admin = ["owner", "admin"].includes(session.role ?? "");
  const decisions = await recentDecisionChoices(org);
  return <div className="product-page space-y-7"><ProductHeader eyebrow="Execution edge / 06" title="Railor Connector" description="Run read-only quotes and sandbox simulations in your own environment. Tokens stay in your secret manager; this Connector protocol does not send provider credentials to Railor." value={installations.length} valueLabel="active installations" />
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">No live transfers are enabled. Provider quote adapters still require validation with your provider account.</div>
    {admin && <ConnectorRegistration />}
    <section className="space-y-3"><h2 className="font-display text-xl font-semibold">Installations</h2>{installations.length ? <div className="product-panel">{installations.map((i) => <div key={i.id} className="product-row"><div><h3 className="product-row-primary">{i.name}</h3><p className="product-row-secondary product-mono mt-1">{i.id}</p></div><ProductBadge status={i.lastSeenAt ? "connected" : "not connected"} /><span className="product-row-secondary product-mono">Last seen {i.lastSeenAt?.toISOString().slice(0, 16).replace("T", " ") ?? "never"}</span>{admin && <ControlButton command={{ action: "revoke_connector", id: i.id }}>Revoke token</ControlButton>}</div>)}</div> : <ProductEmpty mark="↔" title="No installations registered" description="Create a customer-hosted runtime above to make quote requests and sandbox simulations available." />}</section>
    {session.role !== "viewer" && <ConnectorSimulation installations={installations} decisions={decisions} />}
    <section className="space-y-3"><h2 className="font-display text-xl font-semibold">Recent jobs</h2>{!jobs.length && <ProductEmpty mark="•" title="No jobs yet" description="Queued quote requests and sandbox simulations will appear here with their receipts." />}{jobs.map((job) => <Card key={job.id} className="product-panel p-5"><div className="flex flex-wrap items-center justify-between gap-3"><Link className="product-quiet-link product-mono" href={`/app/decisions/${job.decisionId}`}>{String(job.payload.operation).replaceAll("_", " ")} ↗</Link><ProductBadge status={job.status} /></div><p className="product-mono mt-3 break-all text-[var(--color-muted)]">Job {job.id} · Key {job.idempotencyKey}</p>{job.status === "claimed" && job.expiresAt.getTime() < Date.now() && <p className="mt-2 text-sm text-red-700">No final receipt; outcome unknown. Do not automatically replay.</p>}{job.result && <details className="mt-3 text-sm"><summary className="cursor-pointer">View receipt</summary><pre className="mt-2 overflow-auto text-xs">{JSON.stringify(job.result, null, 2)}</pre></details>}</Card>)}</section></div>;
}
