"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp, ClipboardCopy, FileCheck2, Link2, Minus } from "lucide-react";
import { Flag } from "@railor/ui";
import { shareRouteComparison } from "../../app/app/compare/actions";
import type { ComparisonCandidate, RouteComparison } from "../../lib/route-comparison-model";
import { ProviderLogo } from "./provider-logo";
import styles from "./route-comparison.module.css";

const VERDICT: Record<ComparisonCandidate["verdict"], string> = {
  supported: "Coverage documented",
  additional_requirements: "Additional checks",
  unavailable: "Route unavailable",
  unknown: "Coverage needs confirmation",
};
const sourceDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function CandidateCard({ candidate, index }: { candidate: ComparisonCandidate; index: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.article
      className={styles.resultCard}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .3, delay: reduced ? 0 : index * .08, ease: [.2, .8, .25, 1] }}
    >
      <div className={styles.candidateHeader}>
        <ProviderLogo slug={candidate.slug} name={candidate.name} loading="eager" size={43} />
        <div><h3>{candidate.name}</h3><span>{candidate.category}</span></div>
      </div>
      <div className={styles.verdict} data-verdict={candidate.verdict}>
        {candidate.verdict === "supported" ? <FileCheck2 size={14} /> : <CircleHelp size={14} />}
        {VERDICT[candidate.verdict]}
      </div>
      <p className={styles.reason}>{candidate.reason}</p>
      <div className={styles.analysis}>
        <section aria-label={`${candidate.name} advantages`}>
          <h4><Check size={15} aria-hidden /> Advantages</h4>
          {candidate.advantages.length ? <ul>{candidate.advantages.map(text => <li key={text}>{text}</li>)}</ul> : <p>Check what the provider offers for this route.</p>}
        </section>
        <section aria-label={`${candidate.name} trade-offs`}>
          <h4><Minus size={15} aria-hidden /> Trade-offs</h4>
          {candidate.considerations.length ? <ul>{candidate.considerations.map(text => <li key={text}>{text}</li>)}</ul> : <p>Review product terms before transferring.</p>}
        </section>
      </div>
      {candidate.webCheck ? <blockquote className={styles.webCheck}>
        <strong>{candidate.webCheck.verdict === "supported" ? "Official source supports the route" : "Official source flags a restriction"}</strong>
        <p>{candidate.webCheck.quote}</p>
        <a href={candidate.webCheck.source.url} target="_blank" rel="noreferrer">{candidate.webCheck.source.title} <ArrowUpRight size={13} aria-hidden /></a>
      </blockquote> : null}
      {candidate.sources.length ? <details className={styles.sources}>
        <summary><span><Link2 size={15} aria-hidden /> Sources <small>{candidate.sources.length}</small></span><ChevronDown size={15} aria-hidden /></summary>
        <ul>{candidate.sources.map(source => <li key={source.url}>
          <a href={source.url} target="_blank" rel="noreferrer">{source.title} <ArrowUpRight size={12} aria-hidden /></a>
          {source.verifiedAt ? <span>Checked {sourceDate.format(new Date(source.verifiedAt))}</span> : null}
        </li>)}</ul>
      </details> : candidate.website ? <a className={styles.website} href={candidate.website} target="_blank" rel="noreferrer">Provider website <ArrowUpRight size={14} aria-hidden /></a> : null}
    </motion.article>
  );
}

export function RouteComparisonResults({ comparison, shareable = false }: { comparison: RouteComparison; shareable?: boolean }) {
  const [differences, setDifferences] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareNote, setShareNote] = useState("");
  const facts = comparison.candidates[0]?.facts ?? [];
  const rows = facts.map(fact => ({ label: fact.label, values: comparison.candidates.map(candidate => candidate.facts.find(item => item.label === fact.label)) }))
    .filter(row => !differences || new Set(row.values.map(value => JSON.stringify([value?.value, value?.detail]))).size > 1);

  async function share() {
    setSharing(true);
    setShareNote("");
    try {
      const result = await shareRouteComparison(comparison.request);
      if (!result.ok) throw new Error("Could not create a link.");
      const url = new URL(result.path, window.location.origin).href;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setShareNote("Link copied.");
      } catch {
        setShareNote("Share link ready.");
      }
    } catch {
      setShareNote("Could not create a share link. Try again.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className={styles.results} aria-label="Provider comparison results">
      <div className={styles.resultsHeader}>
        <div>
          <p className={styles.resultRoute}><Flag code={comparison.request.from} size={18} round /> {comparison.origin} <ArrowRight size={14} aria-hidden /> <Flag code={comparison.request.to} size={18} round /> {comparison.destination}</p>
          <h2>Comparison results</h2>
          <p>{comparison.request.customerType === "business" ? "Business transfers" : "Personal transfers"}{comparison.productLabel ? ` · ${comparison.productLabel}` : ""} · Checked {sourceDate.format(new Date(comparison.checkedAt))}</p>
        </div>
        {shareable ? <button className={styles.share} type="button" disabled={sharing} onClick={() => void share()}><ClipboardCopy size={16} aria-hidden /> {sharing ? "Creating link…" : "Share comparison"}</button> : null}
      </div>
      {shareNote ? <p className={styles.shareNote} role="status">{shareNote} {shareUrl ? <a href={shareUrl} target="_blank" rel="noreferrer">Open shared comparison <ArrowUpRight size={13} aria-hidden /></a> : null}</p> : null}
      <div className={styles.candidateGrid}>{comparison.candidates.map((candidate, index) => <CandidateCard key={candidate.slug} candidate={candidate} index={index} />)}</div>
      <section className={styles.facts} aria-label="Comparison details">
        <div className={styles.factsHeader}>
          <h3>Requirements, timing and fees</h3>
          <label><input type="checkbox" checked={differences} onChange={event => setDifferences(event.target.checked)} /> Only show differences</label>
        </div>
        {rows.length ? <table>
          <thead><tr><th scope="col">Detail</th>{comparison.candidates.map(candidate => <th scope="col" key={candidate.slug}>{candidate.name}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.label}>
            <th scope="row">{row.label}</th>
            {row.values.map((value, index) => <td key={comparison.candidates[index]!.slug}>
              <span>{value?.value ?? "Needs confirmation"}</span>{value?.detail ? <small>{value.detail}</small> : null}
            </td>)}
          </tr>)}</tbody>
        </table> : <p className={styles.noDifferences}>No documented differences in these details.</p>}
      </section>
    </section>
  );
}
