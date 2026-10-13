// apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts
//
// GET list (with server-computed state) + PATCH status (draft/live/retired through
// public.ops_vehicle_class_set_status) or capacities / draft hide+max pax+name + POST on the draft.
// Phase 30: there is no DELETE; a class is retired, never deleted.
// Dual-mounted at app/api/staff/vehicle-classes.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { VamosClaims } from "@/lib/db/identity";
import { assertVehicleClassInput, loadVehicleClasses } from "@/lib/ops/fleet";
import {
  fleetJsonError,
  parseVehicleClassPatch,
  presentVehicleClass,
  readJsonBody,
} from "@/lib/ops/fleet-http";
import {
  insertVehicleClassOnDraft,
  patchDraftClass,
  setVehicleClassStatus,
  updateVehicleClassCapacities,
} from "@/lib/ops/fleet-write";
import { resolveWritableDraftId } from "@/lib/ops/rate-book";
import { parseClassRetireReason, parseClassStatus } from "@/lib/ops/vehicle-class-write";
import { jsonErr, jsonOk, withAdmin, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

const CLASS_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ANY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * Phase 30 CLS-01: move a class between Draft, Live and Retired. Reads only id, status and
 * reason from the body (no mass assignment). The database decides (admin, transition,
 * Go-live checklist); its refusals are read here, outside the asStaff callback.
 */
async function patchStatus(
  env: CloudflareEnv,
  claims: VamosClaims,
  rec: Record<string, unknown>,
): Promise<Response> {
  const to = parseClassStatus(rec.status);
  if (!to) return jsonErr("invalid", 400);
  const id = typeof rec.id === "string" ? rec.id : "";
  if (!ANY_UUID.test(id)) return jsonErr("invalid", 400);
  const reason = parseClassRetireReason(rec.reason);
  if (!reason.ok) return jsonErr("invalid-reason", 400);
  try {
    await setVehicleClassStatus(env, claims, id, to, reason.reason);
  } catch (err) {
    const e = err as { code?: unknown; message?: unknown; detail?: unknown } | null;
    const message = typeof e?.message === "string" ? e.message : "";
    if (e?.code === "42501") return jsonErr("not-admin", 403);
    if (e?.code === "P0002") return jsonErr("not-found", 404);
    if (e?.code === "P0001" && message === "incomplete") {
      return jsonErr("incomplete", 409, { missing: typeof e.detail === "string" ? e.detail : "" });
    }
    if (e?.code === "P0001" && message === "bad-transition") return jsonErr("bad-transition", 409);
    if (e?.code === "22023") return jsonErr("invalid", 400);
    if (e?.code === "22001") return jsonErr("invalid-reason", 400);
    return fleetJsonError(err);
  }
  const rows = await loadVehicleClasses(env, claims);
  const updated = rows.find((row) => row.id === id);
  return jsonOk(updated ? presentVehicleClass(updated) : { id, status: to });
}

export const PATCH = withAdmin(async (claims, request) => {
  try {
    const body = await readJsonBody(request);
    const rec = asRecord(body);
    if (!rec) return jsonErr("invalid", 400);
    const id = typeof rec.id === "string" ? rec.id : "";
    if (!id) return jsonErr("invalid", 400);
    const { env } = getCloudflareContext();
    if (rec.status !== undefined) return await patchStatus(env, claims, rec);
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
