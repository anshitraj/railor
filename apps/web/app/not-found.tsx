import Link from "next/link";
import { RailorMark } from "../components/marketing/nav";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main id="main" className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--color-paper)] px-4 py-16">
      <div className="rail-map-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <svg className="pointer-events-none absolute inset-x-0 top-1/2 h-40 w-full -translate-y-1/2 opacity-70" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden>
        <path d="M0 80 C 240 20, 420 140, 600 80" fill="none" stroke="var(--color-orange)" strokeWidth="2" strokeDasharray="6 6" style={{ animation: "railor-route-dash 1.2s linear infinite" }} />
        <path d="M600 80 C 780 20, 960 140, 1200 80" fill="none" stroke="var(--color-line-strong)" strokeWidth="2" strokeDasharray="2 10" />
        <circle cx="600" cy="80" r="7" fill="var(--color-paper)" stroke="var(--color-orange)" strokeWidth="2" />
      </svg>
      <div className="relative flex max-w-md flex-col items-center gap-4 text-center">
        <RailorMark size={40} />
        <p className="text-[14px] font-semibold text-[var(--color-orange-deep)]">Error 404</p>
        <h1 className="text-[clamp(2.2rem,6vw,3.2rem)] font-[650] leading-[1.02] tracking-[-0.035em]">
          This page doesn&apos;t exist.
        </h1>
        <p className="text-[15px] leading-relaxed text-[var(--color-muted)]">
          It may have moved, or the link was mistyped. Here are the places most people are looking for.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href="/" className="rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#2a2722]">
            Back to home
          </Link>
          <Link href="/prices" className="rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-5 py-2.5 text-[14px] font-semibold transition hover:border-[var(--color-ink)]">
            Compare prices
          </Link>
          <Link href="/providers" className="rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-5 py-2.5 text-[14px] font-semibold transition hover:border-[var(--color-ink)]">
            Browse providers
          </Link>
        </div>
      </div>
    </main>
  );
}
