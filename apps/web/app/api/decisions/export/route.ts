import { listDecisions } from "@railor/core";
import { getSession } from "../../../../lib/auth";
export async function GET() {
  const session = await getSession();
  if (!session?.organization) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rows = await listDecisions(session.organization.id, { limit: 100 });
  const cell = (value: unknown) => `"${String(value ?? "").replace(/^[\s]*[=+@-]|^[\t\r\n]/, "'$&").replaceAll('"', '""')}"`;
  const lines = [["id", "status", "mode", "provider", "amount", "currency", "evaluated_at", "decision_hash"], ...rows.map((r) => [r.id, r.status, r.mode, r.proposedExecutor ?? r.recommendedProviderSlug, r.intentSnapshot.amount, r.intentSnapshot.amountCurrency, r.evaluatedAt.toISOString(), r.decisionHash])];
  return new Response(lines.map((row) => row.map(cell).join(",")).join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="railor-latest-100-decisions.csv"', "cache-control": "no-store" } });
}
