// apps/web/app/[locale]/(ops)/api/staff/coupons/route.ts
//
// GET /api/staff/coupons — draft-version list (empty [] is the shipping table).
// POST /api/staff/coupons — create on the writable draft. Duplicate code → 409.
// Dual-mounted at app/api/staff/coupons. Mutating methods are withAdmin (D-07 D-34).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  CouponInputError,
  couponInputFromDc,
  insertCoupon,
  loadCoupons,
  mapSqlState,
  toDcCoupon,
} from "@/lib/ops/coupons";
import { resolveWritableDraftId } from "@/lib/ops/rate-book";
import { jsonErr, jsonOk, withAdmin, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function couponFail(err: unknown): Response {
  if (err instanceof CouponInputError) return jsonErr(err.key, 400);
  const mapped = mapSqlState(err);
  if (mapped.kind === "unique") return jsonErr("duplicate", 409);
  if (mapped.kind === "check") return jsonErr("constraint", 400);
  return jsonErr("coupons-error", 500);
}

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const versionId = await resolveWritableDraftId(env, claims);
  const rows = await loadCoupons(env, claims, versionId);
  return jsonOk(rows.map(toDcCoupon));
});

export const POST = withAdmin(async (claims, request) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr("coupons-error", 400);
  }
  try {
    const { env } = getCloudflareContext();
    const versionId = await resolveWritableDraftId(env, claims);
    const row = await insertCoupon(env, claims, couponInputFromDc(raw), versionId);
    return jsonOk(toDcCoupon(row), 201);
  } catch (err) {
    return couponFail(err);
  }
});
