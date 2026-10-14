// apps/web/lib/ops/ops-dc-class-pickers.test.ts
//
// 30-06 (CLS-07, decision 6): the console store offers Live classes only in pickers,
// sends every class state change as PATCH (no DELETE), and keeps an empty seat or bag
// count empty (null, never 3). Runs in a bare vm with a stubbed API: no DOM, no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "../../../../app/vamos-ops-data.js"), "utf8");

type Call = { method: string; path: string; body?: unknown };

const CLASSES = [
  { id: "c-sedan", name: "Economy Sedan", status: "live" },
  { id: "c-van", name: "Economy Van", status: "retired" },
  { id: "c-lux", name: "Luxury Van", status: "draft" },
];

function boot(rateRows: Array<Record<string, unknown>> = []) {
  const calls: Call[] = [];
  const request = (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (method === "GET" && path === "/api/staff/vehicle-classes") {
      return Promise.resolve({ ok: true, data: CLASSES });
    }
    if (method === "GET" && path === "/api/staff/rate-versions") {
      return Promise.resolve({ ok: true, data: { versions: [{ id: "v1", status: "live" }] } });
    }
    if (method === "GET" && path.indexOf("/api/staff/rate-book") === 0) {
      return Promise.resolve({
        ok: true,
        data: {
          classes: CLASSES.map((c) => ({ id: c.id, label: c.name })),
          rates: [
            ...CLASSES.map((c) => ({ id: "r-" + c.id, vehicleClassId: c.id, available: true })),
            ...rateRows,
          ],
          zones: [],
        },
      });
    }
    if (method === "PATCH") return Promise.resolve({ ok: true, data: { id: "id-1" } });
    return Promise.resolve({ ok: false, code: "unexpected" });
  };
  const windowStub: Record<string, unknown> = {
    VamosOpsApi: { request },
    dispatchEvent: () => true,
    addEventListener: () => undefined,
  };
  const context = vm.createContext({
    window: windowStub,
    CustomEvent: class {},
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    console,
  });
  vm.runInContext(source, context);
  const ops = windowStub.VamosOps as Record<string, any>;
  return { ops, calls };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("pickers offer Live classes only (CLS-07)", () => {
  it("a Draft or Retired class the live book still rates is left out; names keeps all three", async () => {
    const { ops } = boot();
    ops.liveClasses();
    await settle();
    await settle();
    const got = ops.liveClasses();
    expect(got.status).toBe("ok");
    expect(got.classes.map((c: { name: string }) => c.name)).toEqual(["Economy Sedan"]);
    expect(Object.values(got.names).sort()).toEqual(["Economy Sedan", "Economy Van", "Luxury Van"]);
  });
});

describe("empty seats and bags stay empty (decision 6, sheet-11a)", () => {
  it("a rate row with empty seats and null bags comes out null, not 3", async () => {
    const { ops } = boot([{ id: "r-x", vehicleClassId: "c-x", maxPax: "", maxBags: null }]);
    ops.rates.all();
    await settle();
    await settle();
    const row = ops.rates.all().find((r: { id: string }) => r.id === "r-x");
    expect(row.maxPax).toBeNull();
    expect(row.maxBags).toBeNull();
  });

  it("blank() has no 3/3 pre-fill and a real 0 bags is kept", async () => {
    const { ops } = boot([{ id: "r-z", vehicleClassId: "c-z", maxPax: "4", maxBags: 0, luggageCapacity: 5 }]);
    const blank = ops.rates.blank();
    expect(blank.maxPax).toBeNull();
    expect(blank.maxBags).toBeNull();
    ops.rates.all();
    await settle();
    await settle();
    const row = ops.rates.all().find((r: { id: string }) => r.id === "r-z");
    expect(row.maxPax).toBe(4);
    expect(row.maxBags).toBe(0);
  });
});

describe("class state changes are PATCH, never DELETE", () => {
  it("retireClass sends PATCH {id, status:'retired', reason}; deleteClass is gone", async () => {
    const { ops, calls } = boot();
    const res = await ops.retireClass("id-1", " No longer offered ");
    expect(res.ok).toBe(true);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.path).toBe("/api/staff/vehicle-classes");
    expect(patch?.body).toEqual({ id: "id-1", status: "retired", reason: " No longer offered " });
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(ops.deleteClass).toBeUndefined();
  });

  it("goLiveClass sends {id, status:'live'}", async () => {
    const { ops, calls } = boot();
    await ops.goLiveClass("id-2");
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ id: "id-2", status: "live" });
  });
});
