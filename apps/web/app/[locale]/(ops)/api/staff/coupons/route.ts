// apps/web/app/[locale]/(ops)/api/staff/coupons/route.ts
//
// GET /api/staff/coupons — list (empty [] is the shipping table).
// POST /api/staff/coupons — create. Duplicate code → 409 from 23505.
// Dual-mounted at app/api/staff/coupons. Every read/write is asStaff.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  CouponInputError,
  couponInputFromDc,
  insertCoupon,
  loadCoupons,
  mapSqlState,
  toDcCoupon,
} from "@/lib/ops/coupons";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

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
  const rows = await loadCoupons(env, claims);
  return jsonOk(rows.map(toDcCoupon));
});

export const POST = withStaff(async (claims, request) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr("coupons-error", 400);
  }
  try {
    const { env } = getCloudflareContext();
    const row = await insertCoupon(env, claims, couponInputFromDc(raw));
    return jsonOk(toDcCoupon(row), 201);
  } catch (err) {
    return couponFail(err);
  }
});
