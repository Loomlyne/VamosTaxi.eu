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

export function assertVehicleSeats(input: {
  morningId: string | null;
  nightId: string | null;
  chauffeurId: string;
  seat: VehicleSeat;
}): VehicleSeats {
  const morningId = input.morningId || null;
  const nightId = input.nightId || null;
  const chauffeurId = input.chauffeurId;
  const otherSeatId = input.seat === "morning" ? nightId : morningId;
  const thisSeatId = input.seat === "morning" ? morningId : nightId;

  if (otherSeatId === chauffeurId) {
    throw new VehicleSeatError("fleet-seat-both-taken");
  }

  const bothFilled = Boolean(morningId) && Boolean(nightId);
  if (bothFilled && chauffeurId !== morningId && chauffeurId !== nightId) {
    throw new VehicleSeatError("fleet-seat-both-taken");
  }

  if (thisSeatId && thisSeatId !== chauffeurId) {
    throw new VehicleSeatError(
      input.seat === "morning" ? "fleet-seat-morning-taken" : "fleet-seat-night-taken",
    );
  }

  if (input.seat === "morning") {
    return { morningId: chauffeurId, nightId };
  }
  return { morningId, nightId: chauffeurId };
}

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
