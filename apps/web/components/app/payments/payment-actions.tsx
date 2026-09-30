"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Send, ShieldAlert } from "lucide-react";
import { Button } from "@railor/ui";
import { cancelPaymentAction, reconcilePaymentAction, submitPaymentAction } from "../../../app/app/payments/actions";

const OPEN = new Set(["submitting", "awaiting_funds", "processing", "unknown"]);

/**
 * The only place a person sends money. Sending is two deliberate clicks
 * (Send → Confirm), live payments name the amount in the confirmation, and
 * an open payment refreshes itself so status changes arrive without reloads.
 */
export function PaymentActions({
  id,
  status,
  mode,
  amountLabel,
  decisionId,
  canSend,
}: {
  id: string;
  status: string;
  mode: "test" | "live";
  amountLabel: string;
  decisionId: string | null;
  canSend: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  // Refresh every 5s; every third tick also ask the provider (idempotent), so a
  // payment advances even where no reconciliation scheduler runs.
  useEffect(() => {
    if (!OPEN.has(status)) return;
    let tick = 0;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      tick++;
      if (tick % 3 === 0 && canSend) await reconcilePaymentAction(id).catch(() => undefined);
      router.refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [status, router, id, canSend]);

  const act = (work: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError("");
      const result = await work();
      if (!result.ok) setError(result.error ?? "Action failed.");
      setConfirming(false);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      {status === "ready" && canSend ? (
        confirming ? (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-orange)]/40 bg-[var(--color-lavender)]/60 p-4">
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              {mode === "live" ? <ShieldAlert size={16} className="text-[var(--color-orange-deep)]" /> : null}
              {mode === "live" ? `Send ${amountLabel} for real?` : `Send ${amountLabel} in test mode?`}
            </p>
            <p className="text-[12.5px] text-[var(--color-muted)]">
              {mode === "live"
                ? "This instructs your provider to move real funds from your account. Once a provider accepts it, it cannot be cancelled from Railor."
                : "Test mode: the route runs against sandboxes or Railor's simulator. No real funds move."}
            </p>
            <div className="flex gap-2">
              <Button disabled={pending} onClick={() => act(() => submitPaymentAction(id))}>
                <Send size={14} /> {pending ? "Sending…" : "Confirm and send"}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                Not yet
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setConfirming(true)}>
              <Send size={14} /> Send {amountLabel}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => act(() => cancelPaymentAction(id))}>
              Cancel payment
            </Button>
          </div>
        )
      ) : null}

      {status === "ready" && !canSend ? <p className="text-[12.5px] text-[var(--color-muted)]">Only a workspace owner or admin can send live payments.</p> : null}

      {status === "requires_approval" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={decisionId ? `/app/decisions/${decisionId}` : "/app/approvals"} className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--color-orange-deep)]">
            Open the approval →
          </Link>
          <Button variant="secondary" disabled={pending} onClick={() => act(() => submitPaymentAction(id))}>
            I&apos;ve been approved — send
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => act(() => cancelPaymentAction(id))}>
            Cancel
          </Button>
        </div>
      ) : null}

      {status === "blocked" ? (
        <Button variant="secondary" disabled={pending} onClick={() => act(() => cancelPaymentAction(id))} className="w-fit">
          Dismiss (cancel)
        </Button>
      ) : null}

      {OPEN.has(status) ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-[12.5px] text-[var(--color-muted)]">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-orange)] opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-[var(--color-orange)]" />
            </span>
            Watching for provider updates
          </span>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => reconcilePaymentAction(id))}>
            <RefreshCw size={13} /> Check status now
          </Button>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-[12.5px] text-[var(--color-bad)]">{error}</p> : null}
    </div>
  );
}
