import { CodeSample, StageBadge } from "@railor/ui";
import { Bullet, Bullets } from "../../../../components/docs/bullets";
import { DocsHeader } from "../../../../components/docs/docs-header";
import { getSession } from "../../../../lib/auth";
import { getOrgTestKey } from "../../../../lib/org";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const STATES: Array<[string, string]> = [
  ["requires_approval", "Your policy wants an independent approval first (Approvals in the app)."],
  ["ready", "Allowed by policy and routed. Nothing has been sent — call submit."],
  ["blocked", "Policy denied it, or no eligible provider can execute it. The reason is on the payment."],
  ["submitting", "Railor is calling the provider right now."],
  ["awaiting_funds", "The provider accepted it and is waiting for the source funds (deposit instructions on the payment)."],
  ["processing", "The provider has it and is moving the money."],
  ["completed", "The provider reports the payout settled."],
  ["failed", "Every provider tried said no — definitively. The last rejection is on the payment."],
  ["returned", "It settled and then came back (the beneficiary bank returned it)."],
  ["unknown", "A provider call timed out or errored ambiguously. Railor never re-sends this elsewhere; reconciliation asks the provider (replaying the same idempotency key) until it knows."],
  ["cancelled", "Cancelled before any provider had it."],
];

const PRICE_BASES: Array<[string, string]> = [
  ["exact", "A live quote from your own connected account (Wise, Airwallex) — the price you'd actually pay."],
  ["live_public", "A live quote anyone can get from the provider's API (Wise's public quote). Your account's price can differ."],
  ["published", "The provider's published fee schedule (PayZoll, Skydo), applied at the reference rate, with the date it was read and a link to it."],
  ["market_estimate", "Consumer prices Wise's comparison feed collected from other providers' public sites, dated. Opt in with include_market."],
];

const SCENARIOS: Array<[string, string]> = [
  [".13", "Rejected: insufficient funds — retryable, so routing falls back to the next provider"],
  [".66", "Rejected: compliance — never retried elsewhere"],
  [".55", "Accepted, awaiting funds, then processing, then completed"],
  [".77", "Completed, then returned by the beneficiary bank"],
  [".99", "Outcome unknown (simulated timeout), resolved by reconciliation"],
  ["other", "Processing, then completed about 20 seconds later"],
];

