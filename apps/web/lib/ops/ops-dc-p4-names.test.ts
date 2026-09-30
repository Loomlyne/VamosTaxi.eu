// apps/web/lib/ops/ops-dc-p4-names.test.ts
//
// 26.2-p4, owner decisions 2026-09-30 (question form) after the A4/A5 pictures:
//  - "Arrived HH:MM" shows on booking detail after Mark arrival (the store dropped arrivedAt);
//  - Pricing > Extras shows the name he typed ("Child seat"), in the page's language when set,
//    not the code "child-seat";
//  - the Extras search box says "Search by name" (there is no Type any more).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const store = readFileSync(join(repoRoot, "app/vamos-ops-data.js"), "utf8");
const pricing = readFileSync(join(repoRoot, "app/ops/OpsPricing.dc.html"), "utf8");

async function loadStore(collection: "bookings" | "surcharges", rows: unknown[]) {
  const windowStub: Record<string, unknown> = {
    VamosOpsApi: { request: () => Promise.resolve({ ok: true, data: rows }) },
    dispatchEvent: () => true,
    addEventListener: () => undefined,
  };
  vm.runInContext(
    store,
    vm.createContext({ window: windowStub, CustomEvent: class {}, setTimeout: () => 0, clearTimeout: () => undefined, console }),
  );
  const ops = windowStub.VamosOps as Record<string, { all: () => Array<Record<string, unknown>> }>;
  const list = ops[collection];
  if (!list) throw new Error(`no collection ${collection}`);
  list.all();
  await new Promise((resolve) => setImmediate(resolve));
  return list.all();
}

describe("booking detail shows the arrival time", () => {
  it("the store keeps arrivedAt, so 'Arrived HH:MM' can show", async () => {
    const rows = await loadStore("bookings", [
      { id: "VT-1", status: "confirmed", paid: true, arrivedAt: "2026-10-02T06:40:00Z" },
    ]);
    expect(rows[0]?.arrivedAt).toBe("2026-10-02T06:40:00Z");
  });
});

describe("Pricing > Extras names", () => {
  it("the store takes the English name the route sends when the row has no name", async () => {
    const rows = await loadStore("surcharges", [
      { id: "47", code: "child-seat", label: "child-seat", labelEn: "Child seat", labelAr: "مقعد طفل", kind: "amount" },
    ]);
    expect(rows[0]?.name).toBe("Child seat");
    expect(rows[0]?.code).toBe("child-seat");
  });

  it("the Name column shows the page language's name, else the English name, never the code first", () => {
    const m = pricing.match(/\{ key:'label', header: t\.colName, lookup:(\(r\) => [^\n]*) \},\n/);
    expect(m?.[1]).toBeTruthy();
    const make = (lang: string) =>
      new Function("lang", `return ${m?.[1]};`)(lang) as (r: Record<string, string>) => string;
    const row = { code: "child-seat", label: "child-seat", name: "Child seat", labelDe: "Kindersitz", labelFr: "", labelAr: "مقعد طفل" };
    expect(make("en")(row)).toBe("Child seat");
    expect(make("de")(row)).toBe("Kindersitz");
    expect(make("fr")(row)).toBe("Child seat");
    expect(make("ar")(row)).toBe("مقعد طفل");
    expect(make("en")({ code: "child-seat", label: "child-seat", name: "", labelDe: "", labelFr: "", labelAr: "" })).toBe("child-seat");
  });

  it("the search box says 'Search by name' in four languages", () => {
    for (const text of ["Search by name", "Nach Name suchen", "Rechercher par nom", "ابحث بالاسم"]) {
      expect(pricing).toContain(`searchSurcharges:'${text}'`);
    }
    for (const old of ["Type or name", "Typ oder Name", "Type ou nom", "النوع أو الاسم"]) {
      expect(pricing).not.toContain(`searchSurcharges:'${old}'`);
    }
  });
});
