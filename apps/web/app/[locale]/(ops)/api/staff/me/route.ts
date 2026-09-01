// apps/web/app/[locale]/(ops)/api/staff/me/route.ts
//
// GET /api/staff/me — signed-in staff self row. Dual-mounted at
// app/api/staff/me so the DC mock can hit /api/staff/me despite
// <base href="/app/ops/">. Never service_role; never a fabricated name.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";
import { loadOwnProfile } from "@/lib/ops/staff";

export const dynamic = "force-dynamic";

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const profile = await loadOwnProfile(env, claims);
  const role = profile?.role ?? claims.app_metadata?.vamos_role ?? "";
  return jsonOk({
    userId: claims.sub,
    email: claims.email ?? "",
    role,
    fullName: profile?.fullName ?? "",
    lang: profile?.lang ?? "",
  });
});
