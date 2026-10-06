"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, cn } from "@railor/ui";
import { adminReconcileAction, resolveUnknownAction, setOrgLiveAction, setPaymentsPausedAction, setProviderLiveAction } from "../../app/admin/payments-actions";
import { NumberWithPresets, PresetChip, Toggle } from "../app/form-kit";

function useAdminAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const router = useRouter();
  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      setError("");
      setDone("");
      const r = await work();
      if (!r.ok) setError(r.error ?? "Failed.");
      else {
        setDone(success);
        router.refresh();
      }
    });
  return { pending, error, done, run };
}

function Feedback({ error, done }: { error: string; done: string }) {
  if (error) return <p role="alert" className="text-[12.5px] text-[var(--color-bad)]">{error}</p>;
  if (done) return <p role="status" className="text-[12.5px] text-[var(--color-ok)]">{done}</p>;
  return null;
}

export function KillSwitch({ paused, reason }: { paused: boolean; reason: string | null }) {
  const [note, setNote] = useState(reason ?? "");
  const a = useAdminAction();
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border p-5", paused ? "border-[var(--color-bad)]/40 bg-[var(--color-bad-bg)]" : "border-[var(--color-line)] bg-[var(--color-surface)]")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("size-3 rounded-full", paused ? "bg-[var(--color-bad)]" : "bg-[var(--color-ok)]")} aria-hidden />
        <p className="text-[15px] font-semibold">{paused ? "Payments are paused" : "Payments are running"}</p>
      </div>
      <p className="text-[12.5px] text-[var(--color-muted)]">
        Pausing stops every new submission across all workspaces immediately (test and live). Payments already with a provider keep settling and reconciling.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason shown to every workspace"
          maxLength={200}
          className="min-w-[240px] flex-1 rounded-full border border-[var(--color-line)] bg-white px-4 py-2 text-[13px] outline-none focus:border-[var(--color-orange)]"
        />
        <Button variant={paused ? "primary" : "danger"} disabled={a.pending} onClick={() => a.run(() => setPaymentsPausedAction(!paused, note), paused ? "Payments resumed." : "Payments paused.")}>
          {paused ? "Resume payments" : "Pause all payments"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["Provider incident", "Reconciliation backlog", "Security review"].map((r) => (
          <PresetChip key={r} active={note === r} onClick={() => setNote(r)}>
            {r}
          </PresetChip>
        ))}
      </div>
      <Feedback error={a.error} done={a.done} />
    </div>
  );
}

export function ProviderLiveToggle({ slug, approved, sandboxEvidence }: { slug: string; approved: boolean; sandboxEvidence: string }) {
  const [note, setNote] = useState("");
  const a = useAdminAction();
  return (
    <div className="flex flex-col gap-2">
      {!approved ? (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={`Evidence, e.g. "${sandboxEvidence}"`}
          className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-1.5 text-[12.5px] outline-none focus:border-[var(--color-orange)]"
        />
      ) : null}
      <div className="flex items-center gap-2">
        <Button size="sm" variant={approved ? "secondary" : "primary"} disabled={a.pending} onClick={() => a.run(() => setProviderLiveAction(slug, !approved, note || "Revoked by operator"), approved ? "Live payouts revoked." : "Approved for live payouts.")}>
          {approved ? "Revoke live" : "Approve for live"}
        </Button>
        {!approved ? (
          <PresetChip active={note === sandboxEvidence} onClick={() => setNote(sandboxEvidence)}>
            Use sandbox evidence
          </PresetChip>
        ) : null}
      </div>
      <Feedback error={a.error} done={a.done} />
    </div>
  );
}

export function OrgLiveEditor({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: { liveEnabled: boolean; maxPaymentAmount: number | null; dailyPaymentAmount: number | null; note: string };
}) {
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(false);
  const a = useAdminAction();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-[var(--color-line)] px-3 py-1 text-[12px] font-semibold hover:border-[var(--color-line-strong)]">
        {initial.liveEnabled ? "Edit live access" : "Enable live…"}
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4">
      <Toggle label="Live payments enabled" hint="Real money through this workspace's production connections." checked={state.liveEnabled} onChange={(v) => setState((s) => ({ ...s, liveEnabled: v }))} />
      <div className="grid gap-4 md:grid-cols-2">
        <NumberWithPresets label="Per-payment limit" value={state.maxPaymentAmount ?? undefined} onChange={(v) => setState((s) => ({ ...s, maxPaymentAmount: v ?? null }))} presets={[{ value: 1_000, label: "1K" }, { value: 10_000, label: "10K" }, { value: 100_000, label: "100K" }]} offLabel="No limit" />
        <NumberWithPresets label="Rolling 24h limit" value={state.dailyPaymentAmount ?? undefined} onChange={(v) => setState((s) => ({ ...s, dailyPaymentAmount: v ?? null }))} presets={[{ value: 10_000, label: "10K" }, { value: 100_000, label: "100K" }, { value: 1_000_000, label: "1M" }]} offLabel="No limit" />
      </div>
      <label className="flex flex-col gap-1 text-[12px] font-bold text-[var(--color-ink-soft)]">
        Review note (audited)
        <textarea value={state.note} onChange={(e) => setState((s) => ({ ...s, note: e.target.value }))} rows={2} className="product-field !mt-0 font-normal" placeholder="KYB reviewed on …; provider accounts verified …" />
      </label>
      <div className="flex gap-2">
        <Button size="sm" disabled={a.pending} onClick={() => a.run(() => setOrgLiveAction(organizationId, state), "Saved.")}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <Feedback error={a.error} done={a.done} />
    </div>
  );
}

export function UnknownPaymentResolver({ paymentId }: { paymentId: string }) {
  const [note, setNote] = useState("");
  const a = useAdminAction();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" disabled={a.pending} onClick={() => a.run(() => adminReconcileAction(paymentId), "Asked the provider again.")}>
          Reconcile now
        </Button>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the provider dashboard shows (required to resolve)" className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-1.5 text-[12px]" />
      <div className="flex gap-1.5">
        <Button size="sm" disabled={a.pending || note.trim().length < 10} title={note.trim().length < 10 ? "Describe what the provider dashboard shows first (10+ characters)" : undefined} onClick={() => a.run(() => resolveUnknownAction(paymentId, "completed", note), "Marked completed.")}>
          Mark completed
        </Button>
        <Button size="sm" variant="danger" disabled={a.pending || note.trim().length < 10} title={note.trim().length < 10 ? "Describe what the provider dashboard shows first (10+ characters)" : undefined} onClick={() => a.run(() => resolveUnknownAction(paymentId, "failed", note), "Marked failed.")}>
          Mark failed
        </Button>
      </div>
      <Feedback error={a.error} done={a.done} />
    </div>
  );
}
