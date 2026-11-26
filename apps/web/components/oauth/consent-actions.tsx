"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import styles from "./oauth.module.css";

/**
 * Sends the answer to Railor, then follows the redirect it returns. A form
 * post can't do this: the page's CSP only lets forms submit to Railor itself.
 */
export function ConsentActions({ query, host, canApprove }: { query: string; host: string; canApprove: boolean }) {
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState("");

  async function answer(decision: "approve" | "deny") {
    setPending(decision);
    setError("");
    try {
      const response = await fetch("/oauth/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, decision }) });
      const body = (await response.json().catch(() => ({}))) as { redirect?: string; error?: string };
      if (!response.ok || !body.redirect) throw new Error(body.error ?? "Railor couldn’t finish this. Try connecting again from the app.");
      window.location.assign(body.redirect);
    } catch (problem) {
      setError((problem as Error).message);
      setPending(null);
    }
  }

  return (
    <div className={styles.actions}>
      {canApprove ? (
        <button type="button" className={styles.approve} disabled={pending !== null} onClick={() => answer("approve")}>
          {pending === "approve" ? <><Loader2 size={16} className={styles.spin} aria-hidden />Returning to {host}…</> : "Approve and connect"}
        </button>
      ) : null}
      <button type="button" className={styles.cancel} disabled={pending !== null} onClick={() => answer("deny")}>
        {pending === "deny" ? "Cancelling…" : "Cancel"}
      </button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}
