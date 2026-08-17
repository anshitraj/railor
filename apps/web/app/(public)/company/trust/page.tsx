import { Card, SectionLabel } from "@railor/ui";

export const metadata = { title: "Trust" };

export default function TrustPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <SectionLabel>Trust</SectionLabel>
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight">
          How Railor handles claims, sources and your data.
        </h1>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[18px] font-semibold">Where claims come from</h2>
        <p className="text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          Railor reads published provider material — documentation, help centres, pricing pages,
          status pages, official announcements and public APIs — and normalizes it into a capability
          graph. Sources are fetched politely: robots policies and site terms are respected, rate
          limits are honoured, authentication boundaries are never crossed, and protections such as
          CAPTCHAs are never bypassed.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[18px] font-semibold">What a claim carries</h2>
        <p className="text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          Every published capability points at an evidence record: source URL, source type, the time
          it was retrieved, the time it was last verified, an excerpt, and a confidence score.
          Confidence starts from the source type — an official API outranks a third-party blog — and
          decays with age, so a stale “supported” cannot outrank a fresh check.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[18px] font-semibold">What Railor will not do</h2>
        <ul className="flex flex-col gap-2 text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          <li>• Infer a capability that no source states, or present a model&apos;s guess as verified.</li>
          <li>• Invent pricing, limits or coverage. Unpublished means “not published”, not zero.</li>
          <li>• Silently pick a winner when two sources conflict — both are shown and reviewed.</li>
          <li>• Claim to replace a regulated provider&apos;s KYC/KYB obligations.</li>
          <li>• Publish adoption metrics it has not measured.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[18px] font-semibold">Your workspace</h2>
        <p className="text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          Corridors, monitors, readiness answers and API keys belong to your organization, not to an
          individual account. Authorization is enforced server-side on every route. API keys are
          stored as hashes; a live key is displayed once at creation and never again.
        </p>
      </section>

      <Card className="flex flex-col gap-2 bg-[var(--color-lavender)] p-6">
        <p className="text-[15px] font-medium text-[var(--color-purple-deep)]">
          Demonstration dataset
        </p>
        <p className="text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
          This deployment runs on clearly-labelled fictional providers. Nothing shown describes a
          real financial company, and no real company&apos;s documentation is reproduced here.
        </p>
      </Card>
    </div>
  );
}
