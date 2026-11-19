"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Camera, Check, Trash2 } from "lucide-react";
import { updateProfileName, updateProfilePhoto } from "../../../app/app/settings/actions";
import { UserAvatar } from "../user-avatar";
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

const PHOTO_SIZE = 160;

/** Crops the picked image to a centred square and shrinks it to 160px, in the browser. */
async function squarePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIZE; canvas.height = PHOTO_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
}

/** Your photo, with Change and (for an uploaded one) Remove. */
export function ProfilePhoto({ initial, name, email }: { initial: string | null; name: string | null; email: string }) {
  const [photo, setPhoto] = useState(initial);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const uploaded = Boolean(photo?.startsWith("data:"));
  const save = (next: string | null, done: string) => start(async () => {
    const result = await updateProfilePhoto(next);
    if (result.ok) { setPhoto(next); toast.success(done); }
    else toast.error("Couldn’t save your photo", result.error);
  });
  return (
    <div className={styles.photo}>
      <button type="button" className={styles.photoButton} onClick={() => input.current?.click()} disabled={pending} aria-label="Change profile photo">
        <UserAvatar src={photo} name={name} email={email} size={72} />
        <span className={styles.photoCamera} aria-hidden><Camera size={14} /></span>
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (file.size > 10_000_000) { toast.error("That image is too large", "Pick one under 10 MB."); return; }
        try { save(await squarePhoto(file), "Photo updated"); }
        catch { toast.error("Couldn’t read that image", "Try a JPG, PNG or WebP."); }
      }} />
      <div className={styles.photoActions}>
        <button type="button" className={styles.buttonGhost} onClick={() => input.current?.click()} disabled={pending}><Camera size={14} aria-hidden />{pending ? "Saving…" : "Change photo"}</button>
        {uploaded ? <button type="button" className={styles.textButton} onClick={() => save(null, "Photo removed")} disabled={pending}><Trash2 size={13} aria-hidden />Remove</button> : null}
      </div>
    </div>
  );
}
