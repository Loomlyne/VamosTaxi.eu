// apps/web/app/[locale]/(ops)/api/staff/roster/route.ts
//
// GET  /api/staff/roster — loadStaff discriminated union (dispatcher = access:denied).
// PATCH /api/staff/roster — { userId, role?, active? } withAdmin (D-07).
// Invite stays POST /api/staff/invite. Dual-mounted at app/api/staff/roster.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  assertRoleChange,
  isLastAdminDbError,
  loadStaff,
  mapSqlState,
  StaffInputError,
  type StaffRole,
} from "@/lib/ops/staff";
import { jsonErr, jsonOk, withAdmin, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function asRole(value: unknown): StaffRole | undefined {
  if (value === "admin" || value === "dispatcher") return value;
  return undefined;
}

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const roster = await loadStaff(env, claims);
  return jsonOk(roster);
});

export const PATCH = withAdmin(async (claims, request) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr("staff-invalid-input", 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return jsonErr("staff-invalid-input", 400);
  }
  const body = raw as Record<string, unknown>;
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) return jsonErr("staff-invalid-input", 400);

  const role = body.role === undefined ? undefined : asRole(body.role);
  if (body.role !== undefined && role === undefined) return jsonErr("staff-invalid-role", 400);
  const active = typeof body.active === "boolean" ? body.active : undefined;
  if (role === undefined && active === undefined) return jsonErr("staff-invalid-input", 400);

  const { env } = getCloudflareContext();
  try {
    const roster = await loadStaff(env, claims);
    if (roster.access !== "ok") return jsonErr("not-admin", 403);
    assertRoleChange(roster.rows, { userId, role, active });
    await asStaff(env, claims, async (sql) => {
      if (role !== undefined) {
        await sql`update public.staff set "role" = ${role} where user_id = ${userId}`;
      }
      if (active !== undefined) {
        await sql`update public.staff set active = ${active} where user_id = ${userId}`;
      }
      return null;
    });
  } catch (err) {
    if (err instanceof StaffInputError) return jsonErr(err.key, 400);
    // G17: the database guard caught a race the roster read above could not see.
    if (isLastAdminDbError(err)) return jsonErr("staff-last-admin", 400);
    const mapped = mapSqlState(err);
    if (mapped.kind === "privilege") return jsonErr("not-admin", 403);
    if (mapped.kind !== "unknown") return jsonErr(mapped.key, 400);
    throw err;
  }

  const next = await loadStaff(env, claims);
  return jsonOk(next);
});
