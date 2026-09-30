/** Route-level skeleton for every workspace page: layout lands first, data fills in. */
export default function WorkspaceLoading() {
  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-3 border-b border-[var(--color-line)] pb-6">
        <div className="skeleton h-3 w-32" />
        <div className="skeleton h-10 w-[min(420px,80%)]" />
        <div className="skeleton h-4 w-[min(560px,90%)]" />
      </div>
      <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 bg-[var(--color-surface)] p-5">
            <div className="skeleton h-7 w-14" />
            <div className="skeleton h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <div className="skeleton h-3 w-40" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-12 w-full" style={{ opacity: 1 - i * 0.14 }} />
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <div className="skeleton h-3 w-28" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 w-full" style={{ opacity: 1 - i * 0.2 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
