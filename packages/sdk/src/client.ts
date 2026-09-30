import { RailorAPIError, RailorConnectionError } from "./errors.js";
import type {
  ApiResponse,
  CapabilityListParams,
  ChangeListParams,
  CompareParams,
  CorridorSearchParams,
  DecisionCreateParams,
  EligibilityParams,
  ListResponse,
  PolicyCreateParams,
  BeneficiaryCreateParams,
  PaymentCreateParams,
  PaymentIntent,
  PriceCheckParams,
  ProviderListParams,
  WatchlistCreateParams,
  WatchlistUpdateParams,
} from "./types.js";

export interface RailorOptions {
  /** Defaults to `process.env.RAILOR_API_KEY`. Test keys start `rail_test_`, live keys `rail_live_`. */
  apiKey?: string;
  /** Defaults to `process.env.RAILOR_API_URL`, then http://localhost:3000. */
  baseUrl?: string;
  /** Per-request timeout. Default 30s. */
  timeoutMs?: number;
  /** Retries for network failures, 429 and 5xx on idempotent requests. Default 2. */
  maxRetries?: number;
  /** Bring your own fetch (tests, edge runtimes). Defaults to the global fetch. */
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | boolean | undefined | null>;

const snakeKey = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Top-level camelCase → snake_case. Nested objects (intent, rules) are passed through untouched. */
function toWire(input: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[snakeKey(key)] = value;
  }
  return out;
}

