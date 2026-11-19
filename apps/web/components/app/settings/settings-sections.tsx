"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { updateProfileName } from "../../../app/app/settings/actions";
import { toast } from "../../toast";
import styles from "./settings.module.css";

export const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "dashboard", label: "Dashboard" },
  { id: "team", label: "Team" },
  { id: "plan", label: "Plan" },
  { id: "notifications", label: "Notifications" },
  { id: "connections", label: "Connections" },
  { id: "developers", label: "Developers" },
  { id: "account", label: "Account" },
] as const;

/**
 * The section menu: a sticky list on the left on desktop, a sideways pill bar on
 * phones. The highlight follows the section you're reading.
 */
export function SettingsNav() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<string>("profile");
  useEffect(() => {
    const sections = SETTINGS_SECTIONS.map((section) => document.getElementById(section.id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: "-20% 0px -65% 0px" });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  return (
    <nav className={styles.nav} aria-label="Settings sections">
      {SETTINGS_SECTIONS.map((section) => (
        <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? "true" : undefined} onClick={() => setActive(section.id)}>
          {active === section.id ? <motion.span layoutId="settings-nav" className={styles.navPill} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }} /> : null}
          <span className={styles.navText}>{section.label}</span>
        </a>
      ))}
    </nav>
  );
}

/** Your display name, saved on its own. */
export function ProfileNameForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [pending, start] = useTransition();
  const dirty = name.trim() !== saved && name.trim().length > 0;
  return (
    <form className={styles.inline} onSubmit={(event) => {
      event.preventDefault();
      start(async () => {
        const result = await updateProfileName(name);
        if (result.ok) { setSaved(name.trim()); toast.success("Name saved"); }
        else toast.error("Couldn’t save your name", result.error);
      });
    }}>
      <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Your name" aria-label="Your name" autoComplete="name" />
      <button type="submit" className={styles.button} disabled={pending || !dirty}>
        {pending ? "Saving…" : !dirty && saved ? <><Check size={14} aria-hidden />Saved</> : "Save"}
      </button>
    </form>
  );
}
