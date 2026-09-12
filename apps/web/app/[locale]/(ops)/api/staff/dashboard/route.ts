// apps/web/app/[locale]/(ops)/api/staff/dashboard/route.ts
//
// GET /api/staff/dashboard?period=today|week|month|all
// D-16: income = captured charged_rappen; expenses = booking_refunds.
// Dual-mounted at app/api/staff/dashboard.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadDashboardMoney, parseMoneyPeriod } from "@/lib/ops/bookings";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export const GET = withStaff(async (claims, request) => {
  const period = parseMoneyPeriod(new URL(request.url).searchParams.get("period"));
  const { env } = getCloudflareContext();
  const money = await loadDashboardMoney(env, claims, period);
  return jsonOk(money);
});
