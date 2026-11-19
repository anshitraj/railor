"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, CornerDownLeft, Slash } from "lucide-react";
import { RailorMark } from "../brand";
import type { ChatMessage } from "../../lib/agent-history";
import type { AgentCommand } from "../../lib/agent-commands";
import styles from "./agent-chat.module.css";

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * One chat turn. The user's words sit in a bubble on the right; Railor answers
 * full width on the left, like any chat app. New turns rise in; answers show
 * tappable follow-ups instead of asking you to type them.
 */
export function AgentMessage({ message, onChip, disabled, fresh }: { message: ChatMessage; onChip: (text: string) => void; disabled: boolean; fresh: boolean }) {
  const reduce = useReducedMotion();
  const agent = message.role === "agent";
  const answer = message.answer;
  return (
    <motion.div
      className={styles.message}
      data-role={message.role}
      initial={fresh && !reduce ? { opacity: 0, y: 10, scale: agent ? 1 : 0.98 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: EASE }}
      style={{ transformOrigin: agent ? "left top" : "right bottom" }}
    >
      {agent ? <span className={styles.author}><RailorMark size={22} />Railor</span> : null}
      <div className={styles.body}>
        {answer ? (
          <>
            <h3>{answer.title}</h3>
            <div className="agent-answer-lines">{answer.lines.map((line, index) => <p key={index}>{line}</p>)}</div>
            {answer.reasonCodes.length ? <p className="agent-reason-codes">{answer.reasonCodes.join(" · ")}</p> : null}
            {answer.links?.length ? (
              <div className={styles.answerLinks}>
                {answer.links.map((link) => <Link key={link.href} href={link.href} className={`${styles.answerLink} press`}>{link.label}<ArrowUpRight size={14} aria-hidden /></Link>)}
              </div>
            ) : null}
            {answer.chips?.length ? (
              <div className={styles.chips}>
                {answer.chips.map((chip, index) => (
                  <motion.button
                    key={chip}
                    type="button"
                    className={styles.chip}
                    data-command={chip.startsWith("/") || undefined}
                    disabled={disabled}
                    onClick={() => onChip(chip)}
                    initial={fresh && !reduce ? { opacity: 0, y: 6 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.26, ease: EASE, delay: 0.12 + index * 0.05 }}
                  >
                    {chip.startsWith("/") ? <Slash size={12} aria-hidden /> : null}
                    {chip.startsWith("/") ? chip.slice(1) : chip}
                  </motion.button>
                ))}
              </div>
            ) : null}
          </>
        ) : <p>{message.text}</p>}
      </div>
    </motion.div>
  );
}

const PHASES = ["Reading your request", "Checking providers", "Applying your rules", "Weighing the evidence"];

/** What the agent is doing while it works, so a wait never looks frozen. */
export function AgentWorking() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setPhase((value) => (value + 1) % PHASES.length), 1400);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <motion.div className={styles.working} role="status" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: EASE }}>
      <span className={styles.workingMark} aria-hidden><RailorMark size={22} /></span>
      <span className={styles.workingText}>
        <motion.span key={phase} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>{PHASES[phase]}</motion.span>
        <span className={styles.dots} aria-hidden><i /><i /><i /></span>
      </span>
    </motion.div>
  );
}

/** The "/" menu above the composer. */
export function CommandMenu({ commands, active, onPick, onHover }: { commands: AgentCommand[]; active: number; onPick: (command: AgentCommand) => void; onHover: (index: number) => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={styles.commandMenu} role="listbox" id="agent-commands" aria-label="Commands"
      initial={reduce ? false : { opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18, ease: EASE }}>
      {commands.map((command, index) => (
        <button key={command.name} type="button" role="option" id={`agent-command-${index}`} aria-selected={index === active} className={styles.commandItem}
          onMouseEnter={() => onHover(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(command)}>
          <code>{command.name}</code><span>{command.hint}</span>{index === active ? <CornerDownLeft size={13} aria-hidden /> : null}
        </button>
      ))}
    </motion.div>
  );
}
