"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import { FileCheck2, FileText, Loader2, ShieldCheck, Sparkles, X } from "lucide-react";
import styles from "./company-tools.module.css";

/** What one payslip contributes: three figures, labelled with its file name. */
export interface PayslipFigures { label: string; netPay: string | null; currency: string | null; country: string | null; warnings: string[] }

const TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 10;
// These mean no later file can be read either.
const STOP = new Set([401, 403, 429, 503]);

class ReadError extends Error { constructor(message: string, public status: number) { super(message); } }

/**
 * Consent-first payslip import, on the invoice-upload pattern. Nothing is
 * sent until the box is ticked; each file then goes to Google Gemini once,
 * with no search tools, and is not stored. Only the net pay, its currency and
 * the country come back, and they stay in this browser. Rows are labelled with
 * the file name, so no name is read from the payslip.
 */
export function PayslipImport({ aiEnabled, sharedDemo, canUpload, onImported, onClose }: {
  aiEnabled: boolean; sharedDemo: boolean; canUpload: boolean;
  onImported: (figures: PayslipFigures[]) => void; onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [reading, setReading] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const blocked = !aiEnabled || !canUpload;
  const busy = reading !== null;

  const choose = (list: FileList | File[] | null | undefined) => {
    setConsent(false); setMessage(null);
    const chosen = [...(list ?? [])];
    const valid = chosen.filter((file) => TYPES.includes(file.type) && file.size <= MAX_BYTES).slice(0, MAX_FILES);
    setFiles(valid);
    const left = chosen.length - valid.length;
    if (left) setMessage({ text: `${left} ${left === 1 ? "file" : "files"} left out. Choose PDF, PNG or JPEG payslips up to 4 MB, ${MAX_FILES} at a time.`, error: true });
    if (input.current) input.current.value = "";
  };
  const drop = (event: DragEvent) => {
    event.preventDefault(); setDragging(false);
    if (!blocked && !busy) choose(event.dataTransfer.files);
  };

  async function read() {
    if (!files.length || !consent || blocked || busy) return;
    setMessage(null);
    const figures: PayslipFigures[] = [];
    const failed: string[] = [];
    let lastError = "";
    for (const [index, file] of files.entries()) {
      setReading(index);
      try {
        const data = new FormData(); data.set("file", file); data.set("consent", "true");
        const response = await fetch("/api/payroll/extract", { method: "POST", body: data });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new ReadError(body.error ?? "Couldn’t read this payslip.", response.status);
        const proposal = body.proposal as Omit<PayslipFigures, "label">;
        figures.push({ label: file.name.replace(/\.(pdf|png|jpe?g)$/i, ""), netPay: proposal.netPay, currency: proposal.currency, country: proposal.country, warnings: proposal.warnings ?? [] });
      } catch (error) {
        failed.push(file.name);
        lastError = error instanceof Error ? error.message : "Couldn’t read this payslip.";
        if (error instanceof ReadError && STOP.has(error.status)) { failed.push(...files.slice(index + 1).map((rest) => rest.name)); break; }
      }
    }
    setReading(null);
    setFiles([]); setConsent(false);
    if (figures.length) onImported(figures);
    const notes = figures.flatMap((figure) => figure.warnings.slice(0, 1).map((warning) => `${figure.label}: ${warning}`)).slice(0, 3);
    const done = figures.length ? `Read ${figures.length} ${figures.length === 1 ? "payslip" : "payslips"}. Check each net pay in the table before you rely on it.` : "";
    const missed = failed.length ? `${failed.length === 1 ? failed[0] : `${failed.length} payslips`} not read: ${lastError}` : "";
    setMessage({ text: [done, ...notes, missed].filter(Boolean).join(" "), error: !figures.length });
  }

  if (sharedDemo) {
    return (
      <div className={styles.slot}>
        <div className={styles.slotHead}><span className={styles.slotIcon}><ShieldCheck size={18} aria-hidden /></span><div><h2>Keep payslips in your own workspace</h2><p>This demo is shared. Try the example sheet here, or <Link href="/login">create your own workspace</Link> to import payslips.</p></div></div>
        <div className={styles.actions}><span className={styles.grow} /><button type="button" className={`${styles.ghost} press`} onClick={onClose}>Close</button></div>
      </div>
    );
  }

  return (
    <section className={styles.slot} data-dragging={dragging || undefined} aria-label="Import payslips"
      onDragOver={(event) => { event.preventDefault(); if (!blocked && !busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
      <div className={styles.slotHead}>
        <span className={styles.slotIcon}><FileText size={18} aria-hidden /></span>
        <div><h2>Import payslips</h2><p>Railor reads only the net pay, its currency and the country. Rows are named after each file; no name or ID is read.</p></div>
        <span className={styles.grow} />
        <button type="button" className={styles.iconButton} aria-label="Close payslip import" disabled={busy} onClick={onClose}><X size={16} aria-hidden /></button>
      </div>
      <input ref={input} type="file" multiple className="sr-only" accept="application/pdf,image/png,image/jpeg" aria-label="Choose payslips" disabled={blocked || busy} onChange={(event) => choose(event.target.files)} />
      {files.length ? (
        <ul className={styles.fileList}>
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              {reading === index ? <Loader2 size={15} className={styles.spin} aria-hidden /> : <FileCheck2 size={15} aria-hidden />}
              <strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
              <button type="button" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => choose(files.filter((_, other) => other !== index))}><X size={14} aria-hidden /></button>
            </li>
          ))}
        </ul>
      ) : (
        <button type="button" className={`${styles.drop} press`} disabled={blocked} onClick={() => input.current?.click()}>
          <strong>Drop payslips here, or browse</strong>
          <small>PDF, PNG or JPEG · up to 4 MB each · {MAX_FILES} at a time</small>
        </button>
      )}
      {blocked ? <p className={styles.muted}>{!canUpload ? "Your workspace role can price payroll but can’t upload documents." : "Payslip reading isn’t set up here. Add each person’s net pay to a sheet instead."}</p> : null}
      {files.length && !blocked ? (
        <label className={styles.consent}>
          <input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />
          <span>I agree to send {files.length === 1 ? "this payslip" : `these ${files.length} payslips`} to Google Gemini to read the net pay, currency and country. Railor keeps only those figures, in this browser, and doesn’t store the {files.length === 1 ? "file" : "files"}.</span>
        </label>
      ) : null}
      {files.length ? (
        <div className={styles.actions}>
          <button type="button" className={`${styles.ghost} press`} disabled={busy} onClick={() => input.current?.click()}>Choose others</button>
          <span className={styles.grow} />
          <button type="button" className={`${styles.primary} press`} disabled={!consent || blocked || busy} onClick={read}>
            {busy ? <Loader2 size={15} className={styles.spin} aria-hidden /> : <Sparkles size={15} aria-hidden />}
            {busy ? `Reading ${reading! + 1} of ${files.length}…` : `Read ${files.length === 1 ? "payslip" : `${files.length} payslips`}`}
          </button>
        </div>
      ) : null}
      {message ? <p role={message.error ? "alert" : "status"} className={styles.message} data-error={message.error || undefined}>{message.text}</p> : null}
    </section>
  );
}
