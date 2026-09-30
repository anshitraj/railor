import { ProductHeader } from "../../../components/app/product-ui";
import { ChangeFeed } from "../../../components/app/change-feed";
import { loadFeedItems } from "../../../lib/change-feed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Changes" };

export default async function ChangesPage() {
  const { items, now, providersMonitored } = await loadFeedItems(80);
  const pending = items.filter((i) => i.status === "pending").length;

  return (
    <div className="product-page space-y-6">
      <ProductHeader
        eyebrow="Monitor / changes"
        title="Detected changes"
        description="Everything Railor has detected across mapped providers. Material changes are held for human review before they alter published capability data."
        value={pending}
        valueLabel="awaiting review"
      />
      <ChangeFeed items={items} providerBase="/app/providers" now={now} providersMonitored={providersMonitored} />
    </div>
  );
}
