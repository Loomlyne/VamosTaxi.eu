// GET /api/staff/coupons/redemptions — captured coupon uses for the Coupons tab.
// Dual-mounted at app/api/staff/coupons/redemptions.
// Each row adds email (customers.email, else bookings.contact_email) and
// beforeRappen / afterRappen from price_snapshots (CHF rappen, never a rate).
// This list is capped at 80 and only includes captured payments.
// Coupon status does not count it. readUseCounts in coupons.ts counts every
// unreleased redemption for that coupon id, the same cap as usage_cap, with no row cap.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadCouponRedemptions } from "@/lib/ops/coupons";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const rows = await loadCouponRedemptions(env, claims);
  return jsonOk(rows);
});
