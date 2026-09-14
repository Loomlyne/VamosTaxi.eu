// apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/discard/route.ts
//
// POST /api/staff/rate-versions/:id/discard — abandon the draft (D-06).
// History (live/retired) rows stay. Do not clone a new draft after delete.
// GET rate-book then returns live. Public book unchanged.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import { loadRateVersions } from "@/lib/ops/pricing";
import { classifyPricingFailure } from "@/lib/ops/rate-book";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function versionIdFromRequest(request: Request): number | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("rate-versions");
  const n = Number(i >= 0 ? parts[i + 1] : "");
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const POST = withAdmin(async (claims, request) => {
  const id = versionIdFromRequest(request);
  if (id == null) return jsonErr("not-found", 404);
  const { env } = getCloudflareContext();
  const versions = await loadRateVersions(env, claims);
  const target = versions.find((row) => row.id === id);
  if (!target || target.status !== "draft") return jsonErr("not-draft", 409);
  const live = versions.find((row) => row.status === "live");

  try {
    await asStaff(env, claims, async (tx) => {
      await tx`delete from public.coupons where rate_version_id = ${id}`;
      await tx`delete from public.surcharges where rate_version_id = ${id}`;
      await tx`delete from public.rate_version_rules where rate_version_id = ${id}`;
      await tx`delete from public.distance_bands where rate_version_id = ${id}`;
      await tx`delete from public.region_premiums where rate_version_id = ${id}`;
      await tx`delete from public.fixed_routes where rate_version_id = ${id}`;
      await tx`delete from public.distance_rates where rate_version_id = ${id}`;
      await tx`delete from public.rate_versions where id = ${id} and status = 'draft'`;
      return null;
    });
  } catch (err) {
    const classified = classifyPricingFailure(err);
    if (classified.kind === "fk") return jsonErr("fk", 400);
    if (classified.kind === "frozen") return jsonErr("frozen", 409);
    return jsonErr("unknown", 500);
  }

  if (!live) return jsonOk({ discarded: id, versionId: null, empty: true });
  return jsonOk({ discarded: id, versionId: live.id, empty: false });
});
