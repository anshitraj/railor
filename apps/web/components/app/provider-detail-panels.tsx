import type { ReactNode } from "react";
import { Banknote, CalendarClock, Clock3, CreditCard, FileBadge, FileText, Gauge, Globe2, IdCard, Info, Landmark, Percent, ReceiptText, ScanFace, ShieldCheck, Target, Timer, TriangleAlert, UserRoundCheck, Users, Wallet } from "lucide-react";
import type { PriceRow } from "@railor/core";
import { DOC_LABEL, kycDocumentRows, type KycDocumentRow } from "../../lib/kyc-documents";
import { DocumentArt } from "./kyc-document-art";
import styles from "./price-check.module.css";

type Assessment = PriceRow["profileAssessment"];
type Tone = "green" | "orange" | "neutral";
type Topic = {
  label: string; icon: typeof Info; tone: Tone; details?: Array<string | null | undefined>;
  emphasis?: boolean; list?: boolean; scope?: string; body?: ReactNode;
};

/** Sources are listed once, on the Overview tab; the topics here carry no links of their own. */
function Topics({ topics }: { topics: Topic[] }) {
  return <dl className={styles.requirements}>
    {topics.map(({ label, icon: Icon, tone, details, emphasis, list, scope, body }) => (
      <div className={styles.requirementTopic} data-emphasis={emphasis || undefined} key={label}>
        <dt><span className={styles.requirementSticker} data-tone={tone} aria-hidden="true"><Icon size={16} /></span>{label}</dt>
        {scope ? <dd className={styles.kycScope}>{scope}</dd> : null}
        {body ? <dd>{body}</dd> : null}
        {list
          ? <dd><ul className={styles.kycList}>{details?.filter(Boolean).map((detail, index) => <li key={index}>{detail}</li>)}</ul></dd>
          : details?.filter(Boolean).map((detail, index) => <dd key={index}>{detail}</dd>)}
      </div>
    ))}
  </dl>;
}

const hasContent = (topic: Topic) => Boolean(topic.body || topic.details?.some(Boolean));

/** The checklist: a picture for each kind of document, what it is, and whether it is asked up front or only sometimes. */
function DocumentChecklist({ rows }: { rows: KycDocumentRow[] }) {
  return <ul className={styles.docList}>
    {rows.map((row) => (
      <li className={styles.docRow} key={row.text}>
        <span className={styles.docArt} data-count={Math.min(row.types.length, 3)} aria-hidden="true">
          {row.types.slice(0, 3).map((type) => <DocumentArt key={type} type={type} height={row.types.length > 1 ? 38 : 46} />)}
        </span>
        <div>
          <p className={styles.docTitle}>
            <strong>{row.types.map((type) => DOC_LABEL[type]).join(" · ")}</strong>
            <em data-need={row.need}>{row.need === "required" ? "Required" : "If asked"}</em>
          </p>
          <p className={styles.docText}>{row.text}</p>
        </div>
      </li>
    ))}
  </ul>;
}

/** The identity check, start to finish: how long, which documents, in what order. Only what the provider publishes is stated as fact. */
export function KycGuide({ assessment, provider }: { assessment: Assessment; provider: string }) {
  const kyc = assessment?.kyc;
  const time = kyc?.approvalTime ?? null;
  const documents = kyc?.documents?.length ? kyc.documents : (assessment?.verification ?? []).filter(Boolean);
  const rows = kycDocumentRows(documents, kyc?.documentsNote);
  const sender = kyc?.appliesTo === "sender";
  const selfie = rows.some((row) => row.types.includes("selfie"));
  const reviewed = kyc?.reviewedAt ?? assessment?.reviewedAt ?? null;

  if (!kyc && !documents.length) {
    return (
      <div className={styles.requirementsPanel}>
        <div className={styles.requirementsSummary} data-status="unconfirmed">
          <span className={styles.requirementSticker} aria-hidden="true"><Info size={20} /></span>
          <div>
            <h3>No published KYC details yet</h3>
            <p>Railor hasn’t found a document list or turnaround on {provider}’s own pages for this account type. Nothing is guessed here.</p>
          </div>
        </div>
        <Topics topics={[{ label: "Ask the provider", icon: UserRoundCheck, tone: "green", emphasis: true, list: true, details: [
          "Which documents they need for your account type and country.",
          "How long approval takes, and whether a larger amount changes it.",
          "Whether they ask for proof of address or the source of the money.",
        ] }]} />
      </div>
    );
  }

  const steps: Array<{ title: string; text: string }> = [
    { title: sender ? "The sender opens an account or starts the transfer" : "Open an account or start your first transfer", text: `Sign up with an email or phone number, then follow ${provider}’s verification prompts.` },
    { title: "Submit your documents", text: documents.length ? `Upload what the list above asks for${selfie ? ", including the selfie" : ""}. ${provider} can ask for more depending on the amount and country.` : `${provider} tells you what to upload when you start.` },
    { title: "Wait for the check", text: time ? `${time.label}, going by ${provider}’s own page. Plan around this before you need to send.` : `${provider} doesn’t publish how long this takes. Ask before you rely on a start date.` },
    { title: "Answer any follow-up, then send", text: "If something is unclear the provider asks again, usually by email or in the app. Once approved, the transfer can go ahead." },
  ];

  const topics: Topic[] = [
    {
      label: "Documents to prepare", icon: IdCard, tone: "green", emphasis: true,
      scope: kyc ? `${sender ? "Your sender’s check. " : ""}${kyc.scope}${kyc.match === "other_country" ? " Written for another country, so yours may differ." : ""}` : undefined,
      body: rows.length ? <DocumentChecklist rows={rows} /> : undefined,
    },
    {
      label: "How the check usually goes", icon: UserRoundCheck, tone: "orange",
      body: <ol className={styles.kycSteps}>{steps.map((step, index) => <li key={step.title}><span aria-hidden="true">{index + 1}</span><div><strong>{step.title}</strong><p>{step.text}</p></div></li>)}</ol>,
    },
    {
      label: sender ? "Whose check this is" : "Good to know", icon: sender ? Users : ShieldCheck, tone: "neutral",
      details: [
        sender ? `The person paying in verifies with ${provider}. You, as the recipient, usually only need your bank details.` : null,
        kyc && kyc.match !== "country" ? (kyc.match === "other_country" ? "These rules are published for another country." : "These are the provider’s general rules, not specific to your country.") : null,
        "Railor never verifies anyone or approves an account. The provider decides.",
        reviewed ? `Railor last checked this against ${provider}’s pages on ${reviewed}.` : null,
      ],
    },
  ];

  return (
    <div className={styles.requirementsPanel}>
      <div className={styles.kycGlance}>
        <div data-tone="green"><span><Timer size={14} aria-hidden /> Approval time</span><strong>{time?.label ?? "Not published"}</strong></div>
        <div><span><FileText size={14} aria-hidden /> Documents</span><strong>{rows.length ? `${rows.length} to prepare` : "Ask provider"}</strong></div>
        <div><span>{selfie ? <ScanFace size={14} aria-hidden /> : <UserRoundCheck size={14} aria-hidden />} Checked</span><strong>{sender ? "Your sender" : "You"}</strong></div>
      </div>
      {time ? (
        <div className={styles.kycTimeCard}>
          <span className={styles.requirementSticker} data-tone="green" aria-hidden="true"><CalendarClock size={16} /></span>
          <div>
            <strong>How long approval takes</strong>
            <p>{sender ? "Your sender’s check with this provider, not yours. " : ""}{time.detail}</p>
          </div>
        </div>
      ) : (
        <div className={styles.kycTimeCard} data-empty>
          <span className={styles.requirementSticker} aria-hidden="true"><Clock3 size={16} /></span>
          <div><strong>No published turnaround</strong><p>{provider} doesn’t say how long approval takes for this account. Ask them before you rely on a start date.</p></div>
        </div>
      )}
      <Topics topics={topics.filter(hasContent)} />
    </div>
  );
}

