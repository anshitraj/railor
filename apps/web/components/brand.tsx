/** Supplied Railor artwork, shared by navigation, authentication and feedback. */
export function RailorMark({ size = 22 }: { size?: number }) {
  const lift = Math.round(size * 0.16);
  return <span aria-hidden className="railor-mark relative inline-block shrink-0" style={{ width: size, height: size, marginRight: lift }}>
    <span className="absolute inset-0 rounded-[24%] bg-[var(--color-orange)]" style={{ transform: `translate(${lift}px, ${lift}px)` }} />
    <span className="relative flex h-full w-full items-center justify-center rounded-[24%] bg-[var(--color-brand)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- bundled same-origin brand artwork */}
      <img src="/brand/railor-r.png" alt="" width={250} height={320} className="h-[72%] w-auto" />
    </span>
  </span>;
}

export function RailorBrand({ size = 28 }: { size?: number }) {
  return <span className="inline-flex items-center gap-2.5"><RailorMark size={size} /><span className="font-display text-[21px] font-bold tracking-[-0.05em]">Railor</span></span>;
}
