/**
 * Loads the real provider universe into a disposable database, so a local
 * preview or browser test shows the actual providers, routes and evidence —
 * not the handful of fixture rows apps/web/e2e/seed.mts creates.
 *
 *   export   Read-only against the configured hosted database (Neon): copies
 *            every real (is_demo = false) provider with its products,
 *            capabilities, receiving endpoints, routes, fees, limits,
 *            requirements, evidence and source documents, plus the reference
 *            catalogs they point at, into .railor/snapshots/ (gitignored).
 *            Plain SELECTs only — works even while the hosted database has
 *            pending migrations, because it never calls ensureMigrated().
 *   import   Into a disposable PGlite database ONLY (same guard as
 *            e2e/seed.mts: DATABASE_URL empty, PGLITE_DATA_DIR containing
 *            "railor-browser-test-"). Runs after or instead of e2e/seed.mts;
 *            a provider that already exists by slug (the e2e fixtures) is
 *            updated in place and its id reused, so nothing is duplicated.
 *
 *   DATABASE_URL=<neon> npx tsx packages/database/src/seed/preview-universe.ts export
 *   DATABASE_URL= PGLITE_DATA_DIR=<tmp>/railor-browser-test-x/db npx tsx packages/database/src/seed/preview-universe.ts import
 */
import "../dev-env.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql, type SQL } from "drizzle-orm";
import { ensureMigrated, getDbHandle, isLocalDatabaseUrl } from "../client.js";

type Row = Record<string, unknown>;
interface Snapshot {
  exportedAt: string;
  source: string;
  tables: Record<string, Row[]>;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const SNAPSHOT_PATH = path.join(repoRoot, ".railor", "snapshots", "provider-universe.json");

/** FK-safe order. Reference catalogs first, then providers, then what hangs off them. */
const REFERENCE_TABLES = ["countries", "currencies", "blockchains", "assets", "asset_networks", "named_rails", "requirements"];
const PROVIDER_CHILD_TABLES = ["provider_products", "provider_capabilities", "receiving_endpoints", "provider_routes", "fees", "limits", "provider_requirements"];

async function rowsOf(query: SQL): Promise<Row[]> {
  const { db } = await getDbHandle();
  const result = (await db.execute(query)) as unknown as { rows?: Row[] } | Row[];
  return Array.isArray(result) ? result : (result.rows ?? []);
}

async function exportSnapshot() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || isLocalDatabaseUrl(url)) throw new Error("export reads the hosted database: set DATABASE_URL to it (read-only SELECTs only).");
  const tables: Record<string, Row[]> = {};
  for (const t of REFERENCE_TABLES) tables[t] = await rowsOf(sql`select * from ${sql.identifier(t)}`);
  tables.providers = await rowsOf(sql`select * from providers where is_demo = false`);
  const ids = tables.providers.map((p) => p.id as string);
  const inReal = (col: string) => sql`${sql.identifier(col)} in (select id from providers where is_demo = false)`;
  for (const t of PROVIDER_CHILD_TABLES) tables[t] = await rowsOf(sql`select * from ${sql.identifier(t)} where ${inReal("provider_id")}`);
  tables.source_documents = await rowsOf(sql`select * from source_documents where ${inReal("provider_id")}`);
  // Evidence owned by a real provider, plus any a real row points at directly.
  tables.evidence = await rowsOf(sql`select * from evidence where ${inReal("provider_id")} or id in (
    select evidence_id from provider_capabilities where ${inReal("provider_id")} union
    select evidence_id from receiving_endpoints where ${inReal("provider_id")} union
    select evidence_id from provider_routes where ${inReal("provider_id")} union
    select evidence_id from fees where ${inReal("provider_id")} union
    select evidence_id from provider_requirements where ${inReal("provider_id")})`);
  const snapshot: Snapshot = { exportedAt: new Date().toISOString(), source: new URL(url).hostname, tables };
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot));
  const size = (fs.statSync(SNAPSHOT_PATH).size / 1_048_576).toFixed(1);
  console.log(`exported ${ids.length} real providers -> ${SNAPSHOT_PATH} (${size} MB)`);
  for (const [t, rows] of Object.entries(tables)) console.log(`  ${t.padEnd(22)} ${rows.length}`);
}

interface ColumnType {
  cast: string;
  kind: "json" | "array" | "scalar";
}

async function columnTypes(table: string): Promise<Map<string, ColumnType>> {
  const cols = await rowsOf(
    sql`select column_name, data_type, udt_name from information_schema.columns where table_schema = 'public' and table_name = ${table}`,
  );
  const map = new Map<string, ColumnType>();
  for (const c of cols) {
    const dataType = String(c.data_type);
    const udt = String(c.udt_name);
    if (dataType === "jsonb" || dataType === "json") map.set(String(c.column_name), { cast: dataType, kind: "json" });
    else if (dataType === "ARRAY") map.set(String(c.column_name), { cast: `"${udt.slice(1)}"[]`, kind: "array" });
    else map.set(String(c.column_name), { cast: dataType === "USER-DEFINED" ? `"${udt}"` : udt, kind: "scalar" });
  }
  return map;
}

