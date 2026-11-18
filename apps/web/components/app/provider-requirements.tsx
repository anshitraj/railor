import { ArrowUpRight, Banknote, ClipboardList, Clock3, FileBadge, FileText, Gauge, Globe2, IdCard, Info, Landmark, Percent, ReceiptText, Target, TriangleAlert } from "lucide-react";
import type { PriceRow } from "@railor/core";
import styles from "./price-check.module.css";

const summaries = {
  documented: { title: "Before you transfer", icon: ClipboardList },
  unconfirmed: { title: "Check with the provider", icon: Info },
  not_supported: { title: "Unavailable for this setup", icon: TriangleAlert },
};

export function ProviderRequirements({ assessment, feeTax, receipt, delivery }: {
  assessment: PriceRow["profileAssessment"]; feeTax?: string; receipt?: string | null; delivery?: string | null;
}) {
  const status = assessment?.status ?? "unconfirmed";
  const { title, icon: SummaryIcon } = summaries[status];
  const payment = assessment?.payment;
  const receiptDetail = payment?.receipt?.detail ?? receipt;
  const timing = payment?.delivery?.detail ?? delivery;
  const tax = payment?.feeTax?.detail ?? feeTax;
  const topics = [
    { label: "KYC documents", icon: IdCard, tone: "green", details: assessment?.verification, emphasis: true },
    { label: "Invoice and payment documents", icon: FileText, tone: "neutral", details: assessment?.documents },
    { label: "Remittance proof", icon: FileBadge, tone: "green", details: [receiptDetail], source: payment?.receipt },
    { label: "Delivery and settlement", icon: Clock3, tone: "orange", details: [timing], source: payment?.delivery },
    { label: "Tax on provider fees", icon: Percent, tone: "orange", details: [tax], source: payment?.feeTax },
    { label: "Export GST and income tax", icon: ReceiptText, tone: "green", details: [payment?.exportTax?.detail], source: payment?.exportTax },
    { label: "Provider fees", icon: Banknote, tone: "orange", details: assessment ? [assessment.fees] : undefined },
    { label: "Transfer limits", icon: Gauge, tone: "neutral", details: assessment ? [assessment.limits] : undefined },
    { label: "Payout account", icon: Landmark, tone: "green", details: assessment?.settlement },
    { label: "Supported routes", icon: Globe2, tone: "neutral", details: assessment ? [assessment.corridors] : undefined },
    { label: "Payment purpose", icon: Target, tone: "neutral", details: assessment ? [assessment.purpose] : undefined },
  ].filter(topic => topic.details?.some(Boolean));
  const sources = Array.from(new Map(assessment?.sources.map(source => [source.url, source]) ?? []).values());

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

      {topics.length > 0 && (
        <dl className={styles.requirements}>
          {topics.map(({ label, icon: Icon, tone, details, source, emphasis }) => (
            <div className={styles.requirementTopic} data-emphasis={emphasis || undefined} key={label}>
              <dt>
                <span className={styles.requirementSticker} data-tone={tone} aria-hidden="true"><Icon size={16} /></span>
                {label}
              </dt>
              {details?.filter(Boolean).map((detail, index) => <dd key={index}>{detail}</dd>)}
              {source && <dd><a className={styles.requirementSource} href={source.url} target="_blank" rel="noreferrer noopener" aria-label={`Source for ${label}`}>Source <ArrowUpRight size={11} aria-hidden /></a></dd>}
            </div>
          ))}
        </dl>
      )}

      {assessment && (
        <div className={styles.requirementsEvidence}>
          {sources.length > 0 && <ul aria-label="Provider sources">
            {sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer noopener">
                  {source.label}<ArrowUpRight size={12} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>}
          <p><strong>{assessment.reviewedAt ? <>Rules reviewed <time dateTime={assessment.reviewedAt}>{assessment.reviewedAt}</time></> : "Review date unavailable"}.</strong> The provider still needs to confirm your eligibility.</p>
        </div>
      )}
    </div>
  );
}
