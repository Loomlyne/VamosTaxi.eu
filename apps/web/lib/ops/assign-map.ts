// apps/web/lib/ops/assign-map.ts
//
// 08-04: SQLSTATE → staff assign envelope. No identity, no Hyperdrive.

import { OPS_SQLSTATE } from "./sqlstate";

export type AssignOverlap = { otherRef: string; otherLocal: string };

export type AssignFail = {
  ok: false;
  code: string;
  otherRef?: string;
  otherLocal?: string;
  /** class-mismatch only: the driver's car class and the trip's class, as the owner names them. */
  carClass?: string;
  tripClass?: string;
};

/** The driver's car and the trip's class, read before assigning (260930-dash-design). */
export type AssignClassFacts = {
  carId: string | null;
  carClassId: string | null;
  carClassName: string;
  tripClassId: string | null;
  tripClassName: string;
};

export type AssignOk = {
  ok: true;
  bookingId: string;
  legId: string;
  chauffeurId?: string;
  vehicleId?: string;
};

export type AssignResult = AssignOk | AssignFail;

const NAMED: readonly string[] = Object.freeze(["no-email", "no-vehicle", "not-paid", "frozen", "capacity", "not-found"]);

function codeOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function messageOf(err: unknown): string {
  if (typeof err !== "object" || err === null) return "";
  if (!("message" in err)) return "";
  const message = (err as { message: unknown }).message;
  return typeof message === "string" ? message : "";
}

export function sqlErrorCode(err: unknown): string | undefined {
  return codeOf(err);
}

export function mapAssignSqlError(err: unknown, overlap?: AssignOverlap | null): AssignFail {
  const code = codeOf(err);
  if (code === OPS_SQLSTATE.exclusion) {
    return {
      ok: false,
      code: "overlap",
      otherRef: overlap?.otherRef ?? "",
      otherLocal: overlap?.otherLocal ?? "",
    };
  }
  const message = messageOf(err);
  for (const name of NAMED) {
    if (message === name || message.startsWith(`${name}\n`) || message.startsWith(`${name} `)) {
      return { ok: false, code: name };
    }
  }
  if (code === OPS_SQLSTATE.noData) return { ok: false, code: "not-found" };
  return { ok: false, code: "unknown" };
}

/**
 * Owner rule 2026-10-01: each driver has his own car, and a car of another class than the trip's
 * is refused ("This driver's car is {car class}; the trip is {trip class}."). A driver without a
 * car is left to ops_assign_leg, which answers no-vehicle; an unknown class is never guessed.
 */
export function assignClassRefusal(facts: AssignClassFacts | null | undefined): AssignFail | null {
  if (!facts || !facts.carId) return null;
  const car = facts.carClassId ? String(facts.carClassId) : "";
  const trip = facts.tripClassId ? String(facts.tripClassId) : "";
  if (!car || !trip || car === trip) return null;
  return { ok: false, code: "class-mismatch", carClass: facts.carClassName, tripClass: facts.tripClassName };
}