function serialize(value: unknown, type: ColumnType): string | null {
  if (value === null || value === undefined) return null;
  if (type.kind === "json") return typeof value === "string" ? value : JSON.stringify(value);
  if (type.kind === "array") {
    const items = Array.isArray(value) ? value : [];
    return `{${items.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
  }
  return typeof value === "string" ? value : String(value);
}

/** Inserts rows (only columns the target table actually has), ON CONFLICT DO NOTHING, in chunks. */
async function insertRows(table: string, rows: Row[], conflictTarget?: string[]): Promise<number> {
  if (!rows.length) return 0;
  const { db } = await getDbHandle();
  const types = await columnTypes(table);
  const columns = Object.keys(rows[0]!).filter((c) => types.has(c));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const values = sql.join(
      chunk.map((row) => sql`(${sql.join(columns.map((c) => sql`${serialize(row[c], types.get(c)!)}::${sql.raw(types.get(c)!.cast)}`), sql`, `)})`),
      sql`, `,
    );
    const conflict = conflictTarget ? sql`on conflict (${sql.join(conflictTarget.map((c) => sql.identifier(c)), sql`, `)}) do nothing` : sql`on conflict do nothing`;
    const result = (await db.execute(
      sql`insert into ${sql.identifier(table)} (${sql.join(columns.map((c) => sql.identifier(c)), sql`, `)}) values ${values} ${conflict}`,
    )) as unknown as { affectedRows?: number; rowCount?: number };
    inserted += result.affectedRows ?? result.rowCount ?? 0;
  }
  return inserted;
}

async function importSnapshot() {
  if (process.env.DATABASE_URL?.trim() || !process.env.PGLITE_DATA_DIR?.includes("railor-browser-test-")) {
    throw new Error("import only targets a disposable browser-test PGlite database (DATABASE_URL empty, PGLITE_DATA_DIR containing railor-browser-test-).");
  }
  if (!fs.existsSync(SNAPSHOT_PATH)) throw new Error(`no snapshot at ${SNAPSHOT_PATH} — run export first`);
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;
  await ensureMigrated();
  const { db } = await getDbHandle();
  const t = snapshot.tables;
  const counts: Record<string, number> = {};

  for (const table of REFERENCE_TABLES) counts[table] = await insertRows(table, t[table] ?? []);

  // Providers: reuse an existing row with the same slug (e2e fixtures), else insert with its real id.
  const providerId = new Map<string, string>();
  const existing = new Map((await rowsOf(sql`select id, slug from providers`)).map((r) => [String(r.slug), String(r.id)]));
  const types = await columnTypes("providers");
  const updatable = Object.keys((t.providers ?? [])[0] ?? {}).filter((c) => types.has(c) && !["id", "slug", "created_at"].includes(c));
  const fresh: Row[] = [];
  for (const p of t.providers ?? []) {
    const current = existing.get(String(p.slug));
    if (!current) {
      providerId.set(String(p.id), String(p.id));
      fresh.push(p);
      continue;
    }
    providerId.set(String(p.id), current);
    await db.execute(
      sql`update providers set ${sql.join(updatable.map((c) => sql`${sql.identifier(c)} = ${serialize(p[c], types.get(c)!)}::${sql.raw(types.get(c)!.cast)}`), sql`, `)} where id = ${current}::uuid`,
    );
  }
  counts.providers = await insertRows("providers", fresh);
  counts.providers_updated = (t.providers ?? []).length - fresh.length;
  const mapProvider = (rows: Row[]): Row[] =>
    rows.filter((r) => providerId.has(String(r.provider_id))).map((r) => ({ ...r, provider_id: providerId.get(String(r.provider_id)) }));

  // Requirements are keyed by `key`; map snapshot ids onto whatever id the target already has.
  const requirementId = new Map<string, string>();
  const targetReqs = new Map((await rowsOf(sql`select id, key from requirements`)).map((r) => [String(r.key), String(r.id)]));
  for (const r of t.requirements ?? []) {
    const id = targetReqs.get(String(r.key));
    if (id) requirementId.set(String(r.id), id);
  }

  // Source documents are unique per (provider, url).
  counts.source_documents = await insertRows("source_documents", mapProvider(t.source_documents ?? []), ["provider_id", "url"]);
  const docId = new Map<string, string>();
  const targetDocs = new Map((await rowsOf(sql`select id, provider_id, url from source_documents`)).map((d) => [`${d.provider_id}|${d.url}`, String(d.id)]));
  for (const d of t.source_documents ?? []) {
    const id = targetDocs.get(`${providerId.get(String(d.provider_id))}|${d.url}`);
    if (id) docId.set(String(d.id), id);
  }

  // Evidence: snapshots aren't exported, and supersession is restored in a second pass.
  const evidenceRows = (t.evidence ?? []).map((e) => ({
    ...e,
    provider_id: e.provider_id ? (providerId.get(String(e.provider_id)) ?? null) : null,
    source_document_id: e.source_document_id ? (docId.get(String(e.source_document_id)) ?? null) : null,
    snapshot_id: null,
    superseded_by: null,
  }));
  counts.evidence = await insertRows("evidence", evidenceRows);
  for (const e of t.evidence ?? []) {
    if (!e.superseded_by) continue;
    await db.execute(
      sql`update evidence set superseded_by = ${String(e.superseded_by)}::uuid where id = ${String(e.id)}::uuid and exists (select 1 from evidence where id = ${String(e.superseded_by)}::uuid)`,
    );
  }

  for (const table of PROVIDER_CHILD_TABLES) {
    let rows = mapProvider(t[table] ?? []);
    if (table === "provider_requirements") {
      rows = rows.filter((r) => requirementId.has(String(r.requirement_id))).map((r) => ({ ...r, requirement_id: requirementId.get(String(r.requirement_id)) }));
    }
    counts[table] = await insertRows(table, rows);
  }

  console.log(`imported snapshot from ${snapshot.source} (exported ${snapshot.exportedAt})`);
  for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(22)} ${n}`);
}

async function main() {
  const mode = process.argv[2];
  const { close } = await getDbHandle();
  try {
    if (mode === "export") await exportSnapshot();
    else if (mode === "import") await importSnapshot();
    else throw new Error("usage: preview-universe.ts export|import");
  } finally {
    await close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
