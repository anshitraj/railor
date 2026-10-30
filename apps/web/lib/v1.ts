import "server-only";
import { NextResponse } from "next/server";
import { PaymentError } from "@railor/core";
import { ZodError } from "zod";
import { ApiError, authenticate, recordUsage, type ApiContext } from "./api-auth";

/**
 * One wrapper for /v1 handlers: bearer auth, usage metering, and a single
 * error shape (`{ object: "error", error: { code, message } }`) whatever
 * failed — auth, validation, or a payment rule.
 */
export function v1Route<P extends Record<string, string> = Record<string, string>>(
  endpoint: string,
  method: string,
  handler: (context: ApiContext, request: Request, params: P) => Promise<{ status?: number; body: unknown }>,
) {
  // Next always passes the route context (params is {} on static routes); typed as required so its route-type check passes.
  return async (request: Request, extra: { params: Promise<P> }) => {
    const started = Date.now();
    let context: ApiContext | null = null;
    async function record(status: number) {
      try { await recordUsage(context, endpoint, method, status, Date.now() - started); }
      catch (error) {
        // The allowance was already consumed atomically during authentication.
        // A metrics outage must not obscure an operation that already completed.
        console.error(JSON.stringify({ event: "api_usage_failed", endpoint, requestId: context?.requestId, errorType: error instanceof Error ? error.name : "UnknownError" }));
      }
    }
    try {
      context = await authenticate(request);
      const params = ((await extra?.params) ?? {}) as P;
      const { status = 200, body } = await handler(context, request, params);
      await record(status);
      return NextResponse.json(typeof body === "object" && body !== null ? { request_id: context.requestId, ...body } : body, { status });
    } catch (error) {
      const { status, code, message, fields } =
        error instanceof ApiError
          ? { status: error.status, code: error.code, message: error.message, fields: undefined }
          : error instanceof PaymentError
            ? { status: error.status, code: error.code, message: error.message, fields: undefined }
            : error instanceof ZodError
              ? { status: 400, code: "invalid_request", message: error.issues[0]?.message ?? "Invalid request.", fields: Object.fromEntries(error.issues.map((i) => [i.path.join("."), i.message])) }
              : { status: 500, code: "internal_error", message: "Railor could not complete this request. Check its status before retrying.", fields: undefined };
      if (status === 500) console.error(JSON.stringify({ event: "api_request_failed", endpoint, requestId: context?.requestId, errorType: error instanceof Error ? error.name : "UnknownError" }));
      await record(status);
      return NextResponse.json({ object: "error", request_id: context?.requestId, error: { code, message, ...(fields ? { fields } : {}) } }, { status });
    }
  };
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    throw new ApiError(400, "invalid_json", "Send a JSON object body.");
  }
}

const camel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Top-level snake_case → camelCase (nested objects like `intent` are normalized by their own schema). */
export function camelTop(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).map(([k, v]) => [camel(k), v]));
}
