// apps/web/lib/ops/vehicle-photo.ts
//
// Quick 261001-cars-page (owner rule, 2026-09-30: "anything deleted should be deleted
// completely"): a car photo that no car row points to any more — the car was deleted, or its photo
// was replaced or removed — is deleted from storage, with its small copies (`<key>.w640.webp`,
// `<key>.w1280.webp`, lib/photos/variant.ts). `vehicles.photo_path` is the only place that holds a
// car photo key (bookings, mails and the public site hold none), and every upload gets its own key.
//
// Safety: only a readable key under `vehicles/`; a failure is logged and never fails the caller
// (the row change has already committed).

import { isReadablePhotoKey } from "./photos";
import { PHOTO_VARIANT_WIDTHS, variantKey } from "../photos/variant";

export const VEHICLE_PHOTO_PREFIX = "vehicles/";

type DeletingBucket = Pick<R2Bucket, "delete">;

/** Deletes one stored car photo and its small copies. Returns the keys it asked storage to delete. */
export async function deleteVehiclePhoto(
  bucket: DeletingBucket,
  key: string | null | undefined,
): Promise<string[]> {
  const k = typeof key === "string" ? key.trim() : "";
  if (!k || !k.startsWith(VEHICLE_PHOTO_PREFIX) || !isReadablePhotoKey(k)) return [];
  const keys = [k, ...PHOTO_VARIANT_WIDTHS.map((w) => variantKey(k, w))];
  await bucket.delete(keys);
  return keys;
}

/** After a car delete or a photo change. Never throws; logs what it did. */
export async function removeVehiclePhoto(
  env: CloudflareEnv,
  key: string | null | undefined,
  why: "car-deleted" | "photo-replaced",
): Promise<void> {
  try {
    if (!env.PHOTOS) return;
    const deleted = await deleteVehiclePhoto(env.PHOTOS, key);
    if (deleted.length) console.log("vehicle_photo_deleted", { why, keys: deleted });
  } catch (error) {
    console.error("vehicle_photo_delete_failed", { why, error: error instanceof Error ? error.message : String(error) });
  }
}
