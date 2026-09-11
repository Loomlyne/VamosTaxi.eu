// apps/web/app/[locale]/(ops)/api/staff/chauffeurs/[id]/route.ts
//
// PATCH + DELETE /api/staff/chauffeurs/:id. Dual-mounted at
// app/api/staff/chauffeurs/[id].

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { assertChauffeurInput, loadChauffeur } from "@/lib/ops/chauffeurs";
import {
  chauffeurJsonError,
  isUuid,
  parseChauffeurBody,
  presentChauffeur,
  readJsonBody,
} from "@/lib/ops/fleet-http";
import { deleteChauffeurRow, updateChauffeurRow } from "@/lib/ops/chauffeurs-write";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return withStaff(async (claims) => {
    if (!isUuid(id)) return jsonErr("chauffeurs-failure-error", 400);
    try {
      const parsed = parseChauffeurBody(await readJsonBody(request));
      const input = assertChauffeurInput(parsed.input);
      const { env } = getCloudflareContext();
      const wrote = await updateChauffeurRow(env, claims, id, input);
      if (!wrote) return jsonErr("not-found", 404, { message: "That chauffeur is gone." });
      const updated = await loadChauffeur(env, claims, id);
      return jsonOk(updated ? presentChauffeur(updated) : { id });
    } catch (err) {
      return chauffeurJsonError(err);
    }
  })(request);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return withStaff(async (claims) => {
    if (!isUuid(id)) return jsonErr("chauffeurs-failure-error", 400);
    try {
      const { env } = getCloudflareContext();
      await deleteChauffeurRow(env, claims, id);
      return jsonOk({ id });
    } catch (err) {
      return chauffeurJsonError(err);
    }
  })(request);
}
