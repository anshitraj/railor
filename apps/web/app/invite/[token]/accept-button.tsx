"use client";

import { useState, useTransition } from "react";
import { acceptInvitation } from "./actions";

export function AcceptInviteButton({ token, organizationName }: { token: string; organizationName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const result = await acceptInvitation(token);
            if (result && !result.ok) setError(result.error);
          })
        }
        className="w-fit rounded-full bg-[var(--color-orange)] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[var(--color-orange-deep)] disabled:opacity-60"
      >
        {pending ? "Joining…" : `Join ${organizationName}`}
      </button>
      {error ? <p role="alert" className="text-[13px] text-[var(--color-bad)]">{error}</p> : null}
    </div>
  );
}
