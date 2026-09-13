// apps/web/app/[locale]/(ops)/api/staff/coupons/[id]/route.ts
//
// PATCH /api/staff/coupons/:id — full update or activate/deactivate.
// DELETE /api/staff/coupons/:id. Dual-mounted at app/api/staff/coupons/[id].

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  CouponInputError,
  couponIdFromRequest,
  couponInputFromDc,
  deleteCouponRecord,
  mapSqlState,
  setCouponActiveRecord,
  toDcCoupon,
  updateCouponRecord,
} from "@/lib/ops/coupons";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function couponFail(err: unknown): Response {
  if (err instanceof CouponInputError) return jsonErr(err.key, 400);
  const mapped = mapSqlState(err);
  if (mapped.kind === "unique") return jsonErr("duplicate", 409);
  if (mapped.kind === "check") return jsonErr("constraint", 400);
  return jsonErr("coupons-error", 500);
}

export const PATCH = withAdmin(async (claims, request) => {
  const id = couponIdFromRequest(request);
  if (id == null) return jsonErr("coupons-error", 400);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr("coupons-error", 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return jsonErr("coupons-error", 400);
  }
  const body = raw as Record<string, unknown>;

  try {
    const { env } = getCloudflareContext();
    const hasCode = typeof body.code === "string" && body.code.trim() !== "";
    const row = hasCode
      ? await updateCouponRecord(env, claims, id, couponInputFromDc(raw))
      : typeof body.active === "boolean"
        ? await setCouponActiveRecord(env, claims, id, body.active)
        : await updateCouponRecord(env, claims, id, couponInputFromDc(raw));
    if (!row) return jsonErr("not-found", 404);
    return jsonOk(toDcCoupon(row));
  } catch (err) {
    return couponFail(err);
  }
});

export const DELETE = withAdmin(async (claims, request) => {
  const id = couponIdFromRequest(request);
  if (id == null) return jsonErr("coupons-error", 400);
  try {
    const { env } = getCloudflareContext();
    const deleted = await deleteCouponRecord(env, claims, id);
    if (!deleted) return jsonErr("not-found", 404);
    return jsonOk({ id: String(id) });
  } catch (err) {
    return couponFail(err);
  }
});
