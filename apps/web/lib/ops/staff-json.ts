// apps/web/lib/ops/staff-json.ts
//
// Envelope + staff/admin wrappers every later /api/staff/* route uses.
// Auth goes through requireStaffClaims / requireAdminClaims then the
// handler; data access stays in the handler via asStaff (D-02). MFA is
// paused (D-37) — this file does not redirect.

import {
  OpsAuthError,
  requireAdminClaims,
  requireStaffClaims,
  type OpsAuthReason,
  type StaffAuthClient,
  type StaffSession,
} from "./session";
import { createSupabaseServerClient } from "../supabase/server";

export type StaffJsonHandler = (
  claims: StaffSession,
  request: Request,
) => Promise<Response> | Response;

export function jsonOk(data: unknown, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

export function jsonErr(code: string, status: number, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, code, ...(extra ?? {}) }, { status });
}

const DASHBOARD_HOSTS = new Set(["dashboard.vamostaxi.site", "dashboard.localhost"]);

/** CSRF (ASVS L1): if Origin is present on a mutating staff call, it must be the dashboard. */
export function staffOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    if (DASHBOARD_HOSTS.has(host)) return true;
    return host.endsWith(".koussayzayeni.workers.dev") && host.includes("ops-changes");
  } catch {
    return false;
  }
}

export function staffStatus(reason: OpsAuthReason): { code: string; status: number } {
  if (reason === "no-session") return { code: "no-session", status: 401 };
  if (reason === "not-admin") return { code: "not-admin", status: 403 };
  return { code: "not-staff", status: 403 };
}

function isStaffDocumentNav(request: Request): boolean {
  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  return dest === "document" || dest === "iframe" || dest === "frame" || dest === "embed";
}

async function staffResponse(
  request: Request,
  requireClaims: (supabase: StaffAuthClient) => Promise<StaffSession>,
  handler: StaffJsonHandler,
): Promise<Response> {
  if (isStaffDocumentNav(request)) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }
  const supabase = (await createSupabaseServerClient()) as StaffAuthClient;
  let claims: StaffSession;
  try {
    claims = await requireClaims(supabase);
  } catch (error) {
    if (error instanceof OpsAuthError) {
      const mapped = staffStatus(error.reason);
      return jsonErr(mapped.code, mapped.status);
    }
    throw error;
  }
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    if (!staffOriginAllowed(request.headers.get("Origin"))) {
      return jsonErr("csrf", 403);
    }
  }
  return handler(claims, request);
}

export function withStaff(handler: StaffJsonHandler): (request: Request) => Promise<Response> {
  return (request) => staffResponse(request, requireStaffClaims, handler);
}

export function withAdmin(handler: StaffJsonHandler): (request: Request) => Promise<Response> {
  return (request) => staffResponse(request, requireAdminClaims, handler);
}
