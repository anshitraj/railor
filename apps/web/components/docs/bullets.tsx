import { cn } from "@railor/ui";

/** Docs bullet list: a route-orange dot instead of a typed "•", so wrapped lines hang cleanly. */
export function Bullets({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "flex flex-col gap-3 text-[14.5px] leading-relaxed text-[var(--color-muted)]",
        className,
      )}
    >
      {children}
    </ul>
  );
}

export function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-[0.62em] size-1.5 shrink-0 rounded-full bg-[var(--color-orange)]"
      />
      <span className="min-w-0 text-pretty">{children}</span>
    </li>
  );
}
