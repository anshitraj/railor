import { redirect } from "next/navigation";
import { buildGlobalRouteMap, loadReferenceData } from "@railor/core";
import { RankingPreset, RANKING_PRESET_LABEL } from "@railor/types";
import { getSession } from "../../../lib/auth";
import { GlobalRouteMap } from "../../../components/app/global-route-map";

export const metadata = { title: "Global route map" };
// The graph is derived from the whole capability set, which is a heavy read.
// It changes only when a capability or fee changes, so a short revalidate
// window is honest here in a way `force-dynamic` would just be slow.
export const revalidate = 300;

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");

  const { preset: presetParam } = await searchParams;
  const preset = RankingPreset.safeParse(presetParam).data ?? "balanced";

  const [map, reference] = await Promise.all([
    buildGlobalRouteMap({ preset }),
    loadReferenceData(),
  ]);

  const touched = new Set([...map.entityCountries, ...map.destinationCountries]);

  return (
    <GlobalRouteMap
      routes={map.routes}
      countries={reference.countries
        .filter((c) => touched.has(c.code))
        .map((c) => ({ code: c.code, name: c.name, flag: c.flag ?? "" }))}
      preset={preset}
      presets={RankingPreset.options.map((value) => ({
        value,
        label: RANKING_PRESET_LABEL[value],
      }))}
      providersChecked={map.providersChecked}
      cheapestOverall={map.cheapestOverall}
    />
  );
}