export default async function PaymentsDocs() {
  const session = await getSession();
  const key = session?.organization ? await getOrgTestKey(session.organization.id) : null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return (
    <>
      <DocsHeader eyebrow="Money movement" title="Payments" badge={<StageBadge stage="beta" />}>
        Railor sends payouts through the provider accounts <em>you</em> connect — Railor never holds funds. Every payment is evaluated against your active policy, routed across eligible providers, submitted with an idempotency key recorded before the call, and tracked to settlement by provider webhooks and reconciliation.
      </DocsHeader>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Test mode and live mode</h2>
        <Bullets>
          <Bullet>A <code>rail_test_…</code> key creates test payments; a <code>rail_live_…</code> key creates live ones. They never mix.</Bullet>
          <Bullet>Test payments run against a provider&apos;s <strong>sandbox</strong> API when you&apos;ve connected its sandbox, and against Railor&apos;s simulator otherwise.</Bullet>
          <Bullet>
            Live payments require all of: the deployment&apos;s live switch, your workspace approved for live by Railor (with per-payment and daily limits), a <strong>production</strong> connection, and a provider Railor has approved for live payouts after sandbox evidence.
          </Bullet>
        </Bullets>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Quickstart</h2>
        <CodeSample
          apiKey={key ?? undefined}
          variants={[
            {
              language: "curl",
              label: "cURL",
              code: `# 1. Save who you're paying (validated, encrypted, deduplicated)
curl ${base}/v1/beneficiaries \\
  -H "Authorization: Bearer RAILOR_API_KEY" -H "Content-Type: application/json" \\
  -d '{"holder_type":"business","holder_name":"Dubai Supplier LLC","country":"AE","currency":"AED",
       "method":"iban","details":{"iban":"AE070331234567890123456","bank_name":"Emirates Bank"}}'

# 2. Create the payment: policy check + route plan. Nothing is sent yet.
curl ${base}/v1/payments \\
  -H "Authorization: Bearer RAILOR_API_KEY" -H "Content-Type: application/json" \\
  -H "Idempotency-Key: invoice-2041" \\
  -d '{"beneficiary_id":"ben_…","intent":{"source_entity_country":"IN","source_asset":"USDC",
       "source_network":"base","destination_country":"AE","destination_currency":"AED","amount":1000}}'

# 3. Send it
curl -X POST ${base}/v1/payments/pay_…/submit -H "Authorization: Bearer RAILOR_API_KEY"`,
            },
            {
              language: "ts",
              label: "TypeScript",
              code: `import { Railor } from "@railor/sdk"

const railor = new Railor({ apiKey: "RAILOR_API_KEY", baseUrl: "${base}" })

const ben = await railor.beneficiaries.create({
  holderType: "business", holderName: "Dubai Supplier LLC", country: "AE", currency: "AED",
  method: "iban", details: { iban: "AE070331234567890123456", bankName: "Emirates Bank" },
})

const plan = await railor.routes.plan({ intent })          // optional: see the route first
const payment = await railor.payments.create(
  { beneficiaryId: ben.id, intent },
  { idempotencyKey: "invoice-2041" },
)
const sent = await railor.payments.submit(payment.id)
console.log(sent.status, sent.selected_provider)`,
            },
          ]}
          caption="Test keys only ever create test payments. Retrying a create with the same Idempotency-Key returns the original payment."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Payment states</h2>
        <dl className="flex flex-col divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white">
          {STATES.map(([state, meaning]) => (
            <div key={state} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[170px_1fr]">
              <dt className="font-mono text-[12.5px] font-semibold">{state}</dt>
              <dd className="text-[13px] text-[var(--color-muted)]">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Routing</h2>
        <p className="text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          Eligibility and your policy are gates — a provider that doesn&apos;t pass is excluded with its reason. The rest are scored on health 25 · reliability 25 · cost 20 · speed 15 · limits 10 · preference 5 (or the Cheapest / Fastest / Most reliable presets). A dimension with no real data drops out and lowers the reported confidence rather than being guessed. On a definitive rejection Railor tries the next provider; on an ambiguous one it never does. <code>POST /v1/routes</code> shows the plan without creating anything.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Price check</h2>
        <p className="text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          <code>POST /v1/prices</code> (and <strong>Price check</strong> in the app) answers “send X, how much arrives, through whom?”. Each row carries its <code>basis</code>, because the numbers are not equally strong:
        </p>
        <dl className="flex flex-col divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white">
          {PRICE_BASES.map(([basis, meaning]) => (
            <div key={basis} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[170px_1fr]">
              <dt className="font-mono text-[12.5px] font-semibold">{basis}</dt>
              <dd className="text-[13px] text-[var(--color-muted)]">{meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[13px] text-[var(--color-muted)]">
          Rows are ranked by <code>recipient_amount</code>. A quote missing a cost component (Airwallex&apos;s FX quote has no transfer fee in it) is marked <code>cost_complete: false</code> and listed after complete ones; market estimates are listed last and never counted as the best price.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Sandbox scenarios</h2>
        <p className="text-[14.5px] text-[var(--color-muted)]">In test mode, when a provider isn&apos;t connected in sandbox, Railor&apos;s simulator picks the outcome from the amount&apos;s cents:</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          {SCENARIOS.map(([cents, story]) => (
            <div key={cents} className="flex gap-3 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-[13px]">
              <dt className="w-12 shrink-0 font-mono font-semibold">{cents}</dt>
              <dd className="text-[var(--color-muted)]">{story}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Webhooks</h2>
        <p className="text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          Add an endpoint under Developers (or <code>POST /v1/webhook_endpoints</code>). Every event is signed; verify before trusting it:
        </p>
        <CodeSample
          variants={[
            {
              language: "ts",
              label: "Node.js",
              code: `import { createHmac, timingSafeEqual } from "node:crypto"

export function verifyRailor(secret: string, header: string, rawBody: string) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")))
  const t = Number(parts.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false   // stale → reject
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex")
  return expected.length === parts.v1?.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
}

// header: request.headers["railor-signature"]  →  "t=1790000000,v1=5f2…"`,
            },
          ]}
          caption="Events: payment.created, payment.requires_approval, payment.ready, payment.blocked, payment.submitted, payment.awaiting_funds, payment.processing, payment.completed, payment.failed, payment.returned, payment.cancelled, payment.unknown."
        />
      </section>
    </>
  );
}
