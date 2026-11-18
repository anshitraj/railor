import { ArrowUpRight, BadgeCheck, Banknote, ClipboardList, FileText, Gauge, Globe2, Info, Landmark, Target, TriangleAlert } from "lucide-react";
import type { PriceRow } from "@railor/core";
import styles from "./price-check.module.css";

const summaries = {
  documented: { title: "Before you transfer", icon: ClipboardList },
  unconfirmed: { title: "Check with the provider", icon: Info },
  not_supported: { title: "Unavailable for this setup", icon: TriangleAlert },
};

export function ProviderRequirements({ assessment }: { assessment: PriceRow["profileAssessment"] }) {
  const status = assessment?.status ?? "unconfirmed";
  const { title, icon: SummaryIcon } = summaries[status];
  const topics = assessment ? [
    { label: "Identity checks", icon: BadgeCheck, tone: "green", details: assessment.verification },
    { label: "Fees", icon: Banknote, tone: "orange", details: [assessment.fees] },
    { label: "Transfer limits", icon: Gauge, tone: "orange", details: [assessment.limits] },
    { label: "Payout", icon: Landmark, tone: "green", details: assessment.settlement },
    { label: "Supported routes", icon: Globe2, tone: "neutral", details: [assessment.corridors] },
    { label: "Documents", icon: FileText, tone: "neutral", details: assessment.documents },
    { label: "Payment purpose", icon: Target, tone: "neutral", details: [assessment.purpose] },
  ] : [];

  return (
    <div className={styles.requirementsPanel}>
      <div className={styles.requirementsSummary} data-status={status}>
        <span className={styles.requirementSticker} aria-hidden="true"><SummaryIcon size={20} /></span>
        <div>
          <h3>{title}</h3>
          {assessment ? assessment.reasons.map((reason, index) => <p key={index}>{reason}</p>) : (
            <p>Ask the provider which requirements apply to your account and this transfer.</p>
          )}
        </div>
      </div>

      {assessment && <>
        <dl className={styles.requirements}>
          {topics.map(({ label, icon: Icon, tone, details }) => (
            <div className={styles.requirementTopic} key={label}>
              <dt>
                <span className={styles.requirementSticker} data-tone={tone} aria-hidden="true"><Icon size={16} /></span>
                {label}
              </dt>
              {details.filter(Boolean).map((detail, index) => <dd key={index}>{detail}</dd>)}
              {!details.some(Boolean) && <dd>Not provided.</dd>}
            </div>
          ))}
        </dl>

        <div className={styles.requirementsEvidence}>
          {assessment.sources.length > 0 && <ul aria-label="Provider sources">
            {assessment.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer noopener">
                  {source.label}<ArrowUpRight size={12} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>}
          <p><strong>{assessment.reviewedAt ? <>Rules reviewed <time dateTime={assessment.reviewedAt}>{assessment.reviewedAt}</time></> : "Review date unavailable"}.</strong> The provider still needs to confirm your eligibility.</p>
        </div>
      </>}
    </div>
  );
}
