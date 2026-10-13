// apps/web/lib/ops/vehicle-class-empty-seats.test.ts
//
// Phase 30 decision 6 (signed 2026-10-12): a new class starts with seats and bags empty (null,
// never 3 and never 0) on both ADD CLASS paths, and they can be emptied only while the class
// is a Draft. No Hyperdrive: a recorder stands in for the postgres.js tag.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();
const loadVehicleClasses = vi.fn();

vi.mock("../db/identity", () => ({ asStaff: (...a: unknown[]) => asStaff(...a) }));
vi.mock("@/lib/db/identity", () => ({ asStaff: (...a: unknown[]) => asStaff(...a) }));
vi.mock("./chauffeur-desk", () => ({ persistVehicleSeats: vi.fn() }));
vi.mock("./must-fix-mail", () => ({ tripsFromRows: vi.fn() }));
vi.mock("@/lib/ops/staff-json", async () => {
  const actual = await vi.importActual<typeof import("./staff-json")>("./staff-json");
  const call =
    (handler: (claims: unknown, request: Request) => Promise<Response> | Response) =>
    (request: Request) =>
      handler({ sub: "admin" }, request);
  return { ...actual, withAdmin: call, withStaff: call };
});
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/ops/rate-book", async () => {
  const actual = await vi.importActual<typeof import("./rate-book")>("./rate-book");
  return { ...actual, resolveWritableDraftId: async () => 7 };
});
vi.mock("@/lib/ops/fleet", async () => {
  const actual = await vi.importActual<typeof import("./fleet")>("./fleet");
  return { ...actual, loadVehicleClasses: (...a: unknown[]) => loadVehicleClasses(...a) };
});

import * as routeModule from "../../app/[locale]/(ops)/api/staff/vehicle-classes/route";
import { VehicleClassInputError, assertVehicleClassInput } from "./fleet";
import { fleetJsonError, parseClassCount, parseVehicleClassPatch } from "./fleet-http";
import { patchDraftClass, updateVehicleClassCapacities } from "./fleet-write";

const claims: VamosClaims = { sub: "a0000000-0000-4000-8000-000000000015", role: "authenticated", app_metadata: { vamos_role: "admin" } };
const ID = "e0000000-0000-4000-8000-00000000ec01";

type Call = { text: string; values: unknown[] };

/** Recorder: the first statement answers `first`; the rest answer []. */
function recorder(first: unknown[]) {
  const calls: Call[] = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("$"), values });
    return Promise.resolve(calls.length === 1 ? first : []);
  };
  asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (s: unknown) => unknown) => fn(sql));
  return calls;
}

