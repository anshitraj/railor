import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { BENEFICIARIES_UNAVAILABLE_MESSAGE } from "../../../lib/product-features";

export function BeneficiariesUnavailable() {
  return <section className="product-panel p-6 sm:p-8" aria-labelledby="beneficiaries-unavailable-title">
    <LockKeyhole size={25} className="mb-5 text-[var(--color-orange-deep)]" />
    <span className="product-index">CURRENTLY UNAVAILABLE</span>
    <h1 id="beneficiaries-unavailable-title" className="mt-2 font-display text-3xl tracking-tight">Recipient accounts are paused.</h1>
    <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">{BENEFICIARIES_UNAVAILABLE_MESSAGE}</p>
    <div className="mt-6 flex flex-wrap gap-3"><Link className="comparison-primary-action" href="/app/prices">Compare prices <ArrowRight size={14} /></Link><Link className="comparison-secondary-action" href="/app/routing?tab=preview">Preview a route</Link></div>
  </section>;
}
