/**
 * Everything this client throws. Two failure modes only: the request never
 * reached Railor, or Railor answered with an error — never a bare fetch/JSON
 * exception leaking into caller code. Mirrors the Python SDK's errors module.
 */
export class RailorError extends Error {
  override name = "RailorError";
}

/** The request never reached Railor — network, DNS or timeout failure. */
export class RailorConnectionError extends RailorError {
  override name = "RailorConnectionError";
}

/** Railor received the request and answered with an error. */
export class RailorAPIError extends RailorError {
  override name = "RailorAPIError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(`${code}: ${message}`);
  }
}
