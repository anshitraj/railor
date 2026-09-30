import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionLabel } from "@railor/ui";
import { ChangeFeed } from "../../../components/app/change-feed";
import { loadFeedItems } from "../../../lib/change-feed";

export const metadata = { title: "Change feed" };
export const dynamic = "force-dynamic";

export default async function PublicChangesPage() {
  const { items, now, providersMonitored } = await loadFeedItems(60);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <SectionLabel>Change feed</SectionLabel>
        <h1 className="max-w-3xl font-display text-[clamp(2rem,4.5vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.04em]">
          Financial infrastructure changes. Railor keeps track.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--color-muted)]">
          Sources are snapshotted, normalized values are diffed, and material changes are held for human review before they alter published capability data.
        </p>
      </div>

      <ChangeFeed items={items} providerBase="/providers" now={now} providersMonitored={providersMonitored} />

      <section className="product-dark flex flex-wrap items-center gap-4 p-6 sm:p-8">
        <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="font-display text-[22px] font-semibold leading-tight">Know before your integration breaks.</p>
          <p className="text-[13.5px] text-white/65">Watch a provider, corridor or country — Railor alerts you the moment one of these changes touches it.</p>
        </div>
        <Link href="/login?intent=start" className="relative z-10 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-bold text-[#22211f] transition hover:bg-[#ffad8c]">
          Monitor my rails <ArrowRight size={15} />
        </Link>
      </section>
    </div>
  );
}
