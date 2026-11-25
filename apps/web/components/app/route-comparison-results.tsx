"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp, ClipboardCopy, FileCheck2, Link2, Minus } from "lucide-react";
import { Flag } from "@railor/ui";
import { refreshRouteComparison, shareRouteComparison } from "../../app/app/compare/actions";
import { NEEDS_CONFIRMATION, type ComparisonCandidate, type RouteComparison } from "../../lib/route-comparison-model";
import { ProviderWordmark } from "./provider-wordmark";
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
        <div><h3><ProviderWordmark slug={candidate.slug} name={candidate.name} size="large" /></h3><span>{candidate.category}</span></div>
      </div>
      <div className={styles.verdict} data-verdict={candidate.verdict}>
        {candidate.verdict === "supported" ? <FileCheck2 size={14} /> : <CircleHelp size={14} />}
        {VERDICT[candidate.verdict]}
      </div>
      <p className={styles.reason}>{candidate.reason}</p>
      {candidate.advantages.length || candidate.considerations.length ? <div className={styles.analysis}>
        {candidate.advantages.length ? <section aria-label={`${candidate.name} advantages`}>
          <h4><Check size={15} aria-hidden /> Advantages</h4>
          <ul>{candidate.advantages.map(text => <li key={text}>{text}</li>)}</ul>
        </section> : null}
        {candidate.considerations.length ? <section aria-label={`${candidate.name} trade-offs`} className={styles.tradeoffs}>
          <h4><Minus size={15} aria-hidden /> Trade-offs</h4>
          <ul>{candidate.considerations.map(text => <li key={text}>{text}</li>)}</ul>
        </section> : null}
      </div> : null}
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

export function RouteComparisonResults({ comparison: initial, shareable = false }: { comparison: RouteComparison; shareable?: boolean }) {
  const [latest, setLatest] = useState<RouteComparison | null>(null);
  const comparison = latest ?? initial;
  const [differences, setDifferences] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareNote, setShareNote] = useState("");
  const labels = [...new Set(comparison.candidates.flatMap(candidate => candidate.facts.map(fact => fact.label)))];
  const facts = labels.map(label => ({ label, values: comparison.candidates.map(candidate => candidate.facts.find(item => item.label === label)) }));
  const documented = facts.filter(row => row.values.some(fact => fact && fact.value !== NEEDS_CONFIRMATION));
  const missing = facts.filter(row => !documented.includes(row));
  const rows = documented.filter(row => !differences || new Set(row.values.map(value => JSON.stringify([value?.value, value?.detail]))).size > 1);

  useEffect(() => {
    if (!shareable || !initial.pendingWebChecks) return;
    let cancelled = false;
    let timer: number;
    let attempts = 0;
    const poll = async () => {
      const result = await refreshRouteComparison(initial.request).catch(() => null);
      if (cancelled) return;
      attempts++;
      if (result) setLatest({ ...result, checkedAt: initial.checkedAt, pendingWebChecks: result.pendingWebChecks && attempts < 12 });
      if (result?.pendingWebChecks && attempts < 12) timer = window.setTimeout(poll, 5000);
      if (!result) setLatest(previous => ({ ...(previous ?? initial), pendingWebChecks: false }));
    };
    timer = window.setTimeout(poll, 3500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [initial, shareable]);

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
      {comparison.pendingWebChecks ? <p className={styles.shareNote} role="status">Checking official sources for missing details…</p> : null}
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
              <span>{value?.value ?? NEEDS_CONFIRMATION}</span>{value?.detail ? <small>{value.detail}</small> : null}
              {value?.source ? <a className={styles.factSource} href={value.source.url} target="_blank" rel="noreferrer" aria-label={value.source.title}>Source <ArrowUpRight size={12} aria-hidden /></a> : null}
            </td>)}
          </tr>)}</tbody>
        </table> : <p className={styles.noDifferences}>{differences ? "No documented differences in these details." : "No published details found for this setup yet."}</p>}
        {missing.length && documented.length ? <p className={styles.noDifferences}>Still unverified for both providers · {missing.map(row => row.label).join(" · ")}</p> : null}
      </section>
    </section>
  );
}