function env(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[name];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The Railor client. Method names mirror the REST tree — a method is a path —
 * so nothing has to be learned twice:
 *
 * ```ts
 * const railor = new Railor({ apiKey: process.env.RAILOR_API_KEY })
 * await railor.corridors.search({ entityCountry: "IN", destinationCountry: "AE" })
 * ```
 */
export class Railor {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RailorOptions = {}) {
    const apiKey = options.apiKey ?? env("RAILOR_API_KEY");
    if (!apiKey) {
      throw new Error(
        "No API key. Pass { apiKey } or set RAILOR_API_KEY. Find your test key in the dashboard under Developers.",
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? env("RAILOR_API_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    const f = options.fetch ?? globalThis.fetch;
    if (!f) throw new Error("No fetch implementation available. Use Node 18+ or pass { fetch }.");
    this.fetchImpl = f.bind(globalThis);
  }

  /** One authenticated call. Returns the parsed JSON exactly as the API sent it. */
  async request<T = ApiResponse>(method: string, path: string, options: { query?: Query; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    // Writes retry only when an Idempotency-Key makes a replay safe.
    const idempotent = method === "GET" || method === "DELETE" || Boolean(options.headers?.["Idempotency-Key"]);
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(url.toString(), {
          method,
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            accept: "application/json",
            ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
            ...(options.headers ?? {}),
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        if (idempotent && attempt < this.maxRetries) {
          await sleep(250 * 2 ** attempt++);
          continue;
        }
        const reason = error instanceof Error && error.name === "AbortError" ? `timed out after ${this.timeoutMs}ms` : String(error);
        throw new RailorConnectionError(`Could not reach ${this.baseUrl} (${reason}).`);
      }
      clearTimeout(timer);

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && idempotent && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt);
        attempt++;
        continue;
      }

      const text = await response.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!response.ok) {
        const error = (data as { error?: { code?: string; message?: string }; request_id?: string } | null)?.error ?? {};
        throw new RailorAPIError(
          response.status,
          error.code ?? `http_${response.status}`,
          error.message ?? response.statusText,
          (data as { request_id?: string } | null)?.request_id,
        );
      }
      return data as T;
    }
  }

  readonly providers = {
    /** GET /v1/providers — mapped providers, optionally filtered by product or HQ country. */
    list: (params: ProviderListParams = {}) => this.request<ListResponse>("GET", "/v1/providers", { query: { ...params } }),
    /** GET /v1/providers/{id} — one provider's profile, coverage, requirements and sources. */
    retrieve: (id: string) => this.request("GET", `/v1/providers/${encodeURIComponent(id)}`),
  };

  readonly corridors = {
    /** POST /v1/corridors/search — every provider checked against a corridor, each verdict with its reason and evidence. */
    search: (params: CorridorSearchParams) =>
      this.request("POST", "/v1/corridors/search", { body: toWire({ customerType: "business", ...params }) }),
  };

  readonly eligibility = {
    /** POST /v1/eligibility — could *your organization* clear onboarding, per provider. */
    check: (params: EligibilityParams) =>
      this.request("POST", "/v1/eligibility", { body: toWire({ customerType: "business", ...params }) }),
  };

  /** POST /v1/compare — 2–4 providers on the same dimensions. */
  compare(params: CompareParams) {
    return this.request("POST", "/v1/compare", { body: toWire(params) });
  }

  readonly capabilities = {
    /** GET /v1/capabilities — one page of raw capability rows with evidence. */
    list: (params: CapabilityListParams = {}) =>
      this.request<ListResponse>("GET", "/v1/capabilities", { query: toWire(params) as Query }),
    /** Iterates every matching capability, following `has_more` cursors for you. */
    listAll: (params: Omit<CapabilityListParams, "startingAfter"> = {}) => this.paginate("/v1/capabilities", toWire(params) as Query),
  };

  readonly changes = {
    /** GET /v1/changes — detected provider changes, newest first. */
    list: (params: ChangeListParams = {}) => this.request<ListResponse>("GET", "/v1/changes", { query: { ...params } }),
  };

  readonly watchlists = {
    /** GET /v1/watchlists — your monitors, with unread alert counts. */
    list: () => this.request<ListResponse>("GET", "/v1/watchlists"),
    /** POST /v1/watchlists — arm a monitor. Idempotent per target. */
    create: (params: WatchlistCreateParams) => this.request("POST", "/v1/watchlists", { body: toWire(params) }),
    /** GET /v1/watchlists/{id} — one monitor plus its recent alerts. */
    retrieve: (id: string) => this.request("GET", `/v1/watchlists/${encodeURIComponent(id)}`),
    /** PATCH /v1/watchlists/{id} — retune kinds, digest, label or email channel. */
    update: (id: string, params: WatchlistUpdateParams) =>
      this.request("PATCH", `/v1/watchlists/${encodeURIComponent(id)}`, { body: toWire(params) }),
    /** DELETE /v1/watchlists/{id} — disarm. Change events it raised stay on record. */
    delete: (id: string) => this.request("DELETE", `/v1/watchlists/${encodeURIComponent(id)}`),
    /** GET /v1/watchlists/{id}/alerts — what one monitor has raised, newest first. */
    alerts: (id: string, params: { limit?: number } = {}) =>
      this.request<ListResponse>("GET", `/v1/watchlists/${encodeURIComponent(id)}/alerts`, { query: { ...params } }),
  };

  readonly decisions = {
    /** POST /v1/decisions — evaluate a payment intent under policy. Never moves money. */
    create: (params: DecisionCreateParams) => this.request("POST", "/v1/decisions", { body: toWire(params) }),
    /** GET /v1/decisions/{id} */
    retrieve: (id: string) => this.request("GET", `/v1/decisions/${encodeURIComponent(id)}`),
    /** POST /v1/decisions/{id}/revalidate — re-run against current evidence and policy. */
    revalidate: (id: string, params: { detail?: string } = {}) =>
      this.request("POST", `/v1/decisions/${encodeURIComponent(id)}/revalidate`, { body: toWire(params) }),
    /** GET /v1/decisions/{id}/events — the audit trail. */
    events: (id: string) => this.request("GET", `/v1/decisions/${encodeURIComponent(id)}/events`),
    /** GET /v1/decisions/{id}/evidence — the sources the decision rests on. */
    evidence: (id: string) => this.request("GET", `/v1/decisions/${encodeURIComponent(id)}/evidence`),
  };

  readonly policies = {
    list: () => this.request<ListResponse>("GET", "/v1/policies"),
    create: (params: PolicyCreateParams) => this.request("POST", "/v1/policies", { body: toWire(params) }),
    retrieve: (id: string) => this.request("GET", `/v1/policies/${encodeURIComponent(id)}`),
    /** POST /v1/policies/{id}/versions — save new rules as a draft version. */
    createVersion: (id: string, params: { rules: Record<string, unknown> }) =>
      this.request("POST", `/v1/policies/${encodeURIComponent(id)}/versions`, { body: params }),
    /** POST /v1/policies/{id}/activate */
    activate: (id: string, params: { versionId?: string } = {}) =>
      this.request("POST", `/v1/policies/${encodeURIComponent(id)}/activate`, { body: toWire(params) }),
  };

  readonly beneficiaries = {
    /** GET /v1/beneficiaries — masked hints only; account details never leave Railor. */
    list: () => this.request<ListResponse>("GET", "/v1/beneficiaries"),
    /** POST /v1/beneficiaries — validated, encrypted at rest, deduplicated (re-creating returns the existing one). */
    create: (params: BeneficiaryCreateParams) => this.request("POST", "/v1/beneficiaries", { body: toWire(params) }),
    /** DELETE /v1/beneficiaries/{id} — archive. */
    archive: (id: string) => this.request("DELETE", `/v1/beneficiaries/${encodeURIComponent(id)}`),
  };

  readonly routes = {
    /** POST /v1/routes — policy verdict + ranked providers + exclusions for a payment, without creating it. */
    plan: (params: { intent: PaymentIntent; provider?: string }) => this.request("POST", "/v1/routes", { body: params }),
  };

  readonly prices = {
    /** POST /v1/prices — what arrives through each provider, every number labelled with its basis. */
    check: (params: PriceCheckParams) => this.request("POST", "/v1/prices", { body: toWire(params) }),
  };

  readonly payments = {
    /** GET /v1/payments — this key's mode only. */
    list: (params: { status?: string; limit?: number; createdBefore?: string } = {}) =>
      this.request<ListResponse>("GET", "/v1/payments", { query: toWire(params) as Query }),
    /** POST /v1/payments — policy decision + route plan. Does not send; call submit(). */
    create: (params: PaymentCreateParams, options: { idempotencyKey?: string } = {}) =>
      this.request("POST", "/v1/payments", {
        body: toWire(params),
        headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
      }),
    /** GET /v1/payments/{id} — with attempts and event history. */
    retrieve: (id: string) => this.request("GET", `/v1/payments/${encodeURIComponent(id)}`),
    /** POST /v1/payments/{id}/submit — sends it. Exactly one submit wins. */
    submit: (id: string) => this.request("POST", `/v1/payments/${encodeURIComponent(id)}/submit`),
    /** POST /v1/payments/{id}/cancel — only before a provider has it. */
    cancel: (id: string) => this.request("POST", `/v1/payments/${encodeURIComponent(id)}/cancel`),
  };

  readonly webhookEndpoints = {
    list: () => this.request<ListResponse>("GET", "/v1/webhook_endpoints"),
    /** The signing secret is in this response only. */
    create: (params: { url: string; events?: string[]; description?: string }) => this.request("POST", "/v1/webhook_endpoints", { body: params }),
    delete: (id: string) => this.request("DELETE", `/v1/webhook_endpoints/${encodeURIComponent(id)}`),
  };

  private async *paginate(path: string, query: Query): AsyncGenerator<Record<string, unknown>> {
    let startingAfter: string | undefined;
    for (;;) {
      const page = await this.request<ListResponse>("GET", path, { query: { ...query, starting_after: startingAfter } });
      for (const item of page.data) yield item;
      const last = page.data.at(-1) as { id?: string } | undefined;
      if (!page.has_more || !last?.id) return;
      startingAfter = last.id;
    }
  }
}
