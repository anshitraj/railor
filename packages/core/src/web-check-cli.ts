/**
 * pnpm --filter @railor/core web-check -- --from USD --to INR --profile personal --direction receive --country IN [--amount 1000] [--write]
 *
 * Builds the same claims a price check would for that request, runs each one
 * through the Google-grounded web check now (not in the background), and
 * prints verdicts with their quotes. Read-only unless --write, which stores
 * the results in web_fact_checks on whatever DATABASE_URL points at.
 */
import "../../database/src/dev-env.js";
import { CustomerContext } from "./customer-profiles.js";
import { comparePrices } from "./pricing.js";
import { runWebCheck, type WebCheckClaim } from "./web-check.js";
import { saveWebCheck } from "./web-check-store.js";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const from = (arg("from") ?? "USD").toUpperCase();
  const to = (arg("to") ?? "INR").toUpperCase();
  const amount = Number(arg("amount") ?? 1000);
  const profile = arg("profile");
  const context = profile
    ? CustomerContext.parse({ profile, country: (arg("country") ?? "IN").toUpperCase(), direction: arg("direction") ?? "receive", purpose: arg("purpose") ?? (profile === "personal" ? "personal" : "services") })
    : undefined;
  let claims: WebCheckClaim[] = [];
  await comparePrices({ sourceCurrency: from, destinationCurrency: to, amount, context }, {
    webChecks: async (c) => {
      claims = c;
      return { results: [], pending: new Set(), configured: true };
    },
  });
  console.log(`${claims.length} claim(s) for ${amount} ${from} → ${to}${context ? ` (${context.profile}, ${context.direction}, ${context.country})` : ""}\n`);
  const write = process.argv.includes("--write");
  for (const claim of claims) {
    const result = await runWebCheck(claim).catch((error: Error) => ({ verdict: "error", note: error.message }) as const);
    console.log(`■ ${claim.providerName} — ${claim.statement}`);
    console.log(`  ${result.verdict.toUpperCase()}${"official" in result ? (result.official ? " · official source" : result.sourceUrl ? " · third-party source" : "") : ""}`);
    if ("quote" in result && result.quote) console.log(`  “${result.quote}”\n  ${result.sourceUrl}`);
    if (result.note) console.log(`  note: ${result.note}`);
    if ("pages" in result) console.log(`  read ${result.pages.length} page(s): ${result.pages.map((p) => new URL(p.url).hostname).join(", ")}`);
    if (write && "key" in result) await saveWebCheck(result);
    console.log("");
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
