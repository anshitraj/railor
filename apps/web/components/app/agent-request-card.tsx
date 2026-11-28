"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Building2, Check, ChevronDown, CircleAlert, Pencil, ShieldCheck, User } from "lucide-react";
import { Flag } from "@railor/ui";
import { RANKING_PRESET_LABEL, type RankingPreset } from "@railor/types";
import type { IntentDraft, IntentOptions } from "./intent-builder";
import styles from "./agent-request.module.css";

const PREFERENCES: Array<{ value: RankingPreset; label: string }> = [
  { value: "balanced", label: "Balanced" },
  { value: "cheapest", label: "Cheapest" },
  { value: "fastest", label: "Fastest" },
  { value: "most_reliable", label: "Most reliable" },
  { value: "max_recipient_amount", label: "Most arrives" },
];
const EASE = [0.23, 1, 0.32, 1] as const;

function Party({ country, type, options, label }: { country: string; type: "business" | "individual"; options: IntentOptions; label: string }) {
  const option = options.countries.find((item) => item.value === country);
  const Icon = type === "business" ? Building2 : User;
  return (
    <span className={styles.party} data-empty={!country || undefined}>
      <small>{label}</small>
      <span className={styles.partyMain}>
        {country ? <Flag code={option?.flag ?? country} size={18} round /> : <CircleAlert size={16} aria-hidden />}
        <strong>{option?.label ?? (country || "Not set")}</strong>
      </span>
      <span className={styles.partyType}><Icon size={12} aria-hidden />{type === "business" ? "Business" : "Individual"}</span>
    </span>
  );
}

/**
 * What the agent understood, as one clean card: the amount and route up top,
 * a single "compare by" choice and one primary action. Every field stays
 * editable, folded behind "Edit details" so the first view isn't a form.
 */
