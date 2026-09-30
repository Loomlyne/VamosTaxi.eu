// apps/web/lib/ops/vehicle-seats.ts
//
// A plate has Morning and Night only. Independent of the chauffeur clock.

export type VehicleSeat = "morning" | "night";

export class VehicleSeatError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "VehicleSeatError";
    this.key = key;
  }
}

export type VehicleSeats = {
  morningId: string | null;
  nightId: string | null;
};

/** OpsFleet vehicle save posts the full pair. Occupied seats are replaced. */
export function replaceVehicleSeats(input: {
  morningId: string | null;
  nightId: string | null;
}): VehicleSeats {
  const morningId = input.morningId || null;
  const nightId = input.nightId || null;
  if (morningId && nightId && morningId === nightId) {
    throw new VehicleSeatError("fleet-seat-both-taken");
  }
  return { morningId, nightId };
}
