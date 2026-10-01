// apps/web/lib/ops/assign-class-check.test.ts
//
// Quick 261001-chauffeur-car, owner decisions 2026-10-01 (.planning/decisions/2026-10-01-no-cars-page.md):
// no cars. Each chauffeur is chosen by his class, and Assign REFUSES a driver of another class than
// the trip ("Marco drives Economy; the trip is Business.") or a driver without a class. The check
// runs in assignBooking BEFORE the database call, so a refused assign writes nothing; the RPC
// ops_assign_leg (20261007160000) checks the same rule again.
//
// asStaff / asSystem are stood in; the class facts come back from the staff read the way
// asStaff hands back its callback's value.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

import { assignClassRefusal } from "./assign-map";
import { assignBooking, loadAssignClassFacts } from "./assign";

const BOOKING = "b0000000-0000-4000-8000-000000000016";
const CHAUFFEUR = "c0000000-0000-4000-8000-000000000014";
const ECONOMY = "e0000000-0000-4000-8000-00000000ec01";
const BUSINESS = "e0000000-0000-4000-8000-00000000b501";
const env = {} as CloudflareEnv;
const claims: VamosClaims = {
  sub: "a0000000-0000-4000-8000-000000000015",
  role: "authenticated",
  app_metadata: { vamos_role: "admin" },
};

beforeEach(() => {
  asStaff.mockReset();
  asSystem.mockReset();
});

const facts = (over: Record<string, unknown> = {}) => ({
  driverName: "Marco",
  driverClassId: ECONOMY,
  driverClassName: "Economy",
  tripClassId: BUSINESS,
  tripClassName: "Business",
  ...over,
});

describe("assignClassRefusal (pure)", () => {
  it("refuses a driver of another class than the trip, naming the driver and both classes", () => {
    expect(assignClassRefusal(facts())).toEqual({
      ok: false,
      code: "class-mismatch",
      driverName: "Marco",
      driverClass: "Economy",
      tripClass: "Business",
    });
  });

  it("lets a driver of the trip's class through", () => {
    expect(assignClassRefusal(facts({ driverClassId: BUSINESS, driverClassName: "Business" }))).toBeNull();
  });

  it("refuses a driver without a class", () => {
    expect(assignClassRefusal(facts({ driverClassId: null, driverClassName: "" }))).toEqual({
      ok: false,
      code: "no-class",
      driverName: "Marco",
      tripClass: "Business",
    });
  });

  it("does not guess when the trip's class is unknown or the read found nothing", () => {
    expect(assignClassRefusal(null)).toBeNull();
    expect(assignClassRefusal(facts({ tripClassId: null, tripClassName: "" }))).toBeNull();
  });
});

describe("loadAssignClassFacts reads the driver's class and the trip's class — no car", () => {
  it("maps the row and names a class by its typed name, else by its slug", async () => {
    const sql = vi.fn(async () => [
      {
        driver_name: "Marco Rossi",
        driver_class_id: ECONOMY,
        driver_class_name: null,
        driver_class_slug: "saden",
        trip_class_id: BUSINESS,
        trip_class_name: "Business",
        trip_class_slug: "mercedes-benz-v-class",
      },
    ]);
    await expect(loadAssignClassFacts(sql as never, BOOKING, CHAUFFEUR)).resolves.toEqual({
      driverName: "Marco Rossi",
      driverClassId: ECONOMY,
      driverClassName: "Economy",
      tripClassId: BUSINESS,
      tripClassName: "Business",
    });
  });

  it("reads chauffeurs.vehicle_class_id, never a vehicle", async () => {
    const seen: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      seen.push(strings.join("?"));
      return [];
    });
    await loadAssignClassFacts(sql as never, BOOKING, CHAUFFEUR);
    expect(seen.join("\n")).toMatch(/c\.vehicle_class_id/);
    expect(seen.join("\n")).not.toMatch(/public\.vehicles\b/);
    expect(seen.join("\n")).not.toMatch(/default_vehicle_id/);
  });

  it("answers null when the booking or the driver is not there", async () => {
    const sql = vi.fn(async () => []);
    await expect(loadAssignClassFacts(sql as never, BOOKING, CHAUFFEUR)).resolves.toBeNull();
  });
});

describe("assignBooking refuses a driver of another class before the database call", () => {
  it("Economy driver on a Business trip → class-mismatch, nothing written", async () => {
    asStaff.mockResolvedValueOnce(facts());
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({
      ok: false,
      code: "class-mismatch",
      driverName: "Marco",
      driverClass: "Economy",
      tripClass: "Business",
    });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("a driver without a class → no-class, nothing written", async () => {
    asStaff.mockResolvedValueOnce(facts({ driverClassId: null, driverClassName: "" }));
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toMatchObject({ ok: false, code: "no-class" });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("same class → the RPC runs and the assignment comes back without a vehicle", async () => {
    asStaff
      .mockResolvedValueOnce(facts({ driverClassId: BUSINESS, driverClassName: "Business" }))
      .mockResolvedValue({ mail: null, customer: null });
    asSystem.mockImplementation(async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) =>
      fn(async () => [{ booking_id: BOOKING, leg_id: "l1", chauffeur_id: CHAUFFEUR, vehicle_id: null }]),
    );
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({
      ok: true,
      bookingId: BOOKING,
      legId: "l1",
      chauffeurId: CHAUFFEUR,
    });
    expect(asSystem).toHaveBeenCalledTimes(1);
  });

  it("a failed class read answers a refusal, never a throw (no 500)", async () => {
    asStaff.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "08006" }));
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({ ok: false, code: "unknown" });
    expect(asSystem).not.toHaveBeenCalled();
  });
});

describe("the customer's assignment mail names the chauffeur's plate, never a car", () => {
  it("loadCustomerAssignment reads chauffeurs.plate and no vehicle", () => {
    const src = readFileSync(fileURLToPath(new URL("./assign.ts", import.meta.url)), "utf8");
    const read = src.slice(src.indexOf("async function loadCustomerAssignment"), src.indexOf("async function notifyCustomerAssignment"));
    expect(read).toMatch(/c\.plate as plate/);
    expect(read).toMatch(/null::text as vehicle/);
    expect(read).not.toMatch(/public\.vehicles/);
  });

  it("the overlap read looks at the chauffeur only, never a vehicle", () => {
    const src = readFileSync(fileURLToPath(new URL("./assign.ts", import.meta.url)), "utf8");
    const read = src.slice(src.indexOf("async function loadOverlap"), src.indexOf("type ClassFactsRow"));
    expect(read).not.toMatch(/vehicle/);
  });
});

describe("the assign route hands the refusal to the page", () => {
  const route = () =>
    readFileSync(
      fileURLToPath(new URL("../../app/[locale]/(ops)/api/staff/bookings/[id]/assign/route.ts", import.meta.url)),
      "utf8",
    );
  it("class-mismatch is a 409 that carries the driver's name and both class names", () => {
    expect(route()).toMatch(/code === "class-mismatch"/);
    expect(route()).toMatch(
      /jsonErr\("class-mismatch", 409, \{[\s\S]*driverName: result\.driverName[\s\S]*driverClass: result\.driverClass[\s\S]*tripClass: result\.tripClass/,
    );
  });
  it("no-class is a 409 with the driver's name; no-vehicle is gone", () => {
    expect(route()).toMatch(/jsonErr\("no-class", 409, \{[\s\S]*driverName: result\.driverName/);
    expect(route()).not.toMatch(/no-vehicle/);
  });
});
