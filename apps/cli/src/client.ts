/**
 * Thin authenticated HTTP client over Railor's /v1 API. No retries, no
 * magic — every CLI command is one call to this, so `railor <cmd> --json`
 * output is always exactly what the API returned.
 */
export class CliApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export function makeClient(baseUrl: string, apiKey: string) {
  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          authorization: `Bearer ${apiKey}`,
          ...(options.body ? { "content-type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (cause) {
      throw new CliApiError(
        0,
        "network_error",
        `Could not reach ${url.origin}. Is the app running? (${(cause as Error).message})`,
      );
    }

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      const code = json?.error?.code ?? `http_${response.status}`;
      const message = json?.error?.message ?? response.statusText;
      throw new CliApiError(response.status, code, message);
    }

    return json as T;
  }

  return {
    get: <T>(path: string, query?: RequestOptions["query"]) => request<T>(path, { query }),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
    patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
    del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  };
}

export type RailorClient = ReturnType<typeof makeClient>;
