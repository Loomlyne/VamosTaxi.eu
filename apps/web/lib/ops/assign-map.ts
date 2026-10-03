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
  /** no-class / class-mismatch: the driver's name, his class and the trip's class, as the owner names them. */
  driverName?: string;
  driverClass?: string;
  tripClass?: string;
};

/** The driver's class and the trip's class, read before assigning (no cars, 2026-10-01). */
export type AssignClassFacts = {
  driverName: string;
  driverClassId: string | null;
  driverClassName: string;
  tripClassId: string | null;
  tripClassName: string;
};

export type AssignOk = {
  ok: true;
  bookingId: string;
  legId: string;
  chauffeurId?: string;
};

export type AssignResult = AssignOk | AssignFail;

const NAMED: readonly string[] = Object.freeze([
  "no-email",
  "no-class",
  "class-mismatch",
  "not-paid",
  "frozen",
  "capacity",
  "not-found",
]);

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
 * Owner decisions 2026-10-01 (.planning/decisions/2026-10-01-no-cars-page.md): no cars; each
 * chauffeur is chosen by his class. A driver of another class than the trip is refused ("Marco
 * drives Economy; the trip is Business."), a driver without a class too. ops_assign_leg
 * (20261007160000) checks the same; an unknown trip class is never guessed.
 */
export function assignClassRefusal(facts: AssignClassFacts | null | undefined): AssignFail | null {
  if (!facts) return null;
  const trip = facts.tripClassId ? String(facts.tripClassId) : "";
  if (!trip) return null;
  const driver = facts.driverClassId ? String(facts.driverClassId) : "";
  if (!driver) {
    return { ok: false, code: "no-class", driverName: facts.driverName, tripClass: facts.tripClassName };
  }
  if (driver === trip) return null;
  return {
    ok: false,
    code: "class-mismatch",
    driverName: facts.driverName,
    driverClass: facts.driverClassName,
    tripClass: facts.tripClassName,
  };
}
