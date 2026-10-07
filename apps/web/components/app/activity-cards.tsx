import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Freshness } from "@railor/ui";
import { ProviderLogo } from "./provider-logo";

export function ActivityCards({ items }: { items: Array<{ id: string; providerName: string; providerSlug: string; summary: string; detectedAt: Date }> }) {
  return <ul className="overview-activity">{items.map(item => <li key={item.id}>
    <Link href="/app/changes" className="overview-activity-card">
      <ProviderLogo slug={item.providerSlug} name={item.providerName} size={36} />
      <div className="overview-activity-body">
        <div className="overview-activity-meta"><span className="overview-activity-provider">{item.providerName}</span><Freshness date={item.detectedAt} prefix="" /></div>
        <p>{item.summary}</p>
      </div>
      <ChevronRight size={16} className="overview-activity-arrow" aria-hidden />
    </Link>
  </li>)}</ul>;
}
