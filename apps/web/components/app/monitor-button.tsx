"use client";

import { useState, useTransition } from "react";
import { Button } from "@railor/ui";
import { monitorProvider } from "../../app/app/corridors/actions";

/** One click from "interesting provider" to "tell me when it changes". */
export function MonitorProviderButton({ slug, name }: { slug: string; name: string }) {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      disabled={pending || done}
      onClick={() =>
        startTransition(async () => {
          const res = await monitorProvider(slug, name);
          if (res.ok) setDone(true);
        })
      }
    >
      {done ? "Monitoring ✓" : "Monitor provider"}
    </Button>
  );
}
