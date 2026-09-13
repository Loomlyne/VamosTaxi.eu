// apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/clone/route.ts
//
// POST /api/staff/rate-versions/:id/clone — fork that version into a new draft (D-09).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadRateVersions } from "@/lib/ops/pricing";
import { classifyPricingFailure, forkLiveRateVersion } from "@/lib/ops/rate-book";
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
  const source = versions.find((row) => row.id === id);
  if (!source) return jsonErr("not-found", 404);
  try {
    const nextId = await forkLiveRateVersion(env, claims, {
      id: source.id,
      label: source.label,
    });
    return jsonOk({ id: nextId, status: "draft", sourceId: source.id });
  } catch (err) {
    const classified = classifyPricingFailure(err);
    if (classified.kind === "duplicate") return jsonErr("duplicate", 409);
    return jsonErr("unknown", 500);
  }
});
