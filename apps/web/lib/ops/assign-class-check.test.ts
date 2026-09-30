// apps/web/lib/ops/assign-class-check.test.ts
//
// Quick 260930-dash-design, owner decision 2026-10-01: each driver has his own car, and Assign
// REFUSES when that car's class is not the trip's class ("This driver's car is {car class}; the
// trip is {trip class}."). The check runs in assignBooking BEFORE the database call (the RPC
// ops_assign_leg has no class check), so a refused assign writes nothing.
//
// asStaff / asSystem are stood in; the class facts come back from the staff read the way
// asStaff hands back its callback's value.
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
const CAR = "87a4578f-0000-4000-8000-000000000013";
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

describe("assignClassRefusal (pure)", () => {
  it("refuses when the car's class is not the trip's class, naming both", () => {
    expect(
      assignClassRefusal({
        carId: CAR,
        carClassId: ECONOMY,
        carClassName: "Economy",
        tripClassId: BUSINESS,
        tripClassName: "Business",
      }),
    ).toEqual({ ok: false, code: "class-mismatch", carClass: "Economy", tripClass: "Business" });
  });

  it("lets the same class through", () => {
    expect(
      assignClassRefusal({
        carId: CAR,
        carClassId: BUSINESS,
        carClassName: "Business",
        tripClassId: BUSINESS,
        tripClassName: "Business",
      }),
    ).toBeNull();
  });

  it("leaves a driver without a car to the database's no-vehicle answer", () => {
    expect(
      assignClassRefusal({
        carId: null,
        carClassId: null,
        carClassName: "",
        tripClassId: BUSINESS,
        tripClassName: "Business",
      }),
    ).toBeNull();
  });

  it("does not guess when a class is unknown", () => {
    expect(assignClassRefusal(null)).toBeNull();
    expect(
      assignClassRefusal({ carId: CAR, carClassId: ECONOMY, carClassName: "Economy", tripClassId: null, tripClassName: "" }),
    ).toBeNull();
  });
});

describe("loadAssignClassFacts reads the car's class and the trip's class", () => {
  it("maps the row and names a class by its typed name, else by its slug", async () => {
    const sql = vi.fn(async () => [
      {
        car_id: CAR,
        car_class_id: ECONOMY,
        car_class_name: null,
        car_class_slug: "saden",
        trip_class_id: BUSINESS,
        trip_class_name: "Business",
        trip_class_slug: "mercedes-benz-v-class",
      },
    ]);
    await expect(loadAssignClassFacts(sql as never, BOOKING, CHAUFFEUR)).resolves.toEqual({
      carId: CAR,
      carClassId: ECONOMY,
      carClassName: "Economy",
      tripClassId: BUSINESS,
      tripClassName: "Business",
    });
  });

  it("answers null when the booking or the driver is not there", async () => {
    const sql = vi.fn(async () => []);
    await expect(loadAssignClassFacts(sql as never, BOOKING, CHAUFFEUR)).resolves.toBeNull();
  });
});

describe("assignBooking refuses a car of another class before the database call", () => {
  it("Economy car on a Business trip → class-mismatch, nothing written", async () => {
    asStaff.mockResolvedValueOnce({
      carId: CAR,
      carClassId: ECONOMY,
      carClassName: "Economy",
      tripClassId: BUSINESS,
      tripClassName: "Business",
    });
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({
      ok: false,
      code: "class-mismatch",
      carClass: "Economy",
      tripClass: "Business",
    });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("same class → the RPC runs and the assignment comes back", async () => {
    asStaff
      .mockResolvedValueOnce({
        carId: CAR,
        carClassId: BUSINESS,
        carClassName: "Business",
        tripClassId: BUSINESS,
        tripClassName: "Business",
      })
      .mockResolvedValue({ mail: null, customer: null });
    asSystem.mockImplementation(async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) =>
      fn(async () => [{ booking_id: BOOKING, leg_id: "l1", chauffeur_id: CHAUFFEUR, vehicle_id: CAR }]),
    );
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({
      ok: true,
      bookingId: BOOKING,
      legId: "l1",
      chauffeurId: CHAUFFEUR,
      vehicleId: CAR,
    });
    expect(asSystem).toHaveBeenCalledTimes(1);
  });

  it("a failed class read answers a refusal, never a throw (no 500)", async () => {
    asStaff.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "08006" }));
    await expect(assignBooking(env, claims, BOOKING, CHAUFFEUR)).resolves.toEqual({ ok: false, code: "unknown" });
    expect(asSystem).not.toHaveBeenCalled();
  });
});

describe("the assign route hands the refusal to the page", () => {
  it("class-mismatch is a 409 that carries both class names", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const route = readFileSync(
      fileURLToPath(new URL("../../app/[locale]/(ops)/api/staff/bookings/[id]/assign/route.ts", import.meta.url)),
      "utf8",
    );
    expect(route).toMatch(/code === "class-mismatch"/);
    expect(route).toMatch(/jsonErr\("class-mismatch", 409, \{[\s\S]*carClass: result\.carClass[\s\S]*tripClass: result\.tripClass/);
  });
});
