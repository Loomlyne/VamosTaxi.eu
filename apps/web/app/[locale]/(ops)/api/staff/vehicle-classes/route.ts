// apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts
//
// GET list + PATCH capacities / draft hide+max pax+name + POST on the draft.
// DELETE refused when price_snapshots reference the id (D-19).
// Dual-mounted at app/api/staff/vehicle-classes.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { assertVehicleClassInput, loadVehicleClasses } from "@/lib/ops/fleet";
import {
  fleetJsonError,
  parseVehicleClassPatch,
  presentVehicleClass,
  readJsonBody,
} from "@/lib/ops/fleet-http";
import {
  deleteVehicleClassIfUnreferenced,
  insertVehicleClassOnDraft,
  patchDraftClass,
  updateVehicleClassCapacities,
} from "@/lib/ops/fleet-write";
import { resolveWritableDraftId } from "@/lib/ops/rate-book";
import { jsonErr, jsonOk, withAdmin, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

const CLASS_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function slugFromName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const rows = await loadVehicleClasses(env, claims);
  return jsonOk(rows.map(presentVehicleClass));
});

export const PATCH = withAdmin(async (claims, request) => {
  try {
    const body = await readJsonBody(request);
    const rec = asRecord(body);
    if (!rec) return jsonErr("invalid", 400);
    const id = typeof rec.id === "string" ? rec.id : "";
    if (!id) return jsonErr("invalid", 400);
    const { env } = getCloudflareContext();
    const hasCapacities =
      rec.passengerCapacity != null || rec.luggageCapacity != null;
    if (hasCapacities && !Object.prototype.hasOwnProperty.call(rec, "slug")) {
      const parsed = parseVehicleClassPatch(body);
      const input = assertVehicleClassInput(parsed.input);
      await updateVehicleClassCapacities(env, claims, parsed.id, input);
    }
    const draftId = await resolveWritableDraftId(env, claims);
    if (draftId != null) {
      const hideRaw = rec.hideFromPublic ?? rec.hide_from_public;
      const maxRaw = rec.maxPax ?? rec.max_pax;
      const name = typeof rec.name === "string" ? rec.name : "";
      const bagsRaw = rec.maxBags ?? rec.luggageCapacity ?? rec.luggage_capacity;
      const photoRaw = rec.photoPath ?? rec.photo;
      const photoPath =
        photoRaw === null
          ? null
          : typeof photoRaw === "string" && !photoRaw.startsWith("data:")
            ? photoRaw
            : undefined;
      await patchDraftClass(env, claims, id, draftId, {
        hideFromPublic: typeof hideRaw === "boolean" ? hideRaw : undefined,
        maxPax: typeof maxRaw === "number" && Number.isInteger(maxRaw) ? maxRaw : undefined,
        name: name || undefined,
        photoPath,
        luggageCapacity:
          typeof bagsRaw === "number" && Number.isInteger(bagsRaw) ? bagsRaw : undefined,
      });
    }
    const rows = await loadVehicleClasses(env, claims);
    const updated = rows.find((row) => row.id === id);
    return jsonOk(updated ? presentVehicleClass(updated) : { id });
  } catch (err) {
    return fleetJsonError(err);
  }
});

export const POST = withAdmin(async (claims, request) => {
  try {
    const body = await readJsonBody(request);
    const rec = asRecord(body);
    if (!rec) return jsonErr("invalid", 400);
    const slug = slugFromName(rec.slug ?? rec.name ?? rec.klass);
    if (!CLASS_SLUG.test(slug)) return jsonErr("invalid", 400);
    const input = assertVehicleClassInput({
      passengerCapacity:
        typeof rec.passengerCapacity === "number"
          ? rec.passengerCapacity
          : typeof rec.maxPax === "number"
            ? rec.maxPax
            : 3,
      luggageCapacity:
        typeof rec.luggageCapacity === "number"
          ? rec.luggageCapacity
          : typeof rec.maxBags === "number"
            ? rec.maxBags
            : 3,
    });
    const { env } = getCloudflareContext();
    const draftId = await resolveWritableDraftId(env, claims);
    if (draftId == null) return jsonErr("not-found", 404);
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const photoRaw = rec.photoPath ?? rec.photo;
    const photoPath =
      typeof photoRaw === "string" && photoRaw && !photoRaw.startsWith("data:") ? photoRaw : null;
    const id = await insertVehicleClassOnDraft(
      env,
      claims,
      { ...input, slug, name: name || slug, photoPath },
      draftId,
    );
    const rows = await loadVehicleClasses(env, claims);
    const created = rows.find((row) => row.id === id);
    return jsonOk(created ? presentVehicleClass(created) : { id }, 201);
  } catch (err) {
    return fleetJsonError(err);
  }
});

export const DELETE = withAdmin(async (claims, request) => {
  try {
    const url = new URL(request.url);
    let rec = asRecord(null);
    try {
      rec = asRecord(await request.json());
    } catch {
      rec = null;
    }
    const idRaw = (rec && typeof rec.id === "string" && rec.id) || url.searchParams.get("id") || "";
    if (!idRaw) return jsonErr("invalid", 400);
    const { env } = getCloudflareContext();
    const draftId = await resolveWritableDraftId(env, claims);
    if (draftId == null) return jsonErr("not-found", 404);
    const result = await deleteVehicleClassIfUnreferenced(env, claims, idRaw, draftId);
    if (result === "in-use") return jsonErr("in-use", 409);
    return jsonOk({ id: idRaw });
  } catch (err) {
    return fleetJsonError(err);
  }
});
