"use client";

import { useState, useTransition } from "react";
import { updateWorkspaceName } from "../../app/app/settings/actions";

export function WorkspaceNameForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateWorkspaceName(name);
      setSaved(Boolean(res.ok));
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
        className="min-w-[220px] flex-1 rounded-full border border-[var(--color-line)] bg-white px-4 py-2 text-[14px] outline-none focus:border-[var(--color-violet)]"
        aria-label="Workspace name"
      />
      <button
        type="submit"
        disabled={pending || !name.trim() || name.trim() === initialName}
        className="rounded-full bg-[var(--color-purple)] px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-[var(--color-purple-deep)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </form>
  );
}
