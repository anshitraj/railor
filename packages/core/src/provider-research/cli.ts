/**
 * Provider research CLI.
 *
 *   pnpm --filter @railor/core research-provider <slug> [<slug> ...]
 *   pnpm --filter @railor/core research-provider --all
 *
 * Deliberately offline-only: this reads paid APIs (Firecrawl + Gemini,
 * optionally Tavily) to produce review candidates. It never writes a live
 * capability row; the snapshot/diff/review-controlled worker does that.
 */
import "../../../database/src/dev-env.js";
import { eq } from "drizzle-orm";
import { getDbHandle, getDb, providers } from "@railor/database";
import { researchProvider, researchProviderFromEdgar } from "./ingest.js";
import { CURATED_TARGETS, ENTITY_ELIGIBILITY_TARGETS, discoverTargets, domainsFor } from "./targets.js";
import { NEW_PROVIDERS, registerProvider } from "./register.js";

async function targetsFor(slug: string, entityOnly: boolean): Promise<string[]> {
  const db = await getDb();
  const [provider] = await db.select().from(providers).where(eq(providers.slug, slug)).limit(1);
  if (!provider) return [];
  const domains = domainsFor(provider.websiteUrl, provider.docsUrl);

  if (entityOnly) {
    // Curated entity URLs are a starting point, but always supplemented by a
    // search: several hand-written paths turned out to be 404s that redirected
    // to marketing pages, which read as coverage rather than eligibility.
    const curated = ENTITY_ELIGIBILITY_TARGETS[slug] ?? [];
    const discovered = await discoverTargets(provider.name, domains, "entity");
    console.log(`  entity targets: ${curated.length} curated + ${discovered.length} discovered`);
    return [...new Set([...curated, ...discovered])];
  }

  // Entity-eligibility pages are folded into the normal pass too: the model
  // can only report an entity fact if a page stating one is in front of it.
  const curated = [...(CURATED_TARGETS[slug] ?? []), ...(ENTITY_ELIGIBILITY_TARGETS[slug] ?? [])];
  if (curated.length) return curated;

  console.log(`  no curated targets — discovering via Tavily on ${domains.join(", ") || "(no domains)"}`);
  return discoverTargets(provider.name, domains);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = true;
  const all = args.includes("--all");
  const entityOnly = args.includes("--entity");
  const edgarOnly = args.includes("--edgar");
  const slugs = args.filter((a) => !a.startsWith("--"));

  const db = await getDb();

  // --register only creates the provider rows; capabilities still come from a
  // normal research pass afterwards, so registration can be reviewed first.
  if (args.includes("--register")) {
    for (const spec of NEW_PROVIDERS) {
      try {
        const result = await registerProvider(spec);
        console.log(`${spec.slug.padEnd(16)} ${result.status}${result.description ? ` — ${result.description}` : ""}`);
      } catch (error) {
        console.log(`${spec.slug.padEnd(16)} FAILED: ${(error as Error).message.slice(0, 160)}`);
      }
    }
    await (await getDbHandle()).close();
    return;
  }

  let targets = slugs;
  if (all) {
    const rows = await db.select().from(providers).where(eq(providers.isDemo, false));
    targets = rows.map((r) => r.slug).sort();
  }
  if (targets.length === 0) {
    console.error("Usage: research-provider <slug> [...] | --all   [--dry-run]");
    process.exit(1);
  }

  for (const slug of targets) {
    console.log(`\n=== ${slug} ===`);
    try {
      if (edgarOnly) {
        const report = await researchProviderFromEdgar(slug, { dryRun });
        if (!report) {
          console.log("  no SEC filing found — not a public company, or no CIK match");
          continue;
        }
        console.log(`  filing source: 1/1 (candidate only; not published)`);
        const r = report.rowsCreated;
        console.log(`  created: caps=${r.capabilities} endpoints=${r.receivingEndpoints} fees=${r.fees} reqs=${r.requirements} products=${r.products}`);
        if (report.droppedForBadCitation) console.log(`  dropped for bad citation: ${report.droppedForBadCitation}`);
        continue;
      }

      const urls = await targetsFor(slug, entityOnly);
      if (urls.length === 0) {
        console.log("  no target URLs — skipped");
        continue;
      }
      const report = await researchProvider(slug, urls, { dryRun });
      console.log(`  scraped ${report.urlsScraped}/${report.urlsRequested} (candidate only; not published)`);
      if (report.extraction) {
        const e = report.extraction;
        console.log(`  EXTRACTED entityEligibility=${e.entityEligibility.length} corridors=${e.corridors.length} assets=${e.assets.length} fees=${e.fees.length} reqs=${e.requirements.length} products=${e.products.join(",")}`);
        for (const x of e.entityEligibility.slice(0, 10)) console.log(`    entity ${x.entityCountry} ${x.product ?? "-"} :: "${x.quote.slice(0, 80)}"`);
        for (const c of e.corridors.slice(0, 8)) console.log(`    corridor ${c.country}/${c.currency ?? "-"} ${c.product} ${c.stablecoinMode} :: "${c.quote.slice(0, 90)}"`);
        for (const a of e.assets.slice(0, 8)) console.log(`    asset ${a.symbol}${a.network ? `@${a.network}` : ""} ${a.product} :: "${a.quote.slice(0, 90)}"`);
        for (const f of e.fees.slice(0, 5)) console.log(`    fee ${f.product} ${f.percentBps ?? "-"}bps ${f.summary.slice(0, 60)} :: "${f.quote.slice(0, 70)}"`);
      }
      for (const f of report.scrapeFailures) console.log(`    ! ${f.url} — ${f.error.slice(0, 120)}`);
      const r = report.rowsCreated;
      console.log(
        `  published: caps=${r.capabilities} endpoints=${r.receivingEndpoints} fees=${r.fees} reqs=${r.requirements} products=${r.products}`,
      );
      if (report.droppedForBadCitation) console.log(`  dropped for bad citation: ${report.droppedForBadCitation}`);
      if (report.droppedInvalidRows) console.log(`  dropped for invalid fields: ${report.droppedInvalidRows}`);
      const c = report.catalog;
      if (c.countriesAdded.length) console.log(`  countries ADDED: ${c.countriesAdded.join(",")}`);
      if (c.currenciesAdded.length) console.log(`  currencies ADDED: ${c.currenciesAdded.join(",")}`);
      if (c.assetsAdded.length) console.log(`  assets ADDED (via CoinGecko): ${c.assetsAdded.join(",")}`);
      if (c.networksAdded.length) console.log(`  networks ADDED (via CoinGecko): ${c.networksAdded.join(",")}`);
      if (c.unknownAssets.length) console.log(`  unknown assets (not stored): ${c.unknownAssets.join(",")}`);
      if (c.unknownNetworks.length) console.log(`  unknown networks (not stored): ${c.unknownNetworks.join(",")}`);
      if (c.unknownCountries.length) console.log(`  unmappable countries: ${c.unknownCountries.join(",")}`);
      if (c.unknownCurrencies.length) console.log(`  unmappable currencies: ${c.unknownCurrencies.join(",")}`);
    } catch (error) {
      console.log(`  FAILED: ${(error as Error).message.slice(0, 300)}`);
    }
  }

  await (await getDbHandle()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
