/**
 * Country centroids and the projection the global route map draws with.
 *
 * These are approximate population/administrative centroids, not precise
 * geographic ones: the map's job is to make a corridor legible at a glance,
 * so "the dot is clearly in Nigeria" matters and "the dot is on Nigeria's
 * exact area centroid" does not. Every country in the reference table has an
 * entry — a missing one would silently drop real routes from the map, which
 * is worse than a dot being 50km off.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Keyed by ISO 3166-1 alpha-2, matching `countries.code`. */
export const COUNTRY_CENTROIDS: Record<string, LatLng> = {
  IN: { lat: 22.0, lng: 79.0 },
  AE: { lat: 24.3, lng: 54.0 },
  US: { lat: 39.0, lng: -98.0 },
  GB: { lat: 54.0, lng: -2.0 },
  SG: { lat: 1.35, lng: 103.8 },
  NG: { lat: 9.1, lng: 8.7 },
  SA: { lat: 24.0, lng: 45.0 },
  DE: { lat: 51.2, lng: 10.4 },
  FR: { lat: 46.6, lng: 2.4 },
  NL: { lat: 52.2, lng: 5.3 },
  BR: { lat: -10.0, lng: -52.0 },
  MX: { lat: 23.6, lng: -102.5 },
  KE: { lat: 0.2, lng: 37.9 },
  ZA: { lat: -29.0, lng: 24.7 },
  PH: { lat: 12.9, lng: 122.0 },
  ID: { lat: -2.5, lng: 118.0 },
  TR: { lat: 39.0, lng: 35.2 },
  CA: { lat: 56.1, lng: -106.3 },
  AU: { lat: -25.3, lng: 133.8 },
  HK: { lat: 22.32, lng: 114.17 },
  CH: { lat: 46.8, lng: 8.2 },
  ES: { lat: 40.2, lng: -3.7 },
  IT: { lat: 42.8, lng: 12.6 },
  PT: { lat: 39.6, lng: -8.0 },
  IE: { lat: 53.1, lng: -8.2 },
  SE: { lat: 62.0, lng: 15.0 },
  NO: { lat: 64.0, lng: 12.0 },
  DK: { lat: 56.0, lng: 9.5 },
  PL: { lat: 52.0, lng: 19.1 },
  BE: { lat: 50.6, lng: 4.5 },
  QA: { lat: 25.3, lng: 51.2 },
  KW: { lat: 29.3, lng: 47.5 },
  BH: { lat: 26.05, lng: 50.55 },
  OM: { lat: 21.5, lng: 56.0 },
  IL: { lat: 31.4, lng: 35.0 },
  EG: { lat: 26.8, lng: 30.8 },
  JP: { lat: 36.2, lng: 138.3 },
  KR: { lat: 36.5, lng: 127.9 },
  CN: { lat: 35.9, lng: 104.2 },
  TW: { lat: 23.7, lng: 121.0 },
  VN: { lat: 16.0, lng: 106.0 },
  TH: { lat: 15.1, lng: 101.0 },
  MY: { lat: 4.2, lng: 102.0 },
  PK: { lat: 30.4, lng: 69.3 },
  BD: { lat: 23.7, lng: 90.4 },
  LK: { lat: 7.9, lng: 80.8 },
  NZ: { lat: -41.5, lng: 172.8 },
  GH: { lat: 7.9, lng: -1.0 },
  MA: { lat: 31.8, lng: -7.1 },
  TZ: { lat: -6.4, lng: 34.9 },
  UG: { lat: 1.4, lng: 32.3 },
  CI: { lat: 7.5, lng: -5.5 },
  SN: { lat: 14.5, lng: -14.5 },
  ET: { lat: 9.1, lng: 40.5 },
  AR: { lat: -35.0, lng: -65.2 },
  CO: { lat: 4.6, lng: -74.3 },
  CL: { lat: -35.7, lng: -71.5 },
  PE: { lat: -9.2, lng: -75.0 },
  // Added as provider research discovers new markets — the catalog grows
  // faster than this file, so `projectCountry` returning null is a normal
  // state, not a bug (see the note below).
  AT: { lat: 47.6, lng: 14.1 },
  FI: { lat: 64.0, lng: 26.0 },
  CZ: { lat: 49.8, lng: 15.5 },
  RO: { lat: 45.9, lng: 25.0 },
  HU: { lat: 47.2, lng: 19.5 },
  GR: { lat: 39.1, lng: 22.0 },
  EE: { lat: 58.6, lng: 25.0 },
  LT: { lat: 55.2, lng: 23.9 },
  LV: { lat: 56.9, lng: 24.9 },
  BG: { lat: 42.7, lng: 25.5 },
  HR: { lat: 45.1, lng: 15.5 },
  SK: { lat: 48.7, lng: 19.5 },
  SI: { lat: 46.1, lng: 14.8 },
  LU: { lat: 49.8, lng: 6.1 },
  CY: { lat: 35.1, lng: 33.2 },
  MT: { lat: 35.9, lng: 14.4 },
  IS: { lat: 64.9, lng: -19.0 },
  UA: { lat: 48.4, lng: 31.2 },
  GE: { lat: 42.3, lng: 43.4 },
  JO: { lat: 31.2, lng: 36.8 },
  NP: { lat: 28.4, lng: 84.1 },
  KH: { lat: 12.6, lng: 105.0 },
  MM: { lat: 21.9, lng: 96.0 },
  MN: { lat: 46.9, lng: 103.8 },
  RW: { lat: -1.9, lng: 29.9 },
  ZM: { lat: -13.1, lng: 27.8 },
  CM: { lat: 5.7, lng: 12.7 },
  BJ: { lat: 9.3, lng: 2.3 },
  BW: { lat: -22.3, lng: 24.7 },
  CD: { lat: -4.0, lng: 21.8 },
  GA: { lat: -0.8, lng: 11.6 },
  ML: { lat: 17.6, lng: -4.0 },
  MW: { lat: -13.3, lng: 34.3 },
  MZ: { lat: -18.7, lng: 35.5 },
  UY: { lat: -32.5, lng: -55.8 },
  EC: { lat: -1.8, lng: -78.2 },
  BO: { lat: -16.3, lng: -63.6 },
  PY: { lat: -23.4, lng: -58.4 },
  CR: { lat: 9.7, lng: -83.8 },
  PA: { lat: 8.5, lng: -80.1 },
  GT: { lat: 15.8, lng: -90.2 },
  DO: { lat: 18.7, lng: -70.2 },
};

