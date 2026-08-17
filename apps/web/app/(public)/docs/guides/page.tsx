import Link from "next/link";
import { Card, SectionLabel } from "@railor/ui";

export const metadata = { title: "Guides" };

const GUIDES: Array<{ title: string; body: string; steps: string[] }> = [
  {
    title: "Evaluate a corridor before you commit to a provider",
    body: "The mistake is checking coverage first. Entity eligibility kills more integrations than coverage does, so check who can onboard you before you check where they can pay.",
    steps: [
      "Set your entity jurisdiction — this is where your company is incorporated, not where your users are.",
      "Set the destination country and currency, then the rail (local transfer behaves very differently from SWIFT).",
      "Read the unavailable results first: the reason tells you whether the block is structural or paperwork.",
      "Record your KYB documents once; “supported” becomes “supported for you”.",
      "Monitor the corridor so a coverage change reaches you before your integration does.",
    ],
  },
  {
    title: "Read a Railor verdict properly",
    body: "A verdict is a claim about published information, with a timestamp. Treat confidence and freshness as part of the answer.",
    steps: [
      "Supported means every dimension of your query has a supporting source.",
      "Additional requirements means one dimension is conditional — the reason names it.",
      "Unavailable always carries a reason and, where it exists, what would change it.",
      "Unknown means Railor found no reliable source. It is not a soft no.",
      "Check last-verified: a 0.95 confidence checked six months ago is not the same claim as one checked this morning.",
    ],
  },
];

export default function GuidesPage() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionLabel>Getting started</SectionLabel>
        <h1 className="text-[32px] font-semibold tracking-tight">Guides</h1>
      </div>

      {GUIDES.map((guide) => (
        <Card key={guide.title} className="flex flex-col gap-3 p-5">
          <h2 className="text-[18px] font-semibold">{guide.title}</h2>
          <p className="text-[14px] leading-relaxed text-[var(--color-muted)]">{guide.body}</p>
          <ol className="flex flex-col gap-1.5">
            {guide.steps.map((step, i) => (
              <li key={step} className="flex gap-2 text-[14px] text-[var(--color-ink-soft)]">
                <span className="tabular text-[var(--color-faint)]">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </Card>
      ))}

      <Link href="/login?intent=start" className="text-[14px] font-medium text-[var(--color-purple)]">
        Run your first corridor →
      </Link>
    </>
  );
}