function post(body: unknown): Promise<Response> {
  const request = new Request("https://dashboard.vamostaxi.site/api/staff/vehicle-classes", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return (routeModule.POST as unknown as (r: Request) => Promise<Response>)(request);
}

beforeEach(() => {
  asStaff.mockReset();
  loadVehicleClasses.mockReset().mockResolvedValue([]);
});

describe("ADD CLASS (vehicle-classes POST): empty seats and bags are null", () => {
  it("binds null for the class and null max_pax for the parked row, never 3", async () => {
    const calls = recorder([{ id: ID }]);
    const res = await post({ name: "Minibus" });
    expect(res.status).toBe(201);
    const cls = calls[0]!.values; // slug, seats, bags, sort_order, name, photo
    expect(cls[1]).toBeNull();
    expect(cls[2]).toBeNull();
    expect(cls).not.toContain(3);
    const row = calls[1]!.values; // draft version, class id, max_pax
    expect(row).toEqual([7, ID, null]);
  });

  it("an empty string is empty too", async () => {
    const calls = recorder([{ id: ID }]);
    await post({ name: "Minibus", passengerCapacity: "", luggageCapacity: "" });
    expect(calls[0]!.values[1]).toBeNull();
    expect(calls[0]!.values[2]).toBeNull();
  });

  it("seats 4 and bags 0 are kept (0 bags is a real count)", async () => {
    const calls = recorder([{ id: ID }]);
    await post({ name: "Minibus", passengerCapacity: 4, luggageCapacity: 0 });
    expect(calls[0]!.values[1]).toBe(4);
    expect(calls[0]!.values[2]).toBe(0);
    expect(calls[1]!.values).toEqual([7, ID, 4]);
  });

  it("text that is not a number is refused, not stored as 0", async () => {
    const calls = recorder([{ id: ID }]);
    const res = await post({ name: "Minibus", passengerCapacity: "abc" });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("parse and assert", () => {
  it("parseClassCount: absent, null and blank are null", () => {
    expect(parseClassCount(undefined)).toBeNull();
    expect(parseClassCount(null)).toBeNull();
    expect(parseClassCount("")).toBeNull();
    expect(parseClassCount("  ")).toBeNull();
    expect(parseClassCount(0)).toBe(0);
    expect(parseClassCount("5")).toBe(5);
  });

  it("parseVehicleClassPatch gives null for an empty count and names what the body carried", () => {
    const out = parseVehicleClassPatch({ id: ID, passengerCapacity: "" });
    expect(out.input.passengerCapacity).toBeNull();
    expect(out.present).toEqual({ passengerCapacity: true, luggageCapacity: false });
  });

  it("assertVehicleClassInput accepts null and still refuses 0 seats and 17 bags", () => {
    expect(assertVehicleClassInput({ passengerCapacity: null, luggageCapacity: null })).toMatchObject({
      passengerCapacity: null,
      luggageCapacity: null,
    });
    expect(() => assertVehicleClassInput({ passengerCapacity: 0, luggageCapacity: 1 })).toThrow(/fleet-failure-passengers/);
    expect(() => assertVehicleClassInput({ passengerCapacity: 1, luggageCapacity: 17 })).toThrow(/fleet-failure-luggage/);
    expect(() => assertVehicleClassInput({ passengerCapacity: Number.NaN, luggageCapacity: 1 })).toThrow(/fleet-failure-passengers/);
  });
});

describe("emptying seats or bags only while Draft", () => {
  const empty = { passengerCapacity: null, luggageCapacity: 2, sortOrder: 0, active: true };

  it("a Live class refuses null seats before any write", async () => {
    const calls = recorder([{ active: true, hidden_at: null }]);
    await expect(updateVehicleClassCapacities({} as CloudflareEnv, claims, ID, empty)).rejects.toMatchObject({
      key: "fleet-failure-passengers",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toMatch(/select active, hidden_at/);
  });

  it("a Retired class refuses null bags too", async () => {
    const calls = recorder([{ active: false, hidden_at: "2026-10-12T00:00:00Z" }]);
    await expect(
      updateVehicleClassCapacities({} as CloudflareEnv, claims, ID, { ...empty, passengerCapacity: 3, luggageCapacity: null }),
    ).rejects.toBeInstanceOf(VehicleClassInputError);
    expect(calls).toHaveLength(1);
  });

  it("a Draft records the update with null and keeps its open draft row in step", async () => {
    const calls = recorder([{ active: false, hidden_at: null }]);
    await updateVehicleClassCapacities({} as CloudflareEnv, claims, ID, empty, { draftVersionId: 7 });
    expect(calls).toHaveLength(3);
    expect(calls[1]!.text).toMatch(/update public\.vehicle_classes/);
    expect(calls[1]!.values).toContain(null);
    expect(calls[2]!.text).toMatch(/update public\.distance_rates/);
    expect(calls[2]!.text).toMatch(/max_pax = vc\.passenger_capacity/);
    expect(calls[2]!.values).toEqual([ID, 7]);
  });

  it("a count the body did not name is left alone (no refusal, no overwrite)", async () => {
    const calls = recorder([{ active: true, hidden_at: null }]);
    await updateVehicleClassCapacities(
      {} as CloudflareEnv,
      claims,
      ID,
      { passengerCapacity: 5, luggageCapacity: null, sortOrder: 0, active: true },
      { present: { passengerCapacity: true, luggageCapacity: false } },
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]!.values.slice(0, 4)).toEqual([true, 5, false, null]);
  });

  it("patchDraftClass refuses an emptied seat count on a Live class and writes nothing", async () => {
    const calls = recorder([{ active: true, hidden_at: null }]);
    await expect(patchDraftClass({} as CloudflareEnv, claims, ID, 7, { maxPax: null })).rejects.toMatchObject({
      key: "fleet-failure-passengers",
    });
    expect(calls).toHaveLength(1);
  });

  it("patchDraftClass empties the draft row seat count on a Draft", async () => {
    const calls = recorder([{ active: false, hidden_at: null }]);
    await patchDraftClass({} as CloudflareEnv, claims, ID, 7, { maxPax: null });
    expect(calls[1]!.text).toMatch(/set max_pax = /);
    expect(calls[1]!.values).toEqual([null, ID, 7]);
  });

  it("a 23514 from the database CHECK answers 400", async () => {
    const res = fleetJsonError({ code: "23514", constraint: "vehicle_classes_live_has_seats_bags" });
    expect(res.status).toBe(400);
  });
});

describe("rate-book PUT distance branch (source)", () => {
  const route = readFileSync(
    join(__dirname, "..", "..", "app/[locale]/(ops)/api/staff/rate-book/route.ts"),
    "utf8",
  );

  it("never copies seats into bags and never defaults seats to 1", () => {
    expect(route).not.toContain("?? incoming.maxPax");
    expect(route).not.toMatch(/maxPax: maxPax \?\? 1/);
  });

  it("refuses an emptied count on a Live class with 400 invalid and maps 23514 to the same 400", () => {
    expect(route).toMatch(/classIsLive && \(incoming\.maxPax === null \|\| maxBags === null\)\) return jsonErr\("invalid", 400\)/);
    expect(route).toMatch(/"23514"[\s\S]{0,200}jsonErr\("invalid", 400\)/);
  });
});
