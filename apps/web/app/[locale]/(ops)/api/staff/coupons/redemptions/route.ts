// GET /api/staff/coupons/redemptions — captured coupon uses for the Coupons tab.
// Dual-mounted at app/api/staff/coupons/redemptions.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadCouponRedemptions } from "@/lib/ops/coupons";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const rows = await loadCouponRedemptions(env, claims);
  return jsonOk(rows);
});
