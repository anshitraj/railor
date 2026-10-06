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
    <header className={cn("railor-rise flex flex-col gap-4 border-b border-[var(--color-line-strong)] pb-7", className)}>
      <SectionLabel className="product-eyebrow mb-0">{eyebrow}</SectionLabel>
      <h1 className="max-w-4xl text-balance font-display text-[clamp(2.2rem,4.5vw,3.6rem)] font-semibold leading-[1.04] tracking-[-0.045em]">
        {title}
      </h1>
      {children ? (
        <div className="flex max-w-2xl flex-col gap-3 text-[15px] leading-relaxed text-[var(--color-muted)]">{children}</div>
      ) : null}
    </header>
  );
}
