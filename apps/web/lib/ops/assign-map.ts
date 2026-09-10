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
};

export type AssignOk = {
  ok: true;
  bookingId: string;
  legId: string;
  chauffeurId?: string;
  vehicleId?: string;
};

export type AssignResult = AssignOk | AssignFail;

const NAMED = new Set(["no-email", "no-vehicle", "not-paid", "frozen", "capacity", "not-found"]);

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
