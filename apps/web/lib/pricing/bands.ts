// Per-class km-band extras on top of class per-km (D-11, D-14).
// Covered metres are [0, distanceM). A band covers [from_km, to_km);
// null to_km is open last. Overlapping slices take the higher per_km_rappen.

import { perKm } from "./round";
import type { DistanceBandRow } from "./types";

/**
 * Extra rappen for metres in this class's bands only — never a floor lump.
 * D-14: filter by vehicle_class_id; From inclusive / To exclusive.
 */
export function classBandExtrasRappen(
  distanceM: number,
  bands: DistanceBandRow[],
  vehicleClassId: string,
): number {
  if (distanceM <= 0) return 0;
  const classed = bands.filter((row) => row.vehicle_class_id === vehicleClassId);
  if (classed.length === 0) return 0;

  const points = new Set<number>([0, distanceM]);
  for (const band of classed) {
    points.add(band.from_km * 1000);
    if (band.to_km !== null) points.add(band.to_km * 1000);
  }

  const sorted = [...points]
    .filter((p) => p >= 0 && p <= distanceM)
    .sort((a, b) => a - b);

  let extra = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i]!;
    const hi = sorted[i + 1]!;
    const span = hi - lo;
    if (span <= 0) continue;

    let best: number | null = null;
    for (const band of classed) {
      const startM = band.from_km * 1000;
      const endM =
        band.to_km === null ? Number.POSITIVE_INFINITY : band.to_km * 1000;
      if (lo >= startM && lo < endM) {
        if (best === null || band.per_km_rappen > best) {
          best = band.per_km_rappen;
        }
      }
    }
    if (best !== null) extra += perKm(best, span);
  }
  return extra;
}
