// apps/web/lib/ops/ops-data-status.test.ts
//
// 26.2 (B1): the console store must not turn a database booking status it does not
// list into "pending". The database says no_show, partially_cancelled and
// partially_completed (booking_status enum); the console spells the first one
// "no-show". The file runs in a bare vm with a stub API: no DOM, no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "../../../../app/vamos-ops-data.js"), "utf8");

type Row = { id: string; status: string; paid: boolean };

async function statusesFor(rows: Row[]): Promise<Record<string, string>> {
  const windowStub: Record<string, unknown> = {
    VamosOpsApi: { request: () => Promise.resolve({ ok: true, data: rows }) },
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
  const ops = windowStub.VamosOps as { bookings: { all: () => Array<{ id: string; status: string }> } };
  ops.bookings.all();
  await new Promise((resolve) => setImmediate(resolve));
  return Object.fromEntries(ops.bookings.all().map((b) => [b.id, b.status]));
}

describe("console store keeps the database booking status", () => {
  it("a no-show trip reads as no-show, not as a live pending trip", async () => {
    const got = await statusesFor([{ id: "VT-1", status: "no_show", paid: true }]);
    expect(got["VT-1"]).toBe("no-show");
  });

  it("partially cancelled and partially completed keep their own status", async () => {
    const got = await statusesFor([
      { id: "VT-2", status: "partially_cancelled", paid: true },
      { id: "VT-3", status: "partially_completed", paid: true },
    ]);
    expect(got).toEqual({ "VT-2": "partially_cancelled", "VT-3": "partially_completed" });
  });

  it("known statuses pass through and an unknown one still falls back to pending", async () => {
    const got = await statusesFor([
      { id: "VT-4", status: "confirmed", paid: true },
      { id: "VT-5", status: "no-show", paid: true },
      { id: "VT-6", status: "something-new", paid: false },
    ]);
    expect(got).toEqual({ "VT-4": "confirmed", "VT-5": "no-show", "VT-6": "pending" });
  });
});
