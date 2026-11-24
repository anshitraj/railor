/**
 * Which Gemini models Railor uses for hard reasoning, newest and strongest
 * first. Anything that can be answered from a page's text alone (reading an
 * invoice, a quick lookup) stays on a fast model; this chain is for work
 * where being right matters more than being quick, such as working out where
 * missing money went.
 *
 * RAILOR_FRONTIER_MODEL overrides the chain with a comma-separated list, so a
 * newer model can be switched on without a release. A model the project's key
 * cannot reach is skipped and the next one is tried.
 */
export const DEFAULT_FRONTIER_MODELS = ["gemini-4-argon", "gemini-pro-latest", "gemini-flash-latest"] as const;

export function frontierModels(): string[] {
  const configured = process.env.RAILOR_FRONTIER_MODEL?.split(",").map((value) => value.trim()).filter(Boolean);
  return configured?.length ? configured : [...DEFAULT_FRONTIER_MODELS];
}

/** The model does not exist for this key, rejects the request shape, or is out of quota: another model may still answer. */
export function modelUnavailable(error: unknown): boolean {
  const e = error as { status?: number; code?: number; message?: string } | null;
  const status = e?.status ?? e?.code;
  if (status === 404 || status === 400 || status === 429 || status === 503) return true;
  return /not found|not supported|unsupported|no longer available|resource_exhausted|quota|overloaded|unavailable/i.test(e?.message ?? "");
}

/** Runs `attempt` on each model in turn until one answers; reports which one did. */
export async function withFrontierModel<T>(attempt: (model: string) => Promise<T>, models = frontierModels()): Promise<{ value: T; model: string }> {
  let last: unknown = new Error("No Gemini model is configured.");
  for (const model of models) {
    try {
      return { value: await attempt(model), model };
    } catch (error) {
      last = error;
      if (!modelUnavailable(error)) throw error;
    }
  }
  throw last;
}

/** Models that find pages (search grounding). Fast beats clever here; the strong model reads what they find. */
export function searchModels(): string[] {
  const configured = process.env.RAILOR_SEARCH_MODEL?.split(",").map((value) => value.trim()).filter(Boolean);
  return configured?.length ? configured : ["gemini-flash-latest"];
}
