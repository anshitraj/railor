import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { goDestination } from "../../../lib/provider-go";
import { providerWordmark } from "../../../lib/provider-wordmarks";
import { GoRedirect } from "../../../components/go/go-redirect";

export const metadata: Metadata = { title: "Taking you to the provider", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const titleCase = (slug: string) => slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

export default async function GoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const destination = goDestination(slug, query);
  if (!destination) notFound();
  const key = slug.replace(/^market:/, "").toLowerCase();
  const name = providerWordmark(key)?.name ?? titleCase(key);
  return <GoRedirect slug={key} name={name} href={destination.href} />;
}
