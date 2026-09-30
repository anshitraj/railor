"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, discoveryJobs, evidence, getDb, providerCandidates, providers, sourceDocuments } from "@railor/database";
import { invalidateReadCache } from "@railor/core";
import { requireSession } from "../../lib/auth";

/**
 * Web discovery controls. Queuing only records intent — the Python worker
 * (`railor_worker.cli discover-queue`) does the searching and verification.
 * Approving a candidate registers the company with the evidence it was
 * verified against; it publishes no capability.
 */
async function requireAdmin() {
  const session = await requireSession();
  if (!session.user.isAdmin) throw new Error("FORBIDDEN");
  return session;
}

type Result = { ok: true; detail?: string } | { ok: false; error: string };

async function guarded(work: () => Promise<string | void>): Promise<Result> {
  try {
    const detail = await work();
    invalidateReadCache();
    revalidatePath("/admin/discovery");
    return { ok: true, detail: detail ?? undefined };
  } catch (error) {
    return { ok: false, error: error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid input." : error instanceof Error ? error.message : "Action failed." };
  }
}

const Code2 = z.string().trim().regex(/^[A-Za-z]{2}$/, "Pick a country.").transform((v) => v.toUpperCase());
const Code3 = z.string().trim().regex(/^[A-Za-z]{3,5}$/, "Pick a currency.").transform((v) => v.toUpperCase());

const JobInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("corridor"), entity_country: Code2, destination_country: Code2, destination_currency: Code3, source_asset: Code3.optional() }),
  z.object({ kind: z.literal("provider"), provider: z.string().trim().regex(/^[a-z0-9-]{1,64}$/) }),
  z.object({
    kind: z.literal("company"),
    name: z.string().trim().min(2).max(80),
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => v.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]!)
      .pipe(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter the company's domain, e.g. adyen.com")),
  }),
]);

export async function queueDiscoveryAction(raw: unknown) {
  return guarded(async () => {
    const session = await requireAdmin();
    const input = JobInput.parse(raw);
    const { kind, ...query } = input;
    const db = await getDb();
    const running = await db.select({ id: discoveryJobs.id }).from(discoveryJobs).where(eq(discoveryJobs.status, "queued"));
    if (running.length >= 25) throw new Error("25 jobs are already queued — let the worker catch up.");
    const [job] = await db.insert(discoveryJobs).values({ kind, query, requestedBy: session.user.id }).returning({ id: discoveryJobs.id });
    await db.insert(auditLogs).values({ actorId: session.user.id, action: "discovery.queued", target: job!.id, metadata: input });
    return "Queued — the worker picks it up on its next run.";
  });
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "provider";

export async function reviewCandidateAction(id: string, decision: "approve" | "reject", note: string) {
  return guarded(async () => {
    const session = await requireAdmin();
    const candidateId = z.string().uuid().parse(id);
    const reason = z.string().trim().max(500).parse(note);
    const db = await getDb();
    const [candidate] = await db.select().from(providerCandidates).where(eq(providerCandidates.id, candidateId)).limit(1);
    if (!candidate) throw new Error("Candidate not found.");
    if (candidate.status !== "pending") throw new Error(`Already ${candidate.status}.`);

    if (decision === "reject") {
      await db.update(providerCandidates).set({ status: "rejected", reviewedBy: session.user.id, reviewedAt: new Date(), reviewNote: reason || null }).where(eq(providerCandidates.id, candidate.id));
      await db.insert(auditLogs).values({ actorId: session.user.id, action: "discovery.candidate_rejected", target: candidate.domain, metadata: { note: reason } });
      return "Rejected.";
    }

    if (!candidate.evidence.some((e) => e.official)) {
      throw new Error("No evidence from the company's own site yet — approve only what its own pages confirm.");
    }
    // Registering is a transaction: provider, its official pages for the crawler, and the verified quotes.
    return db.transaction(async (tx) => {
      let slug = slugify(candidate.name);
      const [taken] = await tx.select({ id: providers.id }).from(providers).where(eq(providers.slug, slug)).limit(1);
      if (taken) slug = `${slug}-${createHash("sha256").update(candidate.domain).digest("hex").slice(0, 4)}`;
      const [provider] = await tx
        .insert(providers)
        .values({
          slug,
          name: candidate.name,
          isDemo: false,
          category: "Discovered provider",
          // Only what the company's own pages say, quoted — never a written summary.
          description: candidate.evidence.find((e) => e.official)!.quote.slice(0, 500),
          websiteUrl: candidate.websiteUrl,
          lastVerifiedAt: new Date(),
        })
        .returning({ id: providers.id });
      for (const item of candidate.evidence) {
        const [doc] = await tx
          .insert(sourceDocuments)
          .values({ providerId: provider!.id, url: item.url, title: (item.title || item.url).slice(0, 300), sourceType: item.official ? (item.kind === "pricing" ? "pricing" : "official_docs") : "third_party", enabled: item.official, crawlFrequencyHours: 72 })
          .onConflictDoNothing()
          .returning({ id: sourceDocuments.id });
        const docId = doc?.id ?? (await tx.select({ id: sourceDocuments.id }).from(sourceDocuments).where(and(eq(sourceDocuments.providerId, provider!.id), eq(sourceDocuments.url, item.url))).limit(1))[0]?.id;
        await tx.insert(evidence).values({
          providerId: provider!.id,
          sourceDocumentId: docId,
          sourceUrl: item.url,
          sourceTitle: (item.title || item.url).slice(0, 300),
          sourceType: item.official ? (item.kind === "pricing" ? "pricing" : "official_docs") : "third_party",
          verificationType: item.official ? "provider_reported" : "railor_observed",
          retrievedAt: new Date(),
          lastVerifiedAt: new Date(),
          confidence: item.official ? "0.70" : "0.45",
          rawExcerpt: item.quote.slice(0, 2000),
          rawHash: item.hash,
        });
      }
      await tx.update(providerCandidates).set({ status: "approved", providerId: provider!.id, reviewedBy: session.user.id, reviewedAt: new Date(), reviewNote: reason || null }).where(eq(providerCandidates.id, candidate.id));
      await tx.insert(auditLogs).values({ actorId: session.user.id, action: "discovery.candidate_approved", target: candidate.domain, metadata: { slug, evidence: candidate.evidence.length, note: reason } });
      return `Registered as ${slug} with ${candidate.evidence.length} verified quote${candidate.evidence.length === 1 ? "" : "s"}. Its official pages join the crawl.`;
    });
  });
}