/** What the transfer costs beyond the headline, and the limits on it. */
export function FeesAndLimits({ row, assessment, feeTax, method, to }: { row: PriceRow; assessment: Assessment; feeTax?: string | null; method: string | null; to: string }) {
  const topics: Topic[] = [
    { label: "Provider fees", icon: Banknote, tone: "orange", emphasis: true, details: [assessment?.fees, row.feeBreakdown] },
    { label: "Who pays the fee", icon: Wallet, tone: "neutral", details: [row.side === "payer" ? "The sender pays through this service. The recipient only needs a bank account." : row.side === "recipient" ? "Deducted from the payout before it arrives." : null] },
    { label: "Tax on provider fees", icon: Percent, tone: "orange", details: [feeTax && feeTax !== assessment?.fees ? feeTax : null] },
    { label: "Transfer limits", icon: Gauge, tone: "neutral", details: [assessment?.limits] },
    { label: "How you pay", icon: CreditCard, tone: "green", details: [method] },
    { label: "Still to confirm", icon: TriangleAlert, tone: "orange", list: true, details: row.missing ?? [] },
    { label: "Against the best payout", icon: Target, tone: "neutral", details: [row.shortfall ? `${Math.abs(row.shortfall).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${to} ${row.shortfall > 0 ? "less" : "more"} than the best documented payout.` : null] },
  ];
  const shown = topics.filter(hasContent);
  return shown.length
    ? <div className={styles.requirementsPanel}><Topics topics={shown} /></div>
    : <p className={styles.detailIntro}>This source doesn’t break down fees or limits for this setup. Ask the provider, or open the source on the Overview tab.</p>;
}

/** Timing, where the money lands and the paperwork around it. */
export function DeliveryAndPaperwork({ row, assessment, delivery, receipt }: { row: PriceRow; assessment: Assessment; delivery?: string | null; receipt?: string | null }) {
  const payment = assessment?.payment;
  const topics: Topic[] = [
    { label: "Delivery and settlement", icon: Clock3, tone: "orange", emphasis: true, details: [delivery] },
    { label: "Payout account", icon: Landmark, tone: "green", details: assessment?.settlement },
    { label: "Supported routes", icon: Globe2, tone: "neutral", details: [assessment?.corridors] },
    { label: "Payment purpose", icon: Target, tone: "neutral", details: [assessment?.purpose] },
    { label: "Invoice and payment documents", icon: FileText, tone: "neutral", list: true, details: assessment?.documents },
    { label: "Remittance proof", icon: FileBadge, tone: "green", details: [payment?.receipt?.detail ?? receipt] },
    { label: "Export GST and income tax", icon: ReceiptText, tone: "green", details: [payment?.exportTax?.detail] },
    { label: "Notes from the source", icon: Info, tone: "neutral", list: true, details: row.notes },
  ];
  const shown = topics.filter(hasContent);
  return shown.length
    ? <div className={styles.requirementsPanel}><Topics topics={shown} /></div>
    : <p className={styles.detailIntro}>No delivery or paperwork details were supplied for this setup.</p>;
}