/** Map viewBox the projection targets. Matches the world outline's own box. */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

/**
 * Equirectangular projection, clipped to the latitudes the world outline
 * actually draws. Antarctica is cropped (nothing routes there) and the far
 * north is trimmed, which is what lets the populated band fill the frame
 * instead of sitting in a letterboxed strip.
 */
const LAT_TOP = 83;
const LAT_BOTTOM = -56;

export function project(point: LatLng): { x: number; y: number } {
  const x = ((point.lng + 180) / 360) * MAP_WIDTH;
  const y = ((LAT_TOP - point.lat) / (LAT_TOP - LAT_BOTTOM)) * MAP_HEIGHT;
  return { x, y };
}

export function projectCountry(code: string): { x: number; y: number } | null {
  const centroid = COUNTRY_CENTROIDS[code];
  return centroid ? project(centroid) : null;
}

/**
 * A quadratic arc between two projected points, bowed perpendicular to the
 * line. Corridors that share endpoints would otherwise draw exactly on top of
 * each other; the bow also makes direction readable at a glance.
 */
export function arcPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  curvature = 0.22,
): string {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Perpendicular offset, scaled by distance so short hops bow gently and
  // long ones don't balloon off the top of the frame.
  const controlX = midX - dy * curvature;
  const controlY = midY + dx * curvature;
  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}
