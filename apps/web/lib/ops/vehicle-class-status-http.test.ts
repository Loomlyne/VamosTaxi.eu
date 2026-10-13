// apps/web/lib/ops/vehicle-class-status-http.test.ts
//
// Phase 30 CLS-01: PATCH /api/staff/vehicle-classes {id,status,reason?} moves a class through
// the database RPC. The route reads only id/status/reason, maps the database refusals to JSON,
// and exports no DELETE. No Hyperdrive: the write and read libs are mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const setVehicleClassStatus = vi.fn();
const updateVehicleClassCapacities = vi.fn();
const patchDraftClass = vi.fn();
const loadVehicleClasses = vi.fn();

vi.mock("@/lib/ops/staff-json", async () => {
  const actual = await vi.importActual<typeof import("./staff-json")>("./staff-json");
  const call =
    (handler: (claims: unknown, request: Request) => Promise<Response> | Response) =>
    (request: Request) =>
      handler({ sub: "admin" }, request);
  return { ...actual, withAdmin: call, withStaff: call };
});
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/db/identity", () => ({ asStaff: vi.fn() }));
vi.mock("@/lib/ops/fleet-write", () => ({
  setVehicleClassStatus: (...a: unknown[]) => setVehicleClassStatus(...a),
  updateVehicleClassCapacities: (...a: unknown[]) => updateVehicleClassCapacities(...a),
  patchDraftClass: (...a: unknown[]) => patchDraftClass(...a),
  insertVehicleClassOnDraft: vi.fn(),
}));
vi.mock("@/lib/ops/rate-book", () => ({ resolveWritableDraftId: async () => 7 }));
vi.mock("@/lib/ops/fleet", async () => {
  const actual = await vi.importActual<typeof import("./fleet")>("./fleet");
  return { ...actual, loadVehicleClasses: (...a: unknown[]) => loadVehicleClasses(...a) };
});

import * as routeModule from "../../app/[locale]/(ops)/api/staff/vehicle-classes/route";

const ID = "11111111-1111-4111-8111-111111111111";
const ROW = {
  id: ID,
  slug: "luxury-van",
  passengerCapacity: 6,
  luggageCapacity: 6,
  sortOrder: 3,
  active: true,
  vehicleCount: 0,
  status: "live",
  retiredReason: "",
  inLiveBook: true,
  missing: "",
  unassignedPaidTrips: 0,
  name: "Luxury Van",
  photoPath: "classes/x.webp",
};

function patch(body: unknown): Promise<Response> {
  const request = new Request("https://dashboard.vamostaxi.site/api/staff/vehicle-classes", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return (routeModule.PATCH as unknown as (r: Request) => Promise<Response>)(request);
}

function sqlError(code: string, message: string, detail?: string) {
  return Object.assign(new Error(message), { code, detail });
}

beforeEach(() => {
  setVehicleClassStatus.mockReset().mockResolvedValue("live");
  updateVehicleClassCapacities.mockReset();
  patchDraftClass.mockReset();
  loadVehicleClasses.mockReset().mockResolvedValue([ROW]);
});

describe("PATCH /api/staff/vehicle-classes status", () => {
  it("200 with the presented row after the RPC", async () => {
    const res = await patch({ id: ID, status: "live" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, data: { id: ID, status: "live", missing: "", inLiveBook: true } });
    expect(setVehicleClassStatus).toHaveBeenCalledWith({}, { sub: "admin" }, ID, "live", null);
  });

  it("passes a trimmed reason to the RPC on retire", async () => {
    setVehicleClassStatus.mockResolvedValue("retired");
    await patch({ id: ID, status: "retired", reason: "  sold the van " });
    expect(setVehicleClassStatus).toHaveBeenCalledWith({}, { sub: "admin" }, ID, "retired", "sold the van");
  });

  it("409 incomplete carries the missing list", async () => {
    setVehicleClassStatus.mockRejectedValue(sqlError("P0001", "incomplete", "photo,price"));
    const res = await patch({ id: ID, status: "live" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, code: "incomplete", missing: "photo,price" });
  });

  it("409 bad-transition", async () => {
    setVehicleClassStatus.mockRejectedValue(sqlError("P0001", "bad-transition"));
    const res = await patch({ id: ID, status: "draft" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, code: "bad-transition" });
  });

  it("404 not-found", async () => {
    setVehicleClassStatus.mockRejectedValue(sqlError("P0002", "not-found"));
    const res = await patch({ id: ID, status: "live" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "not-found" });
  });

  it("403 not-admin", async () => {
    setVehicleClassStatus.mockRejectedValue(sqlError("42501", "admin-only"));
    const res = await patch({ id: ID, status: "live" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not-admin" });
  });

  it("400 for a status outside the whitelist, a non-uuid id and a 141-char reason; no write", async () => {
    for (const body of [
      { id: ID, status: "deleted" },
      { id: "not-a-uuid", status: "live" },
      { id: ID, status: "retired", reason: "x".repeat(141) },
    ]) {
      const res = await patch(body);
      expect(res.status).toBe(400);
    }
    expect(setVehicleClassStatus).not.toHaveBeenCalled();
  });

  it("22023 and 22001 from the database map to 400", async () => {
    setVehicleClassStatus.mockRejectedValueOnce(sqlError("22023", "bad-status"));
    expect((await patch({ id: ID, status: "live" })).status).toBe(400);
    setVehicleClassStatus.mockRejectedValueOnce(sqlError("22001", "reason-too-long"));
    const res = await patch({ id: ID, status: "retired", reason: "x" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid-reason" });
  });

  it("ignores every other key: only id, status, reason reach the RPC; no capacity write", async () => {
    await patch({ id: ID, status: "live", active: true, slug: "x", passengerCapacity: 9, name: "Hacked" });
    expect(setVehicleClassStatus).toHaveBeenCalledTimes(1);
    expect(setVehicleClassStatus).toHaveBeenCalledWith({}, { sub: "admin" }, ID, "live", null);
    expect(updateVehicleClassCapacities).not.toHaveBeenCalled();
    expect(patchDraftClass).not.toHaveBeenCalled();
  });
});

describe("vehicle-classes module surface", () => {
  it("has no DELETE export (405)", () => {
    expect("DELETE" in routeModule).toBe(false);
    expect("GET" in routeModule && "PATCH" in routeModule && "POST" in routeModule).toBe(true);
  });
});
