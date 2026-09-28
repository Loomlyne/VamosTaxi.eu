// apps/web/lib/ops/vehicle-class-write.ts
//
// Choose insert vs update for a Distance class Save. The overlay photo picker
// mints a vehicleClassId UUID before the catalog row exists so the R2 key has
// an id. That minted id is not a catalog hit — treat it as a new insert, or
// reattach by slug when the name already exists (delete only drops the rate).

const VEHICLE_CLASS_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function asVehicleClassUuid(value: string): string {
  return VEHICLE_CLASS_UUID.test(value) ? value : "";
}

export type VehicleClassWritePlan =
  | { mode: "update"; id: string }
  | { mode: "insert"; id: string | null };

export function planVehicleClassWrite(
  incomingId: string,
  slug: string,
  catalog: readonly { id: string; slug: string }[],
): VehicleClassWritePlan {
  const id = asVehicleClassUuid(incomingId);
  if (id && catalog.some((row) => row.id === id)) {
    return { mode: "update", id };
  }
  const bySlug = slug ? catalog.find((row) => row.slug === slug) : undefined;
  if (bySlug) return { mode: "update", id: bySlug.id };
  return { mode: "insert", id: id || null };
}

/** 26.1-19 D-15: the database's answer to a class delete. */
export type ClassDeleteResult = "deleted" | "in-use" | "hidden";

/** Longest hide reason the database accepts (vehicle_classes_hidden_reason_len). */
export const CLASS_HIDE_REASON_MAX = 140;

/**
 * Reads the optional hide reason from a DELETE body. Blank means "no reason" (the
 * database then answers in-use for a referenced class). Over 140 characters or a
 * non-string is refused before the database sees it.
 */
export function parseClassDeleteReason(
  value: unknown,
): { ok: true; reason: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, reason: null };
  if (typeof value !== "string") return { ok: false };
  const reason = value.trim();
  if (!reason) return { ok: true, reason: null };
  if (reason.length > CLASS_HIDE_REASON_MAX) return { ok: false };
  return { ok: true, reason };
}

/** Maps the delete-or-hide answer to the staff JSON door: in-use is a 409 the dialog reads. */
export function classDeleteReply(
  id: string,
  result: ClassDeleteResult,
): { status: number; body: Record<string, unknown> } {
  if (result === "in-use") return { status: 409, body: { ok: false, code: "in-use" } };
  return { status: 200, body: { ok: true, data: { id, result } } };
}
