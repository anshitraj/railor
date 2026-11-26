import { ArrowUpRight, Banknote, ClipboardList, Clock3, FileBadge, FileText, Gauge, Globe2, IdCard, Info, Landmark, Percent, ReceiptText, Target, Timer, TriangleAlert } from "lucide-react";
import type { PriceRow } from "@railor/core";
import { isPlaceholder, type ProviderFacts } from "../../lib/provider-facts";
import styles from "./price-check.module.css";

const summaries = {
  documented: { title: "Before you transfer", icon: ClipboardList },
  unconfirmed: { title: "Check with the provider", icon: Info },
  not_supported: { title: "Unavailable for this setup", icon: TriangleAlert },
};

/** How long the provider says approval takes, or an honest "not published" so no one plans around a guess. */
function KycTime({ kyc, provider }: { kyc: NonNullable<PriceRow["profileAssessment"]>["kyc"]; provider?: string }) {
  const name = provider ?? "This provider";
  const time = kyc?.approvalTime;
  return (
    <div className={styles.requirementTopic} data-emphasis="true">
      <dt>
        <span className={styles.requirementSticker} data-tone="green" aria-hidden="true"><Timer size={16} /></span>
        KYC approval time
      </dt>
      {time ? (
        <>
          <dd><strong className={styles.kycTime}>{time.label}</strong></dd>
          <dd>{kyc.appliesTo === "sender" ? "Your sender’s check with this provider, not yours. " : ""}{time.detail}</dd>
        </>
      ) : kyc ? (
        <dd>{name} doesn’t publish how long approval takes for this account. Ask them before you rely on a start date.</dd>
      ) : (
        <dd>Railor hasn’t found a published approval time for {name === "This provider" ? "this provider" : name} yet. Ask them before you rely on a start date.</dd>
      )}
    </div>
  );
}

export function ProviderRequirements({ assessment, feeTax, receipt, delivery, provider, facts }: {
  assessment: PriceRow["profileAssessment"]; feeTax?: string; receipt?: string | null; delivery?: string | null; provider?: string; facts?: ProviderFacts | null;
}) {
  const status = assessment?.status ?? "unconfirmed";
  const { title, icon: SummaryIcon } = summaries[status];
  const payment = assessment?.payment;
  const receiptDetail = payment?.receipt?.detail ?? receipt ?? (facts?.paperwork ? facts.paperwork.lines.join(" ") : undefined);
  const timing = payment?.delivery?.detail ?? delivery ?? facts?.delivery?.detail;
  const tax = payment?.feeTax?.detail ?? (!isPlaceholder(feeTax) ? feeTax : facts?.tax ? facts.tax.lines.join(" ") : feeTax);
  const feeDetails = facts?.fees && isPlaceholder(assessment?.fees) ? facts.fees.lines : assessment?.fees ? [assessment.fees] : facts?.fees?.lines;
  const limitDetails = facts?.limits && isPlaceholder(assessment?.limits) ? facts.limits.lines : assessment?.limits ? [assessment.limits] : facts?.limits?.lines;
  const kyc = assessment?.kyc;
  const topics = [
    { label: "KYC documents", icon: IdCard, tone: "green", details: assessment?.verification, emphasis: true, list: true, scope: kyc ? `${kyc.appliesTo === "sender" ? "Your sender’s check. " : ""}${kyc.scope}${kyc.match === "other_country" ? " Written for another country, so yours may differ." : ""}` : undefined, source: kyc ? { url: kyc.documentsUrl } : undefined },
    { label: "Invoice and payment documents", icon: FileText, tone: "neutral", details: assessment?.documents },
    { label: "Remittance proof", icon: FileBadge, tone: "green", details: [receiptDetail], source: payment?.receipt },
    { label: "Delivery and settlement", icon: Clock3, tone: "orange", details: [timing], source: payment?.delivery },
    { label: "Tax on provider fees", icon: Percent, tone: "orange", details: [tax], source: payment?.feeTax },
    { label: "Export GST and income tax", icon: ReceiptText, tone: "green", details: [payment?.exportTax?.detail], source: payment?.exportTax },
    { label: "Provider fees", icon: Banknote, tone: "orange", details: feeDetails },
    { label: "Transfer limits", icon: Gauge, tone: "neutral", details: limitDetails },
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

      <dl className={styles.requirements}>
        {status !== "not_supported" && <KycTime kyc={kyc} provider={provider} />}
        {topics.map(({ label, icon: Icon, tone, details, source, emphasis, list, scope }) => (
          <div className={styles.requirementTopic} data-emphasis={emphasis || undefined} key={label}>
            <dt>
              <span className={styles.requirementSticker} data-tone={tone} aria-hidden="true"><Icon size={16} /></span>
              {label}
            </dt>
            {scope && <dd className={styles.kycScope}>{scope}</dd>}
            {list
              ? <dd><ul className={styles.kycList}>{details?.filter(Boolean).map((detail, index) => <li key={index}>{detail}</li>)}</ul></dd>
              : details?.filter(Boolean).map((detail, index) => <dd key={index}>{detail}</dd>)}
          </div>
        ))}
      </dl>

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
