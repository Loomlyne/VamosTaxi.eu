// apps/web/lib/ops/assign-rpc-errors.test.ts
//
// Quick 260930-dash-assign. assignBooking / unassignBooking must hand the dashboard the RPC's
// named refusal ({ ok:false, code }) — never throw. A throw leaves the route without an answer:
// the Worker sends a 500 with no JSON and OpsDetail shows the generic "Could not assign VT-…".
//
// asSystem is stood in with the one postgres.js rule that matters here (postgres@3.4.9,
// cf/src/index.js — the build the Worker loads — lines 256-293): every query inside
// sql.begin() gets `q.catch(e => uncaughtError || (uncaughtError = e))`, and after the callback
// resolves `if (uncaughtError) throw uncaughtError` — so a query error the callback caught is
// thrown anyway. A deferred GiST overlap (ops_assign_leg sets both no-overlap constraints
// DEFERRED) fails at COMMIT, after the callback. assign.local.test.ts proves the same on a real
// database.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();
const asSystem = vi.fn();

vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
  asSystem: (...args: unknown[]) => asSystem(...args),
}));
vi.mock("./resolve-booking-id", () => ({
  resolveStaffBookingId: async (_env: unknown, _claims: unknown, key: string) => (key ? BOOKING : null),
}));
vi.mock("../lifecycle/notify-lifecycle", () => ({
  notifyAssignmentCustomer: vi.fn(async () => undefined),
}));

import { assignBooking, unassignBooking } from "./assign";

const BOOKING = "b0000000-0000-4000-8000-000000000006";
const CHAUFFEUR = "c0000000-0000-4000-8000-000000000004";
const env = {} as CloudflareEnv;
const claims: VamosClaims = {
  sub: "a0000000-0000-4000-8000-000000000005",
  role: "authenticated",
  app_metadata: { vamos_role: "admin" },
};

/** A PostgresError as postgres.js builds it: message is the RAISE text, code the SQLSTATE. */
function pgError(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { name: "PostgresError", code });
}

/** sql.begin() as postgres.js runs it (see header). */
function beginLike(step: { queryError?: unknown; rows?: unknown[]; commitError?: unknown }) {
  return async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    let uncaught: unknown;
    const sql = () => {
      const q = step.queryError ? Promise.reject(step.queryError) : Promise.resolve(step.rows ?? []);
      q.catch((e: unknown) => {
        if (uncaught === undefined) uncaught = e;
      });
      return q;
    };
    const result = await fn(sql);
    if (uncaught !== undefined) throw uncaught;
    if (step.commitError) throw step.commitError;
    return result;
  };
}

beforeEach(() => {
  asStaff.mockReset();
  asSystem.mockReset();
});

describe("assignBooking answers the RPC's refusal instead of throwing", () => {
  it("chauffeur without a class (raced past the page's check) → no-class (no cars, 2026-10-01)", async () => {
    asSystem.mockImplementation(beginLike({ queryError: pgError("no-class", "P0001") }));
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({
      ok: false,
      code: "no-class",
    });
  });

  it("chauffeur of another class (raced past the page's check) → class-mismatch", async () => {
    asSystem.mockImplementation(beginLike({ queryError: pgError("class-mismatch", "P0001") }));
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({
      ok: false,
      code: "class-mismatch",
    });
  });

  it("every other named refusal reaches the page too", async () => {
    for (const name of ["no-email", "not-paid", "frozen", "capacity"]) {
      asSystem.mockImplementation(beginLike({ queryError: pgError(name, "P0001") }));
      await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({ ok: false, code: name });
    }
    asSystem.mockImplementation(beginLike({ queryError: pgError("not-found", "P0002") }));
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({ ok: false, code: "not-found" });
  });

  it("an overlap that fails at COMMIT → overlap with the other trip", async () => {
    asSystem.mockImplementation(
      beginLike({
        rows: [{ booking_id: BOOKING, leg_id: "l1", chauffeur_id: CHAUFFEUR, vehicle_id: null }],
        commitError: pgError("conflicting key value violates exclusion constraint", "23P01"),
      }),
    );
    asStaff.mockResolvedValue({ otherRef: "VT-26-0101", otherLocal: "2027-09-24T10:30" });
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({
      ok: false,
      code: "overlap",
      otherRef: "VT-26-0101",
      otherLocal: "2027-09-24T10:30",
    });
  });

  it("a clean run returns the assigned chauffeur and no vehicle (the RPC answers vehicle_id null)", async () => {
    asSystem.mockImplementation(
      beginLike({ rows: [{ booking_id: BOOKING, leg_id: "l1", chauffeur_id: CHAUFFEUR, vehicle_id: null }] }),
    );
    asStaff.mockResolvedValue({ mail: null, customer: null });
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({
      ok: true,
      bookingId: BOOKING,
      legId: "l1",
      chauffeurId: CHAUFFEUR,
    });
  });
});

describe("unassignBooking answers the RPC's refusal instead of throwing", () => {
  it("frozen trip → frozen", async () => {
    asStaff.mockResolvedValue(null);
    asSystem.mockImplementation(beginLike({ queryError: pgError("frozen", "P0001") }));
    await expect(unassignBooking(env, claims, BOOKING)).resolves.toEqual({ ok: false, code: "frozen" });
  });
});
