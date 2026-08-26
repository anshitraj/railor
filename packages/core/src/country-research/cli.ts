#!/usr/bin/env node
/**
 * `pnpm research-country -- IN` (root) -> `pnpm --filter @railor/core
 * research-country -- IN` -> this file, with "IN" as argv[2].
 *
 * pnpm --filter <pkg> <script> runs with cwd = that package's own directory,
 * not the repo root, so a bare `import "dotenv/config"` (as migrate-run.ts /
 * seed/run.ts use) would resolve .env relative to the wrong directory and
 * silently find nothing — harmless for those two scripts only because
 * PGlite needs no env vars. This script hard-requires TAVILY_API_KEY /
 * GEMINI_API_KEY, so it resolves the repo-root .env explicitly instead.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
loadEnv({ path: path.join(repoRoot, ".env") });

const { RESEARCHABLE_COUNTRIES, isResearchableCountry } = await import("./config.js");
const { researchCountry } = await import("./ingest.js");

function usage(): never {
  console.error(`Usage: pnpm research-country -- <ISO2> [--force]\n\nSupported countries: ${RESEARCHABLE_COUNTRIES.join(", ")}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const forceRefresh = args.includes("--force");
const codeArg = args.find((a) => !a.startsWith("--"));
if (!codeArg) usage();

const code = codeArg.trim().toUpperCase();
if (!isResearchableCountry(code)) usage();

// Label for the phase that just FINISHED, not the one starting — onPhase
// fires as the pipeline enters a phase, so a phase's checkmark can only be
// printed once we've observed the pipeline move past it (proof it
// succeeded). A phase that fails never reaches that point, so it never
// prints a false checkmark — the failure block below reports it instead.
const COMPLETION_LABEL: Record<string, string> = {
  searching: "Searching for authoritative sources",
  extracting: "Retrieving content and extracting structured data",
  validating: "Validating extracted data",
};

console.log(`Researching ${code}\n✓ Country identified`);

let pendingPhase: string | null = null;

try {
  const report = await researchCountry(code, {
    triggerType: "cli",
    forceRefresh,
    onPhase: ({ phase }) => {
      if (phase === "failed") return; // printed in the catch/failure block below with full detail
      if (pendingPhase && COMPLETION_LABEL[pendingPhase]) console.log(`✓ ${COMPLETION_LABEL[pendingPhase]}`);
      pendingPhase = phase;
    },
  });

  if (report.status === "failed") {
    // pendingPhase === report.errorPhase here — it never got a checkmark, correctly.
    console.error(`\n✗ Failed during "${report.errorPhase}": ${report.errorMessage}`);
    process.exit(1);
  }

  // Reached a terminal non-failed state, so whatever phase was last entered did succeed.
  if (pendingPhase && COMPLETION_LABEL[pendingPhase]) console.log(`✓ ${COMPLETION_LABEL[pendingPhase]}`);

  console.log(
    `\n${report.status === "partial" ? "Partially updated" : "Updated"}: ${report.queriesCount} queries, ` +
      `${report.sourcesDiscovered} sources discovered, ${report.sourcesUsed} sources used.`,
  );
  console.log(`\n${code} intelligence ${report.status === "partial" ? "partially " : ""}updated successfully.`);
} catch (error) {
  console.error(`\n✗ ${(error as Error).message}`);
  process.exit(1);
}
