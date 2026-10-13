// apps/web/lib/ops/vehicle-class-draft-birth.test.ts
//
// Phase 30 CLS-01 / decision 5: a new class is born a Draft (active false) on both creation
// paths, its empty draft price row is parked (not available), saving a price makes a Draft
// class's row count, and a retired class cannot be re-attached by typing its name.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();
vi.mock("../db/identity", () => ({ asStaff: (...a: unknown[]) => asStaff(...a) }));
vi.mock("./chauffeur-desk", () => ({ persistVehicleSeats: vi.fn() }));
vi.mock("./must-fix-mail", () => ({ tripsFromRows: vi.fn() }));

import { insertVehicleClassOnDraft } from "./fleet-write";
import { draftRowAvailable } from "./rate-book";

const claims: VamosClaims = { sub: "a0000000-0000-4000-8000-000000000015", role: "authenticated", app_metadata: { vamos_role: "admin" } };
const CLASS_ID = "e0000000-0000-4000-8000-00000000ec01";

function webSource(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", rel), "utf8");
}

describe("insertVehicleClassOnDraft is a Draft birth", () => {
  it("inserts the class with active false and a parked, unpriced draft row", async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join("$"), values });
      return Promise.resolve(calls.length === 1 ? [{ id: CLASS_ID }] : []);
    };
    asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (s: unknown) => unknown) => fn(sql));
    const id = await insertVehicleClassOnDraft(
      {} as CloudflareEnv,
      claims,
      { passengerCapacity: 4, luggageCapacity: 2, sortOrder: 0, active: true, slug: "suv", name: "SUV" },
      7,
    );
    expect(id).toBe(CLASS_ID);
    const cls = calls[0]!;
    expect(cls.text).toMatch(/insert into public\.vehicle_classes/);
    // active is the 5th column: a literal false, and the caller's `active: true` is never bound.
    expect(cls.text).toMatch(/\$,\s*false,\s*\$,\s*\$\s*\)/);
    expect(cls.values).not.toContain(true);
    const row = calls[1]!;
    expect(row.text).toMatch(/insert into public\.distance_rates/);
    expect(row.text).toMatch(/\$,\s*\$,\s*\$,\s*false,\s*false\s*\)/);
    expect(row.text).not.toMatch(/base_fare_rappen|per_km_rappen/);
  });
});

describe("rate-book PUT distance branch (source)", () => {
  const route = webSource("app/[locale]/(ops)/api/staff/rate-book/route.ts");

  it("both vehicle_classes inserts bind a literal false for active", () => {
    const inserts = route.match(/insert into public\.vehicle_classes \([\s\S]*?returning id/g) ?? [];
    expect(inserts.length).toBe(2);
    for (const stmt of inserts) {
      expect(stmt).toMatch(/\$\{nextSort\},\s*false,/);
      expect(stmt).not.toMatch(/\$\{nextSort\},\s*true,/);
    }
  });

  it("refuses a retired class with 409 class-retired before any write", () => {
    expect(route).toContain('"class-retired", 409');
    expect(route.indexOf('"class-retired", 409')).toBeLessThan(route.indexOf("insert into public.vehicle_classes"));
  });

  it("uses the availability helper in both the update and the insert of distance_rates", () => {
    expect((route.match(/draftRowAvailable\(/g) ?? []).length).toBe(2);
    expect(route).not.toMatch(/available = \$\{parsed\.available\}/);
  });
});

describe("draftRowAvailable (decision 5)", () => {
  const priced = { available: true, baseFareRappen: 5000, perKmRappen: 300 };

  it("Draft with start fare, per-km, seats and bags set counts", () => {
    expect(draftRowAvailable(false, priced, 4, 2)).toBe(true);
    expect(draftRowAvailable(false, priced, 4, 0)).toBe(true);
  });

  it("Draft missing any one of the four stays parked", () => {
    expect(draftRowAvailable(false, { ...priced, baseFareRappen: null }, 4, 2)).toBe(false);
    expect(draftRowAvailable(false, { ...priced, perKmRappen: null }, 4, 2)).toBe(false);
    expect(draftRowAvailable(false, priced, null, 2)).toBe(false);
    expect(draftRowAvailable(false, priced, 4, null)).toBe(false);
  });

  it("Live keeps the available the save asked for (an unpriced Live row still blocks Publish)", () => {
    const unpriced = { available: true, baseFareRappen: null, perKmRappen: null };
    expect(draftRowAvailable(true, unpriced, null, null)).toBe(true);
    expect(draftRowAvailable(true, { ...unpriced, available: false }, 4, 2)).toBe(false);
  });
});
