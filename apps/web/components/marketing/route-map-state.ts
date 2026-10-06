export interface RouteMapStats {
  checked: number;
  supported: number;
  partial: number;
  topConfidence: number | null;
  evidenceCount: number;
}

export function routeMapState(stats: RouteMapStats | null): {
  eyebrow: string; title: string; description: string; tone: "good" | "warn" | "muted" | "pending";
} {
  if (!stats) return { eyebrow: "Route analysis", title: "Checking the live provider index", description: "Matching the entity, asset, network and payout rail.", tone: "pending" };
  if (stats.supported > 0) return { eyebrow: "Verified coverage", title: `${stats.supported} ${stats.supported === 1 ? "provider matches" : "providers match"}`, description: "The complete route is backed by current provider evidence.", tone: "good" };
  if (stats.partial > 0) return { eyebrow: "Conditional coverage", title: `${stats.partial} ${stats.partial === 1 ? "route needs" : "routes need"} more KYB`, description: "The corridor may work after additional entity verification.", tone: "warn" };
  if (stats.checked > 0) return { eyebrow: "Coverage gap", title: "No verified end-to-end route", description: `None of ${stats.checked} indexed providers currently verify every leg.`, tone: "muted" };
  return { eyebrow: "Index unavailable", title: "This route has not been evaluated", description: "Provider coverage could not be loaded for this corridor.", tone: "muted" };
}
