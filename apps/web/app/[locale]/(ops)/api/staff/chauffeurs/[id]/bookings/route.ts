// apps/web/app/[locale]/(ops)/api/staff/chauffeurs/[id]/bookings/route.ts
//
// GET /api/staff/chauffeurs/:id/bookings — the chauffeur's bookings history (owner, 2026-10-01),
// read-only. Dual-mounted at app/api/staff/chauffeurs/[id]/bookings.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadChauffeurHistory } from "@/lib/ops/chauffeur-history";
import { isUuid } from "@/lib/ops/fleet-http";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return withStaff(async (claims) => {
    if (!isUuid(id)) return jsonErr("not-found", 404);
    try {
      const { env } = getCloudflareContext();
      return jsonOk(await loadChauffeurHistory(env, claims, id));
    } catch {
      return jsonErr("error", 500, { message: "The bookings of this chauffeur could not be read." });
    }
  })(request);
}
