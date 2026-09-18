// apps/web/app/[locale]/(ops)/api/staff/chauffeurs/route.ts
//
// GET list + POST create. Dual-mounted at app/api/staff/chauffeurs.
// asStaff via loadChauffeurs / insertChauffeur. Empty table → [].

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { assertChauffeurInput, loadChauffeur, loadChauffeurByEmail, loadChauffeurDetailsList } from "@/lib/ops/chauffeurs";
import {
  chauffeurJsonError,
  parseChauffeurBody,
  presentChauffeur,
  readJsonBody,
} from "@/lib/ops/fleet-http";
import { ChauffeurDuplicateEmailError } from "@/lib/ops/chauffeurs-model";
import { insertChauffeur } from "@/lib/ops/chauffeurs-write";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const rows = await loadChauffeurDetailsList(env, claims);
  return jsonOk(rows.map(presentChauffeur));
});

export const POST = withStaff(async (claims, request) => {
  try {
    const parsed = parseChauffeurBody(await readJsonBody(request));
    const input = assertChauffeurInput(parsed.input);
    const { env } = getCloudflareContext();
    if (input.email) {
      const existing = await loadChauffeurByEmail(env, claims, input.email);
      if (existing && existing.id !== parsed.id) {
        throw new ChauffeurDuplicateEmailError(existing.id, existing.fullName);
      }
    }
    const id = await insertChauffeur(env, claims, parsed.id, input);
    const created = await loadChauffeur(env, claims, id);
    return jsonOk(created ? presentChauffeur(created) : { id }, 201);
  } catch (err) {
    return chauffeurJsonError(err);
  }
});
