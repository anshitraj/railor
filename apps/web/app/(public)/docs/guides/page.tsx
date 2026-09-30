import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { Card, VerdictPill, cn, type Verdict } from "@railor/ui";
import { DocsHeader } from "../../../../components/docs/docs-header";

export const metadata = { title: "Guides" };

/** A step is a bold lead-in plus the rest of the sentence, so the copy reads unchanged. */
interface Step {
  lead: string;
  rest: string;
}

const EVALUATE_STEPS: Step[] = [
  {
    lead: "Set your entity jurisdiction",
    rest: "— this is where your company is incorporated, not where your users are.",
  },
  {
    lead: "Set the destination country and currency, then the rail",
    rest: "(local transfer behaves very differently from SWIFT).",
  },
  {
    lead: "Read the unavailable results first:",
    rest: "the reason tells you whether the block is structural or paperwork.",
  },
  {
    lead: "Record your KYB documents once;",
    rest: "“supported” becomes “supported for you”.",
  },
  {
    lead: "Monitor the corridor",
    rest: "so a coverage change reaches you before your integration does.",
  },
];

const VERDICTS: Array<{ verdict: Verdict; text: string }> = [
  { verdict: "supported", text: "means every dimension of your query has a supporting source." },
  { verdict: "additional_requirements", text: "means one dimension is conditional — the reason names it." },
  { verdict: "unavailable", text: "always carries a reason and, where it exists, what would change it." },
  { verdict: "unknown", text: "means Railor found no reliable source. It is not a soft no." },
];

export default function GuidesPage() {
  return (
    <>
      <DocsHeader eyebrow="Getting started" title="Guides">
        Two short reads before your first integration: how to evaluate a corridor, and how to read
        what Railor tells you.
      </DocsHeader>

      <Card className="flex flex-col gap-7 p-6 sm:p-8">
        <GuideHeader
          index="01"
          meta="5 steps"
          id="evaluate-a-corridor"
          toc="Evaluate a corridor"
          title="Evaluate a corridor before you commit to a provider"
          body="The mistake is checking coverage first. Entity eligibility kills more integrations than coverage does, so check who can onboard you before you check where they can pay."
        />
        <Timeline steps={EVALUATE_STEPS} />
      </Card>

      <Card className="flex flex-col gap-7 p-6 sm:p-8">
        <GuideHeader
          index="02"
          meta="4 verdicts"
          id="read-a-verdict"
          toc="Read a verdict"
          title="Read a Railor verdict properly"
          body="A verdict is a claim about published information, with a timestamp. Treat confidence and freshness as part of the answer."
        />

        <dl className="flex flex-col divide-y divide-[var(--color-line)] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
          {VERDICTS.map(({ verdict, text }) => (
            <div
              key={verdict}
              className="grid gap-2 px-5 py-4 sm:grid-cols-[10.75rem_minmax(0,1fr)] sm:items-center sm:gap-4"
            >
              <dt>
                <VerdictPill verdict={verdict} />
              </dt>
              <dd className="text-pretty text-[14.5px] leading-relaxed text-[var(--color-ink-soft)]">
                {text}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4 sm:flex-row sm:gap-4 sm:p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-lavender)] text-[var(--color-orange-deep)]">
            <Clock size={18} strokeWidth={2} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-pretty text-[14.5px] leading-relaxed text-[var(--color-ink-soft)]">
              <strong className="font-semibold text-[var(--color-ink)]">Check last-verified:</strong>{" "}
              a 0.95 confidence checked six months ago is not the same claim as one checked this
              morning.
            </p>
            {/* Illustration of the sentence above; the sentence carries the meaning. */}
            <div aria-hidden className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-2.5">
              <Claim tone="warn" when="checked six months ago" />
              <span className="hidden font-mono text-[13px] text-[var(--color-faint)] sm:inline">≠</span>
              <Claim tone="ok" when="checked this morning" />
            </div>
          </div>
        </div>
      </Card>

      <section className="product-dark flex flex-wrap items-center gap-4 p-6 sm:p-8">
        {/* basis makes the button wrap under the copy on phones instead of squeezing it */}
        <div className="relative z-10 flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
          <p className="font-display text-[22px] font-semibold leading-tight">Try it on a real route.</p>
          <p className="max-w-[44ch] text-pretty text-[13.5px] leading-relaxed text-white/65">
            Put both guides to work: search a corridor, then read the verdicts yourself.
          </p>
        </div>
        <Link
          href="/login?intent=start"
          className="relative z-10 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-bold text-[#22211f] transition hover:bg-[#ffad8c]"
        >
          Run your first corridor <ArrowRight size={15} aria-hidden />
        </Link>
      </section>
    </>
  );
}

function GuideHeader({
  index,
  meta,
  id,
  toc,
  title,
  body,
}: {
  index: string;
  meta: string;
  id: string;
  toc: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[12px] font-semibold tracking-[0.08em] text-[var(--color-orange-deep)]">
          {index}
        </span>
        <span aria-hidden className="h-px flex-1 bg-[var(--color-line)]" />
        <span className="text-[12px] text-[var(--color-muted)]">{meta}</span>
      </div>
      <h2
        id={id}
        data-toc={toc}
        className="text-balance font-display text-[clamp(1.4rem,2.6vw,1.75rem)] font-semibold leading-[1.15]"
      >
        {title}
      </h2>
      <p className="text-pretty text-[15px] leading-relaxed text-[var(--color-muted)]">{body}</p>
    </div>
  );
}

/** Steps as stops on a route: the last node is the destination. */
function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={step.lead} className={cn("relative flex gap-4", !last && "pb-6")}>
            {last ? null : (
              <span
                aria-hidden
                className="absolute bottom-1 left-4 top-9 w-px -translate-x-1/2 bg-[var(--color-line-strong)]"
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-[12px] font-semibold",
                last
                  ? "border-transparent bg-[var(--color-orange)] text-white shadow-[0_8px_18px_-8px_var(--color-orange)]"
                  : "border-[var(--color-line-strong)] bg-white text-[var(--color-ink-soft)]",
              )}
            >
              {i + 1}
            </span>
            <p className="min-w-0 pt-1 text-[14.5px] leading-relaxed text-[var(--color-ink-soft)]">
              <strong className="font-semibold text-[var(--color-ink)]">{step.lead}</strong> {step.rest}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function Claim({ tone, when }: { tone: "ok" | "warn"; when: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-medium",
        tone === "ok"
          ? "bg-[var(--color-ok-bg)] text-[var(--color-ok)]"
          : "bg-[var(--color-warn-bg)] text-[var(--color-warn)]",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "ok" ? "bg-[var(--color-ok)]" : "bg-[var(--color-warn)]",
        )}
      />
      <span className="tabular">0.95</span>
      <span aria-hidden>·</span>
      {when}
    </span>
  );
}
