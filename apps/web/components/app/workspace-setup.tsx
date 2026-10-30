"use client";
import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, BookOpen, Calculator, Check, ChevronDown, Code2, Route, SlidersHorizontal } from "lucide-react";
import { workspacePolicySetup, type SavedSetupPolicy } from "../../lib/workspace-policy-setup";
import { RailorMark } from "../brand";
import styles from "./workspace-setup.module.css";

const GUIDE = [
  { title: "Compare a price", description: "Choose two currencies and an amount. See fees, what arrives and each price’s source.", href: "/app/prices", action: "Compare prices", Icon: Calculator },
  { title: "Find your route", description: "Check which providers support your countries, currencies and payment needs.", href: "/app/search", action: "Find a route", Icon: Route },
  { title: "Bring Railor to your tools", description: "Get your API key, choose an AI tool and copy the setup instructions.", href: "/app/developers", action: "Set up API & agents", Icon: Code2 },
];

export function WorkspaceSetup({ profileComplete, policyActive, savedPolicy = null, canEditPolicy }: {
  organizationId: string; profileComplete: boolean; policyActive: boolean; savedPolicy?: SavedSetupPolicy | null; hasDecision: boolean; canEditPolicy: boolean; canDecide: boolean;
}) {
  const [open, setOpen] = useState(!profileComplete);
  const reduce = useReducedMotion();
  const rules = workspacePolicySetup(policyActive, savedPolicy, canEditPolicy);
  return <section className={styles.root} aria-label="Workspace setup">
    <header className={styles.header}><span className={styles.mark}><RailorMark size={27} /></span><div><h2><BookOpen size={14} aria-hidden />Quick start</h2><p>A few simple ways to put Railor to work.</p></div><button type="button" aria-expanded={open} aria-controls="workspace-quick-start" onClick={() => setOpen(value => !value)}>{open ? "Close guide" : "Open guide"}<ChevronDown size={15} aria-hidden /></button></header>
    <motion.div id="workspace-quick-start" className={styles.guide} inert={!open} aria-hidden={!open} initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={{ duration: reduce ? 0 : .2 }}>
      {!profileComplete && <div className={styles.personalize}><SlidersHorizontal size={17} aria-hidden /><p>Make comparisons relevant to you.<span>Add your country and the markets you work with.</span></p><Link href="/welcome">Personalize workspace<ArrowRight size={13} aria-hidden /></Link></div>}
      <ol>{GUIDE.map(({ title, description, href, action, Icon }, index) => <li key={href}><span className={styles.stepIcon}><Icon size={19} aria-hidden /><i>{index + 1}</i></span><div><h3>{title}</h3><p>{description}</p></div><Link href={href}>{action}<ArrowRight size={13} aria-hidden /></Link></li>)}</ol>
      <footer>{profileComplete ? <Link href="/welcome"><Check size={12} aria-hidden />Preferences saved · Edit answers</Link> : <span>You can explore first and personalize later.</span>}<Link href="/docs">Read the docs<ArrowRight size={12} aria-hidden /></Link></footer>
    </motion.div>
    <details className={styles.teamControls}><summary><SlidersHorizontal size={13} aria-hidden />Optional team controls{policyActive && <span><Check size={12} />Company rules active</span>}<ChevronDown size={13} aria-hidden /></summary><div><p>Company rules set your limits. Rule checks record whether a route meets them. Team reviews let another person sign off when needed.</p><nav aria-label="Optional team setup"><Link href={rules.href}>{savedPolicy ? rules.action : "Set company rules"} →</Link><Link href="/app/decisions">View rule checks →</Link><Link href="/app/approvals">Team reviews →</Link></nav></div></details>
  </section>;
}
