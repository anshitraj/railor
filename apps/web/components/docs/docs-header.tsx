/**
 * Title block shared by every docs page: mono eyebrow, display heading, lede.
 * Mirrors the public /changes header so docs read as the same product.
 */
export function DocsHeader({
  eyebrow,
  title,
  badge,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="railor-rise flex flex-col gap-4 border-b border-[var(--color-line-strong)] pb-7">
      <p className="product-eyebrow mb-0">{eyebrow}</p>
      <h1 className="flex flex-wrap items-center gap-x-4 gap-y-2 text-balance font-display text-[clamp(2.1rem,4.2vw,2.9rem)] font-semibold leading-[1.03] tracking-[-0.045em]">
        {title}
        {badge}
      </h1>
      {children ? (
        <p className="max-w-[62ch] text-pretty text-[16px] leading-[1.65] text-[var(--color-muted)]">
          {children}
        </p>
      ) : null}
    </header>
  );
}
