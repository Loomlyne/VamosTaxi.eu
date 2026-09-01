// apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/route.ts
//
// GET /api/staff/rate-versions/:id — version + completeness gaps (D-13).
// Dual-mounted at app/api/staff/rate-versions/[id]. JSON 404, never HTML.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadCompleteness, loadRateVersions } from "@/lib/ops/pricing";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: raw } = await context.params;
  return withStaff(async (claims) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) return jsonErr("not-found", 404);
    const { env } = getCloudflareContext();
    const versions = await loadRateVersions(env, claims);
    const version = versions.find((row) => row.id === id);
    if (!version) return jsonErr("not-found", 404);
    const gaps = await loadCompleteness(env, claims, id);
    return jsonOk({ version, gaps });
  })(request);
}
