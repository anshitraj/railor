"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import { FileCheck2, FileText, Loader2, ShieldCheck, Sparkles, UploadCloud, X } from "lucide-react";
import styles from "./freelancer-workspace.module.css";

export function DocumentUpload({ kind, aiEnabled, disabled, sharedDemo, onProposal, onBusyChange }: {
  kind: "invoice" | "receipt"; aiEnabled: boolean; disabled: boolean; sharedDemo: boolean;
  onProposal: (value: Record<string, unknown>) => void; onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const unavailable = disabled || busy || !aiEnabled;
  const choose = (value: File | null) => {
    setConsent(false); setMessage(""); setFailed(false);
    if (value && (value.size > 4 * 1024 * 1024 || !["application/pdf", "image/png", "image/jpeg"].includes(value.type))) {
      setFile(null); setMessage("Choose a PDF, PNG or JPEG file no larger than 4 MB."); setFailed(true); return;
    }
    setFile(value);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault(); setDragging(false);
    if (!unavailable) choose(event.dataTransfer.files[0] ?? null);
  };
  async function extract() {
    if (!file || !consent || unavailable) return;
    setMessage(""); setFailed(false); setBusy(true); onBusyChange(true);
    try {
      const data = new FormData(); data.set("file", file); data.set("consent", "true"); data.set("kind", kind);
      const response = await fetch("/api/freelancer/extract", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "We couldn't read this file. Enter the details manually or try another file.");
      onProposal(result.proposal);
      setMessage(`Details extracted. Review every field before saving. ${(result.proposal.warnings ?? []).join(" ")}`);
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Extraction failed. You can still enter the details manually."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  if (sharedDemo) return <div className={styles.notice}><ShieldCheck size={18} /><div><strong>Keep private documents in your own workspace</strong><p>This demo is shared. Use fictional details here, or <Link href="/login">create your own workspace</Link> to upload an invoice.</p></div></div>;
  return <div className={styles.upload}>
    <div className={styles.uploadHeading}><span><UploadCloud size={15} />Import {kind}</span><button type="button" className={styles.extractButton} disabled={!file || !consent || unavailable} onClick={extract}>{busy ? <Loader2 size={13} className={styles.spin} /> : <Sparkles size={13} />}{busy ? "Reading document…" : "Extract details"}</button></div>
    <div className={styles.dropzone} data-dragging={dragging && !unavailable} onDragOver={(e) => { e.preventDefault(); if (!unavailable) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
      <input ref={input} className="sr-only" type="file" aria-label={`Upload ${kind} file`} accept="application/pdf,image/png,image/jpeg" disabled={unavailable} onChange={(e) => choose(e.target.files?.[0] ?? null)} />
      {file ? <div className={styles.selectedFile}><span><FileCheck2 size={24} /></span><div><strong>{file.name}</strong><p>{(file.size / 1024).toFixed(0)} KB · Ready to extract</p></div><button type="button" aria-label={`Remove ${kind} file`} disabled={disabled || busy} onClick={() => { choose(null); if (input.current) input.current.value = ""; }}><X size={16} /></button></div> : <button type="button" className={styles.browse} disabled={unavailable} onClick={() => input.current?.click()} aria-label={`Browse ${kind} file`}><span className={styles.uploadIcon}><FileText size={23} /></span><strong>Drop your {kind} here or <span>browse</span></strong><small>PDF, PNG or JPEG · up to 4 MB</small></button>}
      <div className={styles.aiHint}><Sparkles size={14} /><p>{aiEnabled ? "AI fills the details. You review and confirm before anything is saved." : "Automatic extraction is unavailable. Enter your details below to continue."}</p></div>
    </div>
    {file && <label className={styles.consent}><input type="checkbox" checked={consent} disabled={busy || disabled} onChange={(e) => setConsent(e.target.checked)} /><span>I agree to send this {kind} to Google Gemini for extraction. Railor saves reviewed fields only and does not retain the uploaded file.</span></label>}
    {message && <p role={failed ? "alert" : "status"} className={styles.uploadMessage} data-error={failed}>{message}</p>}
  </div>;
}
