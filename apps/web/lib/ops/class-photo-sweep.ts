// apps/web/lib/ops/class-photo-sweep.ts
//
// Quick 260930-cpr (owner, 2026-09-30): a replaced class photo and its small copies are deleted
// from storage when the price book is published, and a class's photo goes when the class is
// deleted for good. `vehicle_classes.photo_path` is the only place that holds a class photo key
// (bookings, quotes, price snapshots and mails hold none), so a stored class photo that no class
// row points to any more is no longer used by anything and is removed.
//
// Safety: only keys under `classes/`; never a key a class row points to (active or not); never a
// photo uploaded in the last 24 hours (it may belong to a Save still being made); small copies
// (`<key>.w640.webp`) follow their original. A failure is logged and never fails the caller.

import { asStaff, type VamosClaims } from "../db/identity";

export const CLASS_PHOTO_PREFIX = "classes/";
export const CLASS_PHOTO_GRACE_MS = 24 * 60 * 60 * 1000;

const VARIANT_SUFFIX_RE = /\.w\d+\.webp$/;

export type StoredPhoto = { key: string; uploaded: Date };

/** The original a stored key belongs to: itself, or the key a small copy was made from. */
export function photoOriginalOf(key: string): string {
  return key.replace(VARIANT_SUFFIX_RE, "");
}

/**
 * Pure: which stored class photos to delete. `inUse` holds every class row's photo_path.
 * An original younger than the grace keeps itself and its small copies; a small copy whose
 * original is gone is deleted.
 */
export function planClassPhotoSweep(
  stored: StoredPhoto[],
  inUse: ReadonlySet<string>,
  now: number,
  graceMs: number = CLASS_PHOTO_GRACE_MS,
): string[] {
  const originals = new Map<string, StoredPhoto>();
  for (const s of stored) if (s.key === photoOriginalOf(s.key)) originals.set(s.key, s);
  const out: string[] = [];
  for (const s of stored) {
    if (!s.key.startsWith(CLASS_PHOTO_PREFIX)) continue;
    const original = photoOriginalOf(s.key);
    if (inUse.has(original)) continue;
    const base = originals.get(original);
    if (base && now - base.uploaded.getTime() < graceMs) continue;
    out.push(s.key);
  }
  return out;
}

type ListingBucket = Pick<R2Bucket, "list" | "delete">;

/** Lists every stored class photo, deletes what `planClassPhotoSweep` names, returns the deleted keys. */
export async function sweepClassPhotos(
  bucket: ListingBucket,
  inUse: ReadonlySet<string>,
  now: number = Date.now(),
  opts: { prefix?: string; graceMs?: number } = {},
): Promise<string[]> {
  const prefix = opts.prefix ?? CLASS_PHOTO_PREFIX;
  const stored: StoredPhoto[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const o of page.objects) stored.push({ key: o.key, uploaded: o.uploaded });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const doomed = planClassPhotoSweep(stored, inUse, now, opts.graceMs ?? CLASS_PHOTO_GRACE_MS);
  for (let i = 0; i < doomed.length; i += 1000) await bucket.delete(doomed.slice(i, i + 1000));
  return doomed;
}

/** Every photo key a class row points to, active or hidden. */
export async function classPhotoKeysInUse(env: CloudflareEnv, claims: VamosClaims): Promise<Set<string>> {
  const rows = await asStaff(env, claims, async (sql) => {
    const r = await sql<{ photo_path: string | null }[]>`
      select photo_path from public.vehicle_classes where photo_path is not null
    `;
    return r.map((x) => x.photo_path);
  });
  return new Set(rows.filter((k): k is string => typeof k === "string" && k.length > 0));
}

/**
 * After a publish (every unused class photo, 24-hour grace) or after a class hard delete (only that
 * class's own folder `classes/<id>/`, no grace: the class is gone). Never throws; logs what it did.
 */
export async function removeUnusedClassPhotos(
  env: CloudflareEnv,
  claims: VamosClaims,
  why: "publish" | "class-deleted",
  classId?: string,
): Promise<void> {
  try {
    if (!env.PHOTOS) return;
    if (why === "class-deleted" && !/^[0-9a-f-]{36}$/i.test(classId ?? "")) return;
    const inUse = await classPhotoKeysInUse(env, claims);
    const deleted = await sweepClassPhotos(
      env.PHOTOS,
      inUse,
      Date.now(),
      why === "class-deleted" ? { prefix: `${CLASS_PHOTO_PREFIX}${classId}/`, graceMs: 0 } : {},
    );
    if (deleted.length) console.log("class_photos_deleted", { why, keys: deleted });
  } catch (error) {
    console.error("class_photo_delete_failed", { why, error: error instanceof Error ? error.message : String(error) });
  }
}