export function AgentRequestCard({
  intent, options, missing, pending, editing, onEditing, editor, policies, policyId, onPolicy, preference, onPreference, onSearch, hasResults,
}: {
  intent: IntentDraft;
  options: IntentOptions;
  missing: string[];
  pending: boolean;
  editing: boolean;
  onEditing: (open: boolean) => void;
  editor: ReactNode;
  policies: Array<{ id: string; name: string }>;
  policyId: string;
  onPolicy: (id: string) => void;
  preference: RankingPreset;
  onPreference: (value: RankingPreset) => void;
  onSearch: () => void;
  hasResults: boolean;
}) {
  const reduce = useReducedMotion();
  const editorRef = useRef<HTMLDivElement>(null);
  // Bring the editor into view once it has opened, so "Edit details" never opens off screen.
  useEffect(() => {
    if (!editing) return;
    const timer = window.setTimeout(() => editorRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }), 320);
    return () => window.clearTimeout(timer);
  }, [editing, reduce]);
  // On phones the pills scroll sideways: keep the chosen one in view.
  const pillsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = pillsRef.current;
    const chosen = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!row || !chosen || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: Math.max(0, chosen.offsetLeft - (row.clientWidth - chosen.offsetWidth) / 2), behavior: reduce ? "auto" : "smooth" });
  }, [preference, reduce]);
  const from = intent.sourceKind === "asset" ? intent.sourceAsset : intent.sourceCurrency;
  const network = intent.sourceKind === "asset" ? options.networks.find((item) => item.value === intent.sourceNetwork)?.label ?? intent.sourceNetwork : "";
  const details = [network ? `${network}` : "", intent.namedRail, intent.endpointType ? intent.endpointType.replaceAll("_", " ") : ""].filter(Boolean);
  const ready = missing.length === 0;
  const fromCountry = options.countries.find((item) => item.value === intent.sourceEntityCountry);
  const toCountry = options.countries.find((item) => item.value === intent.destinationCountry);

  // When results are already shown, collapse into a sleek single-row context strip
  // (like ChatGPT/Perplexity) instead of occupying 320px above the answer.
  if (hasResults) {
    return (
      <section className={styles.strip} aria-label="Your request">
        <div className={styles.stripBar}>
          <div className={styles.stripSummary}>
            <strong className={styles.stripAmount}>
              {intent.amount !== undefined ? intent.amount.toLocaleString("en-US") : "—"} {from || "?"} → {intent.destinationCurrency || "?"}
            </strong>
            <span className={styles.stripRoute}>
              {intent.sourceEntityCountry ? <Flag code={fromCountry?.flag ?? intent.sourceEntityCountry} size={14} round /> : null}
              <span>{fromCountry?.label ?? intent.sourceEntityCountry ?? "?"}</span>
              <span aria-hidden>→</span>
              {intent.destinationCountry ? <Flag code={toCountry?.flag ?? intent.destinationCountry} size={14} round /> : null}
              <span>{toCountry?.label ?? intent.destinationCountry ?? "?"}</span>
            </span>
            {details.map((detail) => <span key={detail} className={styles.stripTag}>{detail}</span>)}
          </div>

          <div className={styles.stripControls}>
            <label className={styles.stripSelect}>
              <span className="sr-only">Compare by</span>
              <select
                disabled={pending}
                value={preference}
                aria-label="Compare by"
                onChange={(event) => onPreference(event.target.value as RankingPreset)}
              >
                {PREFERENCES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            {policies.length ? (
              <label className={styles.stripSelect}>
                <span className="sr-only">Company rules</span>
                <select
                  disabled={pending}
                  value={policyId}
                  aria-label="Company rules"
                  onChange={(event) => onPolicy(event.target.value)}
                >
                  {policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
                </select>
              </label>
            ) : null}

            <button type="button" className={styles.stripEdit} aria-expanded={editing} onClick={() => onEditing(!editing)}>
              <Pencil size={12} aria-hidden />
              <span>{editing ? "Close" : "Edit"}</span>
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {editing ? (
            <motion.div
              key="editor"
              className={styles.editor}
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <div className={styles.editorInner} ref={editorRef}>
                {editor}
                <button type="button" className={`${styles.primary} press`} disabled={pending || !ready} onClick={() => { onEditing(false); onSearch(); }}>
                  Update comparison<ArrowRight size={15} aria-hidden />
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    );
  }

  return (
    <motion.section
      className={styles.card}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
      aria-label="Your request"
    >
      <header className={styles.head}>
        <span className={styles.status} data-ready={ready || undefined}>
          {ready ? <Check size={13} aria-hidden /> : <CircleAlert size={13} aria-hidden />}
          {ready ? (hasResults ? "Your request" : "Ready to compare") : `${missing.length} ${missing.length === 1 ? "detail" : "details"} needed`}
        </span>
        <button type="button" className={styles.edit} aria-expanded={editing} onClick={() => onEditing(!editing)}>
          <Pencil size={13} aria-hidden />{editing ? "Done editing" : "Edit details"}
          <ChevronDown size={14} aria-hidden className={styles.chevron} data-open={editing || undefined} />
        </button>
      </header>

      <p className={styles.amount}>
        <span>{intent.amount !== undefined ? intent.amount.toLocaleString("en-US") : "—"}</span>
        <b>{from || "?"}</b>
        <ArrowRight size={20} aria-hidden className={styles.arrow} />
        <b>{intent.destinationCurrency || "?"}</b>
      </p>

      <div className={styles.route}>
        <Party country={intent.sourceEntityCountry} type={intent.sourceEntityType} options={options} label="From" />
        <span className={styles.connector} aria-hidden><i /></span>
        <Party country={intent.destinationCountry} type={intent.beneficiaryType} options={options} label="To" />
      </div>

      {details.length ? <ul className={styles.details}>{details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}

      {!ready ? (
        <button type="button" className={styles.missing} onClick={() => onEditing(true)}>
          <CircleAlert size={14} aria-hidden /><span>Add {missing.join(", ")} to compare.</span><ArrowRight size={14} aria-hidden />
        </button>
      ) : null}

      <div className={styles.preference}>
        <span className={styles.label} id="agent-compare-by">Compare by</span>
        <div role="radiogroup" aria-labelledby="agent-compare-by" className={styles.pills} ref={pillsRef}>
          {PREFERENCES.map((option) => (
            <button key={option.value} type="button" role="radio" aria-checked={preference === option.value} disabled={pending} onClick={() => onPreference(option.value)} title={RANKING_PRESET_LABEL[option.value]}>
              {preference === option.value ? <motion.span layoutId="agent-pref" className={styles.pillBg} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }} /> : null}
              <span className={styles.pillText}>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <footer className={styles.foot}>
        {policies.length ? (
          <label className={styles.policy}>
            <ShieldCheck size={14} aria-hidden />
            <span className="sr-only">Company rules</span>
            <select disabled={pending} value={policyId} onChange={(event) => onPolicy(event.target.value)}>
              {policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
            </select>
          </label>
        ) : (
          <span className={styles.policyNote}><ShieldCheck size={14} aria-hidden />Exploring coverage · <Link href="/app/policies">add company rules</Link></span>
        )}
        {!hasResults ? (
          <button type="button" className={`${styles.primary} press`} disabled={pending || !ready} onClick={onSearch}>
            {pending ? "Comparing…" : "Compare providers"}<ArrowRight size={16} aria-hidden />
          </button>
        ) : null}
      </footer>

      <AnimatePresence initial={false}>
        {editing ? (
          <motion.div
            key="editor"
            className={styles.editor}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className={styles.editorInner} ref={editorRef}>
              {editor}
              <button type="button" className={`${styles.primary} press`} disabled={pending || !ready} onClick={() => { onEditing(false); onSearch(); }}>
                {hasResults ? "Update comparison" : "Save and compare"}<ArrowRight size={16} aria-hidden />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}
