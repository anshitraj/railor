const FALLBACK_FILLS = ["#2775CA", "#6F5DD9", "#B4552B", "#1F8A5F", "#7B3FE4", "#C4306B"];

/**
 * Stable pseudo-random pick so the same unmapped symbol/slug always gets the
 * same colour — shared between CurrencyLogo and NetworkLogo so a symbol and
 * a slug never coincidentally collide on the exact same fallback colour
 * (the offset keeps the two mark spaces out of phase, not e.g. both hashing
 * "T..." names to the same index).
 */
export function fallbackFill(key: string, offset = 0): string {
  let hash = offset;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_FILLS[hash % FALLBACK_FILLS.length]!;
}
