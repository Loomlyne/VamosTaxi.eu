// apps/web/app/[locale]/(ops)/api/staff/invite/route.ts
//
// POST /api/staff/invite — the only place the service-role key is used.
// Order of operations is the security property (T-06-24): prove the caller
// is an aal2 admin, THEN construct the admin client, then invite, then
// write public.staff yourself. user_metadata is never authoritative (D-06).

import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { emailSchema } from "@/lib/auth/schemas";
import { log } from "@/lib/logger";
import {
  INVITE_ERROR,
  assertInviteRole,
  opsInviteRedirectUrl,
  type InviteErrorCode,
} from "@/lib/ops/invite";
import { OpsAuthError, requireAdminClaims, type StaffAuthClient } from "@/lib/ops/session";
import { staffOriginAllowed } from "@/lib/ops/staff-json";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "private, no-store" };

function jsonError(code: InviteErrorCode, status: number): Response {
  return Response.json({ ok: false, code }, { status, headers: noStore });
}

function jsonForbidden(): Response {
  return Response.json({ ok: false }, { status: 403, headers: noStore });
}

function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

export async function POST(request: Request): Promise<Response> {
  const ctx = {
    requestId: crypto.randomUUID(),
    route: "/api/staff/invite",
    locale: null as string | null,
  };

  const supabase = (await createSupabaseServerClient()) as StaffAuthClient;
  let caller;
  try {
    caller = await requireAdminClaims(supabase);
  } catch (error) {
    if (error instanceof OpsAuthError) {
      log("error", "ops-invite", ctx, { reason: error.reason });
      return jsonForbidden();
    }
    throw error;
  }

  if (!staffOriginAllowed(request.headers.get("Origin"))) {
    return Response.json({ ok: false, code: "csrf" }, { status: 403, headers: noStore });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(INVITE_ERROR.invalid_input, 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return jsonError(INVITE_ERROR.invalid_input, 400);
  }
  const body = raw as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("email") || !keys.includes("role")) {
    return jsonError(INVITE_ERROR.invalid_input, 400);
  }

  let role;
  try {
    role = assertInviteRole(body.role);
  } catch {
    return jsonError(INVITE_ERROR.invalid_input, 400);
  }
  const emailParsed = emailSchema.safeParse(body.email);
  if (!emailParsed.success) {
    return jsonError(INVITE_ERROR.invalid_input, 400);
  }
  const email = emailParsed.data;

  const { env } = getCloudflareContext();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = env.SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    log("error", "ops-invite", ctx, { reason: "missing-service-role" });
    return jsonError(INVITE_ERROR.invite_failed, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: opsInviteRedirectUrl(),
    // Cosmetic display metadata only — never authoritative. The role that
    // matters is the public.staff row inserted below (Custom Access Token Hook).
    data: { invited_role: role },
  });

  if (invited.error || !invited.data.user?.id) {
    const status = errorStatus(invited.error);
    const code = errorCode(invited.error);
    if (status === 429 || code === "over_email_send_rate_limit") {
      log("error", "ops-invite", ctx, { reason: INVITE_ERROR.invite_delivery_unconfigured });
      return jsonError(INVITE_ERROR.invite_delivery_unconfigured, 429);
    }
    if (code === "email_exists" || code === "user_already_exists" || status === 422) {
      log("error", "ops-invite", ctx, { reason: INVITE_ERROR.already_invited });
      return jsonError(INVITE_ERROR.already_invited, 409);
    }
    log("error", "ops-invite", ctx, { reason: code ?? "invite-failed" });
    return jsonError(INVITE_ERROR.invite_failed, status && status >= 400 ? status : 500);
  }

  const userId = invited.data.user.id;
  const inserted = await admin.from("staff").insert({
    user_id: userId,
    role,
    invited_by: caller.sub,
    mfa_enrolled: false,
  });

  if (inserted.error) {
    await admin.auth.admin.deleteUser(userId);
    log("error", "ops-invite", ctx, { reason: errorCode(inserted.error) ?? "staff-insert-failed" });
    return jsonError(INVITE_ERROR.staff_row_failed, 500);
  }

  return Response.json({ ok: true }, { headers: noStore });
}
