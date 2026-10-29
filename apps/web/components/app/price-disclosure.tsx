"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import styles from "./price-check.module.css";

export function PriceDisclosure({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reduce = useReducedMotion();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const revealAnchor = () => {
      let target: HTMLElement | null = null;
      try { target = document.getElementById(decodeURIComponent(window.location.hash.slice(1))); } catch { return; }
      if (!target || !document.getElementById(id)?.contains(target)) return;
      setOpen(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => target?.scrollIntoView({ block: "start" }), reduce ? 0 : 230);
    };
    revealAnchor();
    window.addEventListener("hashchange", revealAnchor);
    return () => { window.removeEventListener("hashchange", revealAnchor); if (timer) clearTimeout(timer); };
  }, [id, reduce]);
  return <section className={styles.disclosure}>
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}><span><strong>{title}</strong>{description && <small>{description}</small>}</span><motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: reduce ? 0 : .18 }}><ChevronDown size={16} /></motion.span></button>
    <motion.div id={id} initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={{ duration: reduce ? 0 : .2 }} className={styles.disclosureBody} aria-hidden={!open} inert={!open}><div>{children}</div></motion.div>
  </section>;
}
