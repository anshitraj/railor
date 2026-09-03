import { NextResponse } from "next/server";
import { createPolicy, listPolicies } from "@railor/core";
import { PolicyRules } from "@railor/types";
import { ApiError, authenticate, recordUsage, snake, type ApiContext } from "../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /v1/policies — every policy this organization owns. */
export async function GET(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const rows = await listPolicies(context.organizationId);
    await recordUsage(context, "/v1/policies", "GET", 200, Date.now() - started);
    return NextResponse.json({
      object: "list",
      request_id: context.requestId,
      data: rows.map((r) => snake(r as unknown as Record<string, unknown>)),
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/policies", "GET", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}

/**
 * POST /v1/policies
 *
 * Creates a policy with one DRAFT version (version 1) carrying `rules`
 * (typed JSON, Zod-validated against PolicyRules — never a free-form
 * expression language). A DRAFT is not enforced by any Decision until
 * POST /v1/policies/{id}/activate makes it ACTIVE.
 */
export async function POST(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
    if (!name) throw new ApiError(400, "invalid_request", "name is required.");

    const parsedRules = PolicyRules.safeParse(body.rules ?? {});
    if (!parsedRules.success) {
      throw new ApiError(400, "invalid_rules", parsedRules.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }

    const { policy, version } = await createPolicy(context.organizationId, name, parsedRules.data);
    await recordUsage(context, "/v1/policies", "POST", 200, Date.now() - started);
    return NextResponse.json({
      object: "policy",
      request_id: context.requestId,
      data: { ...snake(policy as unknown as Record<string, unknown>), initial_version: snake(version as unknown as Record<string, unknown>) },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/policies", "POST", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
