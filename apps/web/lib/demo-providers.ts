/**
 * The seeded demo providers are synthetic (their "sources" point at a host that does not exist). The directory
 * already leaves them out; in production a direct link to one is also a 404 rather than a page of dead sources.
 * Set RAILOR_SHOW_DEMO=true to show them (local demos, screenshots).
 */
export function hideDemoProvider(isDemo: boolean): boolean {
  return isDemo && process.env.NODE_ENV === "production" && process.env.RAILOR_SHOW_DEMO !== "true";
}
