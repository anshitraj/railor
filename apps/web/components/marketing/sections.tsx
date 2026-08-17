"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  Button,
  Card,
  CodeSample,
  Freshness,
  SectionLabel,
  StageBadge,
  VerdictPill,
} from "@railor/ui";
import { RailorMark } from "./nav";

const fade = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
};

export function ProblemSection() {
  const questions = [
    "Who supports UAE cards?",
    "Can this provider onboard an Indian company?",
    "Who supports USDC → NGN?",
    "Which provider handles GCC businesses?",
    "Does anyone do AED local rails?",
    "Who accepts Base deposits?",
  ];

  return (
    <motion.section {...fade} className="mx-auto w-[min(1180px,calc(100%-2rem))] py-24">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div className="flex flex-col gap-4">
          <SectionLabel>The real problem</SectionLabel>
          <h2 className="text-[clamp(28px,4vw,44px)] font-semibold leading-[1.08]">
            Financial infrastructure shouldn&apos;t live in{" "}
            <span className="text-[var(--color-purple)]">spreadsheets and Discord threads</span>.
          </h2>
          <p className="max-w-lg text-[15px] leading-relaxed text-[var(--color-muted)]">
            The same questions get asked every week, answered from memory, and discovered to be
            wrong during implementation. Railor turns those questions into structured, sourced,
            monitored answers.
          </p>
        </div>

        <div className="relative flex flex-wrap gap-2 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-white p-6">
          {questions.map((q, i) => (
            <motion.span
              key={q}
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07, duration: 0.35 }}
              className="rounded-full border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-1.5 text-[13px] text-[var(--color-ink-soft)]"
            >
              "{q}"
            </motion.span>
          ))}
          <div className="mt-4 flex w-full items-center gap-3 rounded-[var(--radius-card)] bg-[var(--color-lavender)] p-4">
            <RailorMark size={26} />
            <p className="text-[13.5px] text-[var(--color-ink-soft)]">
              One normalized capability graph, one answer, with the source attached.
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export function CapabilityGraphSection() {
  const layers = [
    { label: "Provider", hint: "15 mapped in this dataset" },
    { label: "Countries", hint: "entity + customer jurisdictions" },
    { label: "Entities", hint: "who can actually onboard" },
    { label: "Assets", hint: "USDC, USDT, EURC, PYUSD" },
    { label: "Networks", hint: "Base, Solana, Tron, EVM" },
    { label: "Products", hint: "ramps, payouts, cards, accounts" },
    { label: "Requirements", hint: "normalized KYB vocabulary" },
    { label: "Limits", hint: "minimums, maximums, monthly caps" },
  ];

  return (
    <motion.section {...fade} className="mx-auto w-[min(1180px,calc(100%-2rem))] py-24">
      <div className="flex flex-col gap-3">
        <SectionLabel>Capability graph</SectionLabel>
        <h2 className="max-w-2xl text-[clamp(28px,4vw,44px)] font-semibold leading-[1.08]">
          One normalized view of fragmented financial infrastructure.
        </h2>
      </div>

      <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {layers.map((layer, i) => (
          <motion.div
            key={layer.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05, duration: 0.35 }}
          >
            <Card interactive className="flex h-full flex-col gap-1 p-4">
              <span className="tabular text-[11px] text-[var(--color-faint)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[15px] font-medium">{layer.label}</span>
              <span className="text-[12.5px] text-[var(--color-muted)]">{layer.hint}</span>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

export function EvidenceSection({ sampleVerifiedAt }: { sampleVerifiedAt: string | null }) {
  return (
    <motion.section {...fade} className="mx-auto w-[min(1180px,calc(100%-2rem))] py-24">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div className="flex flex-col gap-4">
          <SectionLabel>Evidence</SectionLabel>
          <h2 className="text-[clamp(28px,4vw,44px)] font-semibold leading-[1.08]">
            Every answer should be <span className="text-[var(--color-purple)]">verifiable</span>.
          </h2>
          <p className="max-w-lg text-[15px] leading-relaxed text-[var(--color-muted)]">
            Each claim carries its source, when it was retrieved, when it was last verified, and a
            confidence score that decays with age. When two sources disagree, Railor shows both
            instead of picking the one that sounds better.
          </p>
        </div>

        <Card className="flex flex-col gap-4 p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium">UAE business onboarding</span>
            <VerdictPill verdict="supported" />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                Source
              </dt>
              <dd className="text-[var(--color-ink-soft)]">Provider documentation</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                Confidence
              </dt>
              <dd className="text-[var(--color-ink-soft)]">0.95 · High</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                Last verified
              </dt>
              <dd>
                <Freshness date={sampleVerifiedAt} prefix="" />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                Derivation
              </dt>
              <dd className="text-[var(--color-ink-soft)]">Source (not inferred)</dd>
            </div>
          </dl>
          <Link href="/changes" className="text-[13px] font-medium text-[var(--color-purple)]">
            View evidence →
          </Link>
        </Card>
      </div>
    </motion.section>
  );
}

export function ChangeSection({
  changes,
}: {
  changes: Array<{ provider: string; summary: string; detectedAt: string; kind: string }>;
}) {
  return (
    <motion.section {...fade} className="mx-auto w-[min(1180px,calc(100%-2rem))] py-24">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-4">
          <SectionLabel>Change monitoring</SectionLabel>
          <h2 className="text-[clamp(28px,4vw,44px)] font-semibold leading-[1.08]">
            Know before your integrations break.
          </h2>
          <p className="max-w-lg text-[15px] leading-relaxed text-[var(--color-muted)]">
            Railor snapshots provider sources, diffs the normalized values, and raises a change
            event with the evidence attached. Watch a provider, a corridor, a country or an asset.
          </p>
          <div>
            <Link href="/login?intent=start">
              <Button>Monitor my rails</Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {changes.map((change) => (
            <Card key={change.summary} interactive className="flex flex-col gap-1.5 p-4">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--color-lavender)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-purple)]">
                  {change.kind.replace(/_/g, " ")}
                </span>
                <span className="text-[13px] font-medium">{change.provider}</span>
                <span className="flex-1" />
                <Freshness date={change.detectedAt} prefix="Detected" />
              </div>
              <p className="text-[13.5px] leading-snug text-[var(--color-ink-soft)]">
                {change.summary}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

export function DeveloperSection() {
  return (
    <motion.section {...fade} className="mx-auto w-[min(1180px,calc(100%-2rem))] py-24">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center">
        <div className="flex flex-col gap-4">
          <SectionLabel>Developer infrastructure</SectionLabel>
          <h2 className="text-[clamp(28px,4vw,44px)] font-semibold leading-[1.08]">
            Build against verified infrastructure data instead of spreadsheets.
          </h2>
          <p className="max-w-lg text-[15px] leading-relaxed text-[var(--color-muted)]">
            The screens you just used are thin clients over these endpoints. A test key exists the
            moment your workspace does, and the docs render with it.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "REST", stage: "beta" as const },
              { label: "TypeScript", stage: "beta" as const },
              { label: "Python", stage: "beta" as const },
              { label: "MCP", stage: "beta" as const },
              { label: "CLI", stage: "soon" as const },
              { label: "Webhooks", stage: "soon" as const },
            ].map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-[13px]"
              >
                {item.label}
                <StageBadge stage={item.stage} />
              </span>
            ))}
          </div>
        </div>

        <CodeSample
          variants={[
            {
              language: "ts",
              label: "TypeScript",
              code: `import { Railor } from "@railor/sdk"

const railor = new Railor({ apiKey: "RAILOR_API_KEY" })

const routes = await railor.corridors.search({
  entityCountry: "IN",
  destinationCountry: "AE",
  asset: "USDC",
  destinationCurrency: "AED",
  customerType: "business"
})

routes.results[0]
// {
//   provider: { slug: "ironwood-settlement", name: "Ironwood Settlement" },
//   eligibility: "supported",
//   confidence: 0.95,
//   last_verified_at: "2026-08-17T10:24:00Z",
//   evidence: [{ type: "official_docs", url: """ }]
// }`,
            },
            {
              language: "curl",
              label: "cURL",
              code: `curl https://api.railor.dev/v1/corridors/search \\
  -H "Authorization: Bearer RAILOR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "entity_country": "IN",
    "destination_country": "AE",
    "asset": "USDC",
    "destination_currency": "AED",
    "customer_type": "business"
  }'`,
            },
            {
              language: "python",
              label: "Python",
              code: `from railor import Railor

railor = Railor(api_key="RAILOR_API_KEY")

routes = railor.corridors.search(
    entity_country="IN",
    destination_country="AE",
    asset="USDC",
    destination_currency="AED",
    customer_type="business",
)`,
            },
          ]}
          caption="Every response carries data, evidence, confidence and last_verified_at."
        />
      </div>
    </motion.section>
  );
}

export function VisionSection() {
  const stages = [
    { label: "Discover", hint: "which infrastructure works", stage: "live" as const },
    { label: "Verify", hint: "with sources and confidence", stage: "live" as const },
    { label: "Monitor", hint: "when anything changes", stage: "live" as const },
    { label: "Connect", hint: "the providers you already use", stage: "soon" as const },
    { label: "Route", hint: "across eligible infrastructure", stage: "soon" as const },
  ];

  return (
    <motion.section {...fade} className="mx-auto w-[min(1180px,calc(100%-2rem))] py-24">
      <div className="flex flex-col gap-3">
        <SectionLabel>Where this goes</SectionLabel>
        <h2 className="max-w-2xl text-[clamp(28px,4vw,44px)] font-semibold leading-[1.08]">
          Railor maps financial infrastructure today and becomes the programmatic interface
          developers rely on tomorrow.
        </h2>
      </div>

      <div className="mt-10 grid gap-3 md:grid-cols-5">
        {stages.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
          >
            <Card className="flex h-full flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium">{s.label}</span>
                <StageBadge stage={s.stage} />
              </div>
              <span className="text-[12.5px] text-[var(--color-muted)]">{s.hint}</span>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

export function CtaSection() {
  return (
    <motion.section {...fade} className="mx-auto w-[min(1180px,calc(100%-2rem))] pb-24">
      <div className="relative overflow-hidden rounded-[var(--radius-panel)] bg-[linear-gradient(135deg,var(--color-purple),var(--color-purple-deep))] p-10 text-white">
        <div className="rail-grid pointer-events-none absolute inset-0 opacity-[0.12]" aria-hidden />
        <div className="relative flex flex-col gap-4">
          <h2 className="max-w-xl text-[clamp(28px,4vw,44px)] font-semibold leading-[1.05]">
            Stop guessing which rail works.
          </h2>
          <p className="max-w-lg text-[15px] text-white/75">
            Ask one question, get every provider that could serve it, with the reason and the source
            attached - then watch it for changes.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/login?intent=start">
              <Button className="bg-white text-[var(--color-purple-deep)] hover:bg-white/90">
                Explore Railor
              </Button>
            </Link>
            <Link href="/docs">
              <Button variant="ghost" className="text-white hover:bg-white/10">
                Read the docs
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

