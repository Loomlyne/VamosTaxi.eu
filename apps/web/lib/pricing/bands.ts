// Blended km fare after the class floor (04.3 / D-46).
// First DISTANCE_FLOOR_KM metres are the min fare lump. Remaining metres
// walk the bands. Same per-km table for every class.

import { perKm } from "./round";
import type { DistanceBandRow } from "./types";

export const DISTANCE_FLOOR_KM = 20;
export const DISTANCE_FLOOR_M = DISTANCE_FLOOR_KM * 1000;

export function blendedExtraRappen(
  distanceM: number,
  bands: DistanceBandRow[],
): number {
  if (distanceM <= DISTANCE_FLOOR_M) return 0;
  const ordered = [...bands].sort((a, b) => a.from_km - b.from_km);
  let extra = 0;
  let cursor = DISTANCE_FLOOR_M;
  for (const band of ordered) {
    const startM = band.from_km * 1000;
    const endM = band.to_km === null ? Number.POSITIVE_INFINITY : band.to_km * 1000;
    if (distanceM <= startM) break;
    const lo = Math.max(cursor, startM);
    const hi = Math.min(distanceM, endM);
    if (hi > lo) extra += perKm(band.per_km_rappen, hi - lo);
    cursor = Math.max(cursor, hi);
  }
  return extra;
}

export function blendedFareRappen(
  distanceM: number,
  minFareRappen: number,
  bands: DistanceBandRow[],
): number {
  return minFareRappen + blendedExtraRappen(distanceM, bands);
}
