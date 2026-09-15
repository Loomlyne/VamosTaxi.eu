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
