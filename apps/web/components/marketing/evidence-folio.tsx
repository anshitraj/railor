"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { ArrowRight, ArrowUpRight, CircleAlert, CircleCheck, FileText } from "lucide-react";
import { ProviderLogo } from "../app/provider-logo";
import type { LandingEvidence } from "./landing-data";
import { evidenceConfidence, evidenceSourceHref } from "./evidence-presentation";

/** A real claim and its audit trail. The entrance never changes the data or score. */
export function EvidenceFolio({ evidence }: { evidence: LandingEvidence }) {
  const ref = useRef<HTMLElement>(null);
  const entered = useInView(ref, { once: true, amount: 0.2 });
  const [armed, setArmed] = useState(false);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (ref.current) setArmed(ref.current.getBoundingClientRect().top > window.innerHeight);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  const score = evidenceConfidence(evidence.confidence, evidence.bandKey);
  const source = evidenceSourceHref(evidence.sourceUrl);
  const StatusIcon = score.tone === "good" ? CircleCheck : score.tone === "warn" || score.tone === "bad" ? CircleAlert : FileText;

  return (
    <article ref={ref} aria-label={`Evidence for ${evidence.provider}`} className={`evidence-folio ${armed && !reduced ? "is-armed" : ""} ${entered ? "has-entered" : ""}`} data-confidence-tone={score.tone}>
      <header className="evidence-folio-header" data-evidence-entry="identity">
        <div className="flex min-w-0 items-center gap-3.5">
          <ProviderLogo slug={evidence.providerSlug} name={evidence.provider} size={44} />
          <div className="min-w-0">
            <p className="evidence-label">Capability record</p>
            <h3 className="mt-1.5 font-display text-[clamp(1.25rem,3cqi,1.6rem)] font-medium leading-tight tracking-[-0.035em]">{evidence.provider}</h3>
          </div>
        </div>
        <span className="evidence-confidence-band"><StatusIcon size={14} aria-hidden />{evidence.band}</span>
      </header>

      <div className="evidence-folio-claim" data-evidence-entry="claim">
        <div className="min-w-0">
          <p className="evidence-label">The claim</p>
          <p className="mt-3 font-display text-[clamp(1.15rem,3.2cqi,1.5rem)] font-medium leading-[1.4] tracking-[-0.025em]">{evidence.claim}</p>
        </div>
        <div className="evidence-score" aria-label={`Evidence confidence: ${score.label}, ${evidence.band}`}>
          <p className="evidence-label">Confidence</p>
          <p className="mt-2 font-display text-[35px] font-medium leading-none tracking-[-0.05em] tabular">{score.label}</p>
          <div className="evidence-meter" aria-hidden><span style={{ transform: `scaleX(${score.ratio})` }} /></div>
          <p className="mt-2 text-[10px] text-[var(--color-muted)]">Age-adjusted score</p>
        </div>
      </div>

      <ol className="evidence-trail" aria-label="Evidence audit trail">
        <li className="evidence-source" data-evidence-entry="source">
          <span className="evidence-trail-number" aria-hidden>01</span>
          <div className="min-w-0 flex-1">
            <p className="evidence-label">{evidence.sourceType}</p>
            {source ? (
              <a className="evidence-source-link group" href={source} target="_blank" rel="noopener noreferrer" aria-label={`Open source: ${evidence.sourceTitle} (opens in a new tab)`}>
                <span>{evidence.sourceTitle}</span><ArrowUpRight size={16} aria-hidden className="shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            ) : <p className="mt-2 text-[14px] leading-relaxed">{evidence.sourceTitle}</p>}
            <p className="mt-2 break-all font-mono text-[10px] text-[var(--color-muted)]">{evidence.sourceHost}</p>
          </div>
        </li>
        <li className="evidence-timestamp" data-evidence-entry="retrieved">
          <span className="evidence-trail-number" aria-hidden>02</span>
          <div><p className="evidence-label">Retrieved</p><p className="mt-2 text-[12px] font-medium tabular">{evidence.retrievedAt}</p></div>
        </li>
        <li className="evidence-timestamp" data-evidence-entry="verified">
          <span className="evidence-trail-number" aria-hidden>03</span>
          <div><p className="evidence-label">Last verified</p><p className="mt-2 text-[12px] font-medium tabular">{evidence.verifiedAt}</p></div>
        </li>
      </ol>

      <footer className="evidence-folio-footer" data-evidence-entry="action">
        <span className="text-[11px] text-[var(--color-muted)]">Real record. Inspectable evidence.</span>
        <Link href={`/providers/${evidence.providerSlug}`} className="evidence-record-link group">Explore record <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-1" /></Link>
      </footer>
    </article>
  );
}
