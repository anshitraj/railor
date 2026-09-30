"use client";

import { ErrorView } from "../../components/error-view";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-10">
      <ErrorView error={error} reset={reset} homeHref="/app" homeLabel="Back to overview" />
    </div>
  );
}
