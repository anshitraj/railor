"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, ListChecks, MessageSquare, SlidersHorizontal } from "lucide-react";

export function WorkspaceSetup({ organizationId, profileComplete, policyActive, hasDecision, canEditPolicy, canDecide }: {
  organizationId: string; profileComplete: boolean; policyActive: boolean; hasDecision: boolean; canEditPolicy: boolean; canDecide: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const storageKey = `railor.setup-hidden:${organizationId}`;
  useEffect(() => { try { setDismissed(localStorage.getItem(storageKey) === "true"); } catch { /* Storage is optional. */ } }, [storageKey]);
  const steps = [
    { title: "Make Railor yours", description: "A few quick questions to tailor your workspace.", action: "Set up workspace", href: "/welcome", done: profileComplete, Icon: SlidersHorizontal },
    { title: "Set your company policy", description: canEditPolicy ? "Choose your guardrails, then review and activate your policy." : "Ask your workspace owner to create and activate a company policy.", action: canEditPolicy ? "Create a policy" : "View policies", href: canEditPolicy ? "/app/policies#create-policy" : "/app/policies", done: policyActive, Icon: ListChecks },
    { title: "Describe your money movement", description: canDecide ? "Tell the Agent where money needs to go. Review its suggested paths." : "Explore routes while your team records its first decision.", action: canDecide ? "Describe a movement" : "Explore routes", href: canDecide ? "/app/agent" : "/app/search", done: hasDecision, Icon: MessageSquare },
  ];
  const completed = steps.filter((step) => step.done).length;
  if (completed === steps.length) return null;
  const next = steps.findIndex((step) => !step.done);
  const step = steps[next];
  if (!step) return null;
  const hide = () => { setDismissed(true); try { localStorage.setItem(storageKey, "true"); } catch { /* Storage is optional. */ } };
  const show = () => { setDismissed(false); try { localStorage.removeItem(storageKey); } catch { /* Storage is optional. */ } };
  if (dismissed) return <button type="button" onClick={show} className="overview-resume"><SlidersHorizontal size={16} aria-hidden /> Resume setup <span>{completed} of 3 complete</span><ArrowRight size={15} aria-hidden /></button>;
  return <section className="workspace-setup" aria-labelledby="setup-title">
    <header><span>Finish setting up <span className="setup-count">{completed} of 3 complete</span></span><button type="button" onClick={hide}>Do this later</button></header>
    <div className="setup-progress" aria-label={`Setup: ${completed} of 3 complete`}>{steps.map((item, index) => <span key={item.title} data-complete={item.done} data-current={index === next} />)}</div>
    <div className="setup-current"><span className="setup-icon"><step.Icon size={23} aria-hidden /></span><div><h2 id="setup-title">{step.title}</h2><p>{step.description}</p></div><Link className="setup-cta" href={step.href}>{step.action}<ArrowRight size={16} aria-hidden /></Link></div>
    <details className="setup-details"><summary>View setup steps <ChevronDown size={14} aria-hidden /></summary><ol>{steps.map((item, index) => <li key={item.title}><Link href={item.href}><span className="setup-step-mark">{item.done ? <Check size={14} aria-label="Complete" /> : index + 1}</span>{item.title}<span className="setup-step-state">{item.done ? "Complete" : index === next ? "Next" : "Upcoming"}</span><ArrowRight size={14} aria-hidden /></Link></li>)}</ol></details>
  </section>;
}
