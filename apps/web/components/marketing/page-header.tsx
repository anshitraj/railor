import { SectionLabel, cn } from "@railor/ui";

/**
 * Masthead shared by the public content pages: eyebrow, display headline and an
 * optional lede. One definition so every page opens with the same rhythm.
 */
export function PageHeader({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <SectionLabel>{eyebrow}</SectionLabel>
      <h1 className="max-w-4xl text-balance font-display text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-[1.04] tracking-[-0.04em]">
        {title}
      </h1>
      {children ? (
        <div className="flex max-w-2xl flex-col gap-3 text-[15px] leading-relaxed text-[var(--color-muted)]">{children}</div>
      ) : null}
    </header>
  );
}
