import Link from "next/link";
import { SectionLabel } from "@railor/ui";

export const metadata = { title: "Terms of Service" };

const SECTIONS: Array<[string, string[]]> = [
  [
    "What Railor is",
    [
      "Railor is an information service. It normalizes what financial-infrastructure providers publish — coverage, requirements, limits, pricing and status — and shows each claim with its source, verification time and confidence.",
      "Railor is not a payment service, money transmitter, wallet, exchange or financial adviser. No feature of Railor moves money. Decisions, quotes and simulations are advisory records; you remain responsible for any payment you make.",
    ],
  ],
  [
    "How to read what Railor shows",
    [
      "Information is provided as published by third parties and may be incomplete, out of date or wrong. Railor labels uncertain facts as “unknown” rather than guessing, but it cannot guarantee any provider will onboard you, support a corridor or honour a price.",
      "Providers remain solely responsible for their own KYC, KYB, sanctions and eligibility decisions. Readiness scores reflect published requirements, not an approval.",
      "Always confirm material facts with the provider before relying on them.",
    ],
  ],
  [
    "Your account and workspace",
    [
      "Workspace data — corridors, monitors, policies, decisions, readiness profiles and API keys — belongs to the organization, and access is controlled by its owners and admins.",
      "You are responsible for keeping API keys secret. Live keys are shown once and stored only as a hash; revoke any key you believe has leaked.",
      "Don't use Railor to attack, scrape or overload the service, to circumvent rate limits, or to misrepresent Railor's data as your own verified claims.",
    ],
  ],
  [
    "API and plans",
    [
      "API access is metered per workspace and per key. Requests beyond your plan's allowance are refused rather than silently billed.",
      "Beta and Coming-soon features are labelled as such and may change or be withdrawn.",
    ],
  ],
  [
    "Liability",
    [
      "To the extent the law allows, Railor is provided “as is”, without warranties of accuracy or fitness for a particular purpose, and is not liable for losses arising from reliance on third-party information shown in the service.",
    ],
  ],
];

export default function TermsPage() {
  return (
    <article className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <SectionLabel>Legal</SectionLabel>
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight">Terms of Service</h1>
        <p className="text-[14px] leading-relaxed text-[var(--color-muted)]">
          Plain-language terms describing how this Railor deployment works. The operator of each deployment should review them with counsel before offering it commercially.
        </p>
      </div>
      {SECTIONS.map(([title, paragraphs]) => (
        <section key={title} className="flex flex-col gap-2.5">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          {paragraphs.map((p) => (
            <p key={p.slice(0, 32)} className="text-[14.5px] leading-relaxed text-[var(--color-muted)]">
              {p}
            </p>
          ))}
        </section>
      ))}
      <p className="text-[13px] text-[var(--color-muted)]">
        See also the <Link href="/legal/privacy" className="font-semibold text-[var(--color-orange-deep)] underline underline-offset-2">Privacy Policy</Link> and{" "}
        <Link href="/company/trust" className="font-semibold text-[var(--color-orange-deep)] underline underline-offset-2">how Railor treats evidence</Link>.
      </p>
    </article>
  );
}
