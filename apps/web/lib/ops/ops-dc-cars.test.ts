// apps/web/lib/ops/ops-dc-cars.test.ts
//
// Quick 261001-cars-page — owner decision 2026-10-01 (question form): a Cars section next to
// Chauffeurs to list, add and edit cars (plate, model, class, seats, bags). Each driver has his own
// car; a driver's class is his car's class. Pinned on the live dashboard DC sources, the technique
// of ops-dc-dash-design.test.ts: the DC logic class runs from the page source with a stubbed
// window. No DOM, no network.
//
//   1. The shell serves Cars at /fleet (already on the middleware's console list; /fleet/cars would
//      need a middleware change) and the rail lists Cars right after Chauffeurs, four languages.
//   2. OpsCars: the shared OpsTable with plate, model, class (the live price book's classes, never
//      a fixed list), seats, bags, status and photo; the list shows each car's driver.
//   3. Add POSTs, Edit PATCHes (OpsTable gives a new row a UUID, and the store PATCHes any UUID).
//   4. Delete refusals read in the owner's language, naming the driver and the trips.
//   5. The store keeps the Morning/Night seat ids, so an edit does not empty vehicle_seats.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}
function scriptOf(src: string): string {
  const m = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error("no data-dc-script");
  return m[1];
}
function templateOf(src: string): string {
  const m = src.match(/<x-dc>([\s\S]*?)<\/x-dc>/);
  if (!m?.[1]) throw new Error("no <x-dc>");
  return m[1];
}

class Base {
  props: Record<string, unknown>;
  state: Record<string, unknown> = {};
  constructor(props?: Record<string, unknown>) {
    this.props = props || {};
  }
  setState(update: unknown) {
    const patch = typeof update === "function" ? (update as (s: unknown) => object)(this.state) : update;
    this.state = { ...this.state, ...(patch as object) };
  }
  forceUpdate() {}
}

type Vals = Record<string, any>;
type Logic = { state: Record<string, any>; renderVals(): Vals; componentDidMount(): void; componentWillUnmount(): void };

/** Runs a DC page's script and hands back what it names (Component plus any top-level names). */
function runScript(file: string, win: Record<string, unknown>, names: string[] = []): Record<string, any> {
  const src = scriptOf(read(file));
  const React = { createElement: (...args: unknown[]) => ({ args }) };
  const doc = { body: { style: {} }, addEventListener() {}, removeEventListener() {}, documentElement: { getAttribute: () => "ltr" } };
  const fn = new Function(
    "DCLogic", "StreamableLogic", "React", "window", "document", "history", "localStorage", "location", "PopStateEvent",
    `${src}\n;return { Component, ${names.join(", ")} };`,
  );
  return fn(
    Base, Base, React, win, doc, { pushState() {}, replaceState() {} },
    { getItem: () => null, setItem() {}, removeItem() {} },
    { pathname: "/fleet", href: "https://dashboard.vamostaxi.site/fleet", search: "" },
    class {},
  );
}

const ECONOMY = "e0000000-0000-4000-8000-00000000ec01";
const BUSINESS = "e0000000-0000-4000-8000-00000000b501";
const VAN = "e0000000-0000-4000-8000-00000000a401";
const DRAFT_ONLY = "e0000000-0000-4000-8000-00000000d701";
const OLD = "e0000000-0000-4000-8000-0000000001d0";
const CAR_A = "87a4578f-0000-4000-8000-000000000013";
const CAR_B = "87a4578f-0000-4000-8000-000000000014";
const CAR_C = "87a4578f-0000-4000-8000-000000000015";

function api(opts: { live?: boolean; bookFails?: boolean } = {}) {
  const calls: string[] = [];
  const request = vi.fn(async (method: string, path: string) => {
    calls.push(`${method} ${path}`);
    if (path === "/api/staff/rate-versions") {
      return {
        ok: true,
        data: {
          versions: [
            { id: 19, status: "draft" },
            ...(opts.live === false ? [] : [{ id: 18, status: "live" }]),
            { id: 5, status: "retired" },
          ],
        },
      };
    }
    if (path === "/api/staff/rate-book?versionId=18") {
      if (opts.bookFails) return { ok: false, code: "http" };
      return {
        ok: true,
        data: {
          classes: [
            { id: ECONOMY, slug: "economy", label: "Economy" },
            { id: BUSINESS, slug: "business", label: "Business" },
            { id: VAN, slug: "van-luxury", label: "Van luxury" },
          ],
        },
      };
    }
    if (path === "/api/staff/vehicle-classes") {
      return {
        ok: true,
        data: [
          { id: ECONOMY, name: "Economy" },
          { id: BUSINESS, name: "Business" },
          { id: VAN, name: "Van luxury" },
          { id: DRAFT_ONLY, name: "Limousine" },
          { id: OLD, name: "Saden" },
        ],
      };
    }
    return { ok: false, code: "http" };
  });
  return { request, calls };
}

function cars(lang = "en", opts: { live?: boolean; bookFails?: boolean; remove?: unknown; add?: unknown; update?: unknown } = {}) {
  const on = () => () => undefined;
  const add = vi.fn(async (_rec: Record<string, unknown>) => opts.add ?? { ok: true, data: { id: CAR_A } });
  const update = vi.fn(async (_id: string, _rec: Record<string, unknown>) => opts.update ?? { ok: true, data: { id: CAR_A } });
  const remove = vi.fn(async (_id: string) => opts.remove ?? { ok: true, data: { id: CAR_A } });
  const client = api(opts);
  const win: Record<string, unknown> = {
    VamosOpsApi: { request: client.request },
    VamosLocale: { lang: () => lang, onChange: () => () => undefined },
    VamosOps: {
      onAny: on,
      VEHICLE_STATUS: ["service", "idle", "workshop"],
      VEHICLE_CLASSES: ["Economy", "Business", "Van luxury"],
      vehicles: {
        all: () => [
          { id: CAR_A, vehicleClassId: BUSINESS, klass: "Business", model: "Mercedes V-Class", plate: "ZH 000 000", seats: 6, bags: 6, status: "service", photo: "", morning: "", night: "" },
          { id: CAR_B, vehicleClassId: ECONOMY, klass: "Economy", model: "Toyota Corolla", plate: "ZH 123 456", seats: 3, bags: 3, status: "workshop", photo: "", morning: "", night: "" },
          { id: CAR_C, vehicleClassId: OLD, klass: "Economy", model: "Skoda Superb", plate: "ZH 777 777", seats: 3, bags: 2, status: "idle", photo: "", morning: "", night: "" },
        ],
        blank: () => ({ id: "", seats: 3, bags: 3, status: "service" }),
        add, update, remove,
      },
      chauffeurs: {
        all: () => [
          { id: "c1", name: "Marco", defaultVehicleId: CAR_A, vehicle: CAR_A },
          { id: "c2", name: "Luca", defaultVehicleId: "", vehicle: "" },
        ],
      },
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const { Component } = runScript("app/ops/OpsCars.dc.html", win);
  const logic = new Component({}) as Logic;
  logic.state = { ...logic.state, lang };
  return { logic, add, update, remove, client, vals: () => logic.renderVals() };
}

async function mounted(lang = "en", opts: Parameters<typeof cars>[1] = {}) {
  const c = cars(lang, opts);
  c.logic.componentDidMount();
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
  return c;
}

// ── 1 · Shell and rail ─────────────────────────────────────────────────────────────────────
describe("1 · Cars lives at /fleet, next to Chauffeurs in the rail", () => {
  it("the shell reads /fleet as Cars and still reads /fleet/chauffeurs as Chauffeurs", () => {
    const { readPath, HASH_TO_PATH } = runScript("app/ops/ops.dc.html", {}, ["readPath", "HASH_TO_PATH"]);
    expect(readPath("/fleet").route).toBe("cars");
    expect(readPath("/de/fleet").route).toBe("cars");
    expect(readPath("/fleet/").route).toBe("cars");
    expect(readPath("/fleet/chauffeurs").route).toBe("chauffeurs");
    expect(readPath("/fleet/chauffeurs/c1")).toMatchObject({ route: "chauffeurs", detailId: "c1" });
    expect(HASH_TO_PATH.vehicles).toBe("/fleet");
  });

  it("the shell mounts OpsCars on the cars route and tells the rail", () => {
    const shell = read("app/ops/ops.dc.html");
    expect(templateOf(shell)).toMatch(/<sc-if value="\{\{ isCars \}\}"[^>]*>\s*<dc-import name="OpsCars"/);
    const { Component } = runScript("app/ops/ops.dc.html", {}, []);
    const logic = new Component({}) as Logic;
    logic.state = { ...logic.state, route: "cars", detailId: null, lang: "en" };
    const v = logic.renderVals();
    expect(v.isCars).toBe(true);
    expect(v.isFleet).toBe(false);
    expect(v.route).toBe("cars");
  });

  it("the middleware already serves /fleet as a console page (no middleware change)", () => {
    const mw = read("apps/web/middleware.ts");
    expect(mw).toMatch(/const OPS_CONSOLE_EXACT = new Set\(\[[\s\S]*"\/fleet",[\s\S]*\]\);/);
  });

  it("the rail lists Cars right after Chauffeurs, with the car icon, in four languages", () => {
    const { NAV_TOP } = runScript("app/ops/OpsSidebar.dc.html", {}, ["NAV_TOP"]);
    const keys = (NAV_TOP as { key: string }[]).map((n) => n.key);
    expect(keys.indexOf("cars")).toBe(keys.indexOf("chauffeurs") + 1);
    expect((NAV_TOP as Record<string, string>[]).find((n) => n.key === "cars")).toEqual({
      key: "cars", href: "/fleet", icon: "car", en: "Cars", de: "Autos", fr: "Voitures", ar: "السيارات",
    });
  });

  it("the ops shell loads the store under a new cache key (the store changed)", () => {
    const shell = read("app/ops/ops.dc.html");
    expect(shell).not.toMatch(/vamos-ops-data\.js\?vt=09-27-c12/);
    expect(shell).toMatch(/vamos-ops-data\.js\?vt=10-01-cars/);
  });
});

// ── 2 · The Cars list and its edit box ──────────────────────────────────────────────────────
describe("2 · OpsCars — the list and the edit box", () => {
  it("renders the shared OpsTable with Add / Edit / Delete wired", () => {
    const src = read("app/ops/OpsCars.dc.html");
    const tpl = templateOf(src);
    expect(tpl).toMatch(/<dc-import name="OpsTable"/);
    for (const attr of ["onSave", "onUpdate", "onDelete", "fields", "columns", "rows", "blank"]) {
      expect(tpl).toMatch(new RegExp(`${attr}="\\{\\{ ${attr} \\}\\}"`));
    }
  });

  it("the edit box: photo, plate, model, class, seats, bags, status — plate, model and class required", async () => {
    const { vals } = await mounted();
    const f = vals().fields as Record<string, any>[];
    expect(f.map((x) => x.key)).toEqual(["photo", "plate", "model", "vehicleClassId", "seats", "bags", "status"]);
    expect(f.filter((x) => x.required).map((x) => x.key)).toEqual(["plate", "model", "vehicleClassId"]);
    expect(f.find((x) => x.key === "photo")).toMatchObject({ editor: "photo", photoKind: "vehicle", upload: "/api/photos/upload" });
    // Pictures at 390 (en and ar): half-width Plate and Model cut "ZH 000 000" and the model name.
    expect(f.find((x) => x.key === "plate")).not.toHaveProperty("half");
    expect(f.find((x) => x.key === "model")).not.toHaveProperty("half");
    expect(f.find((x) => x.key === "seats")).toMatchObject({ editor: "number", min: 1, max: 16 });
    expect(f.find((x) => x.key === "bags")).toMatchObject({ editor: "number", min: 0, max: 16 });
    expect(f.find((x) => x.key === "status")?.options).toEqual([
      { value: "service", label: "In service" },
      { value: "idle", label: "Free" },
      { value: "workshop", label: "In the workshop" },
    ]);
  });

  it("class: the classes of the live price book, never the draft's or a fixed list; a car's old class stays pickable", async () => {
    const { vals, client } = await mounted();
    expect(client.calls).toContain("GET /api/staff/rate-versions");
    expect(client.calls).toContain("GET /api/staff/rate-book?versionId=18");
    expect(client.calls).not.toContain("GET /api/staff/rate-book?versionId=19");
    const cls = (vals().fields as Record<string, any>[]).find((x) => x.key === "vehicleClassId");
    expect(cls?.editor).toBe("select");
    expect(cls?.options).toEqual([
      { value: ECONOMY, label: "Economy" },
      { value: BUSINESS, label: "Business" },
      { value: VAN, label: "Van luxury" },
      { value: OLD, label: "Saden" },
    ]);
    const src = scriptOf(read("app/ops/OpsCars.dc.html"));
    expect(src).not.toMatch(/VEHICLE_CLASSES/);
    expect(src).not.toMatch(/'Economy'|"Economy"/);
  });

  it("no live price book: the page says so instead of an empty class list", async () => {
    const { vals } = await mounted("en", { live: false });
    expect(vals().hasClassMsg).toBe(true);
    expect(vals().classMsg).toMatch(/Pricing/);
    const failed = await mounted("en", { bookFails: true });
    expect(failed.vals().hasClassMsg).toBe(true);
    expect(failed.vals().classMsg).toMatch(/Reload/);
    const ok = await mounted();
    expect(ok.vals().hasClassMsg).toBe(false);
  });

  it("each row reads its class by name and the driver who has the car; a car without one says so", async () => {
    const { vals } = await mounted();
    const rows = vals().rows as Record<string, any>[];
    expect(rows.map((r) => [r.plate, r.className, r.driverNames])).toEqual([
      ["ZH 000 000", "Business", "Marco"],
      ["ZH 123 456", "Economy", ""],
      ["ZH 777 777", "Saden", ""],
    ]);
    const cols = vals().columns as Record<string, any>[];
    expect(cols.map((c) => c.key)).toEqual(["model", "className", "seats", "bags", "driverNames", "status"]);
    expect(cols.map((c) => c.header)).toEqual(["Car", "Class", "Seats", "Bags", "Driver", "Status"]);
    const status = cols.find((c) => c.key === "status");
    expect(status?.kind).toBe("badge");
    expect(Object.values(status?.tones ?? {}).map((t: any) => t.tone)).not.toContain("warning");
    expect(vals().searchKeys).toEqual(["plate", "model", "className", "driverNames"]);
    expect(vals().labelKey).toBe("plate");
  });

  it("four languages: the same copy keys in en, de, fr and ar, Swiss German without ß", () => {
    const { T } = runScript("app/ops/OpsCars.dc.html", {}, ["T"]);
    const en = Object.keys(T.en).sort();
    expect(en.length).toBeGreaterThan(20);
    for (const lang of ["de", "fr", "ar"]) expect(Object.keys(T[lang]).sort()).toEqual(en);
    expect(JSON.stringify(T.de)).not.toMatch(/ß/);
    expect(T.de.title).toBe("Autos");
    expect(T.fr.title).toBe("Voitures");
    expect(T.ar.title).toBe("السيارات");
  });

  it("German, French and Arabic labels reach the edit box and the list", async () => {
    const de = (await mounted("de")).vals();
    expect((de.fields as Record<string, any>[]).find((x) => x.key === "plate")?.label).toBe("Kennzeichen");
    expect((de.columns as Record<string, any>[])[0]?.header).toBe("Auto");
    const ar = (await mounted("ar")).vals();
    expect((ar.fields as Record<string, any>[]).find((x) => x.key === "seats")?.label).toBe("المقاعد");
    expect(ar.addLabel).toBe("إضافة سيارة");
  });
});

// ── 3 · Add and Edit ────────────────────────────────────────────────────────────────────────
describe("3 · Add creates, Edit saves the car", () => {
  it("Add goes to the store's add (POST) without the list-only keys", async () => {
    const c = await mounted();
    await c.vals().onSave({ id: "f0000000-0000-4000-8000-000000000001", plate: "ZH 1", model: "VW Passat", vehicleClassId: ECONOMY, seats: 3, bags: 3, status: "service", className: "Economy", driverNames: "" });
    expect(c.add).toHaveBeenCalledTimes(1);
    expect(c.update).not.toHaveBeenCalled();
    const sent = c.add.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toMatchObject({ plate: "ZH 1", model: "VW Passat", vehicleClassId: ECONOMY });
    expect(sent).not.toHaveProperty("className");
    expect(sent).not.toHaveProperty("driverNames");
  });

  it("Edit goes to the store's update (PATCH) with the row id", async () => {
    const c = await mounted();
    await c.vals().onUpdate(CAR_A, { id: CAR_A, plate: "ZH 000 001", model: "Mercedes V-Class", vehicleClassId: BUSINESS, seats: 6, bags: 6, status: "idle", className: "Business", driverNames: "Marco" });
    expect(c.update).toHaveBeenCalledWith(CAR_A, expect.objectContaining({ plate: "ZH 000 001", status: "idle" }));
    expect(c.update.mock.calls[0]?.[1]).not.toHaveProperty("driverNames");
  });

  it("a plate already on file reads in the owner's language", async () => {
    const c = await mounted("fr", { add: { ok: false, code: "23505" } });
    const json = await c.vals().onSave({ plate: "ZH 000 000", model: "X", vehicleClassId: ECONOMY, seats: 3, bags: 3 });
    expect(json).toMatchObject({ ok: false, message: "Cette plaque est déjà enregistrée." });
  });
});

// ── 4 · Delete refusals ─────────────────────────────────────────────────────────────────────
describe("4 · Delete: refused in plain words while a driver or an open trip has the car", () => {
  const refusal = { ok: false, code: "fleet-car-in-use", drivers: ["Marco"], references: ["VT-26-0042"], message: "English" };

  it("names the driver and the trip, in English", async () => {
    const c = await mounted("en", { remove: refusal });
    const json = await c.vals().onDelete(CAR_A, {});
    expect(c.remove).toHaveBeenCalledWith(CAR_A);
    expect(json.ok).toBe(false);
    expect(json.message).toBe(
      "Driven by Marco. Change the car on Chauffeurs first. In use on trips not finished: VT-26-0042. Reassign or close them first.",
    );
  });

  it("and in German, French and Arabic", async () => {
    const de = await (await mounted("de", { remove: refusal })).vals().onDelete(CAR_A, {});
    expect(de.message).toMatch(/^Gefahren von Marco\./);
    expect(de.message).toMatch(/VT-26-0042/);
    const fr = await (await mounted("fr", { remove: refusal })).vals().onDelete(CAR_A, {});
    expect(fr.message).toMatch(/^Conduite par Marco\./);
    const ar = await (await mounted("ar", { remove: { ...refusal, references: [] } })).vals().onDelete(CAR_A, {});
    expect(ar.message).toBe("يقودها Marco. غيّر السيارة أولًا في صفحة السائقين.");
  });

  it("a car already gone, and a delete that went through", async () => {
    const gone = await (await mounted("en", { remove: { ok: false, code: "fleet-car-gone" } })).vals().onDelete(CAR_A, {});
    expect(gone.message).toBe("This car is gone. Reload the page.");
    const done = await (await mounted("en")).vals().onDelete(CAR_B, {});
    expect(done).toEqual({ ok: true, data: { id: CAR_A } });
  });

  it("the confirm box says what a delete does", async () => {
    const v = (await mounted()).vals();
    expect(v.deleteTitle).toBe("Delete this car?");
    expect(v.deleteBody).toMatch(/photo/);
    expect(v.deleteBody).toMatch(/Finished trips keep their driver/);
  });
});

// ── 5 · Store and platform laws ─────────────────────────────────────────────────────────────
describe("5 · the store keeps the seat ids; the page keeps the platform laws", () => {
  it("cleanVehicle keeps Morning and Night, so a car edit does not empty vehicle_seats", () => {
    const windowStub: Record<string, unknown> = {
      VamosOpsApi: { request: () => Promise.resolve({ ok: true, data: [] }) },
      dispatchEvent: () => true,
      addEventListener: () => undefined,
    };
    const context = vm.createContext({ window: windowStub, CustomEvent: class {}, setTimeout: () => 0, clearTimeout: () => undefined, console });
    vm.runInContext(read("app/vamos-ops-data.js"), context);
    const ops = windowStub.VamosOps as { vehicles: { blank: (o: unknown) => Record<string, unknown> } };
    expect(ops.vehicles.blank({ id: CAR_A, morningChauffeurId: "c1", nightChauffeurId: "c2" })).toMatchObject({ morning: "c1", night: "c2" });
    expect(ops.vehicles.blank({ id: CAR_A, morning: "c3", night: "" })).toMatchObject({ morning: "c3", night: "" });
  });

  it("the store loads once: a second run of the file keeps the first store and its listeners", async () => {
    // The shell's helmet runs vamos-ops-data.js twice (parser, then the dc-runtime). The second run
    // replaced window.VamosOps, so a screen that had subscribed to the first store never heard the
    // second store's list arrive: the Cars list (and main's Chauffeurs list) stayed at "0" in 4 to 6
    // of 12 offline loads of the real shell.
    let calls = 0;
    const windowStub: Record<string, unknown> = {
      VamosOpsApi: { request: () => { calls++; return Promise.resolve({ ok: true, data: [{ id: CAR_A, plate: "ZH 000 000" }] }); } },
      dispatchEvent: () => true,
      addEventListener: () => undefined,
    };
    const context = vm.createContext({ window: windowStub, CustomEvent: class {}, setTimeout: () => 0, clearTimeout: () => undefined, console });
    const source = read("app/vamos-ops-data.js");
    vm.runInContext(source, context);
    const first = windowStub.VamosOps as { vehicles: { all: () => unknown[] }; onAny: (fn: () => void) => () => void };
    let heard = 0;
    first.onAny(() => { heard++; });
    vm.runInContext(source, context);
    expect(windowStub.VamosOps).toBe(first);
    (windowStub.VamosOps as typeof first).vehicles.all();
    await new Promise((r) => setImmediate(r));
    expect(calls).toBe(1);
    expect(heard).toBeGreaterThan(0);
  });

  it("Arabic: the shared table's headers sit over their own column (the kit's th is text-align:left)", () => {
    // Pictures (Cars, and main's Chauffeurs) in Arabic: every header sat at the physical left of its
    // column while the cells sat at the right. OpsTable only fixed it for a table that fills its box.
    const table = read("app/ops/OpsTable.dc.html");
    expect(table).toMatch(/\[data-vt-table-scroll\] \.vt-table th\{text-align:start\}/);
  });

  it("no glow, no tinted yellow, logical properties only, the two law lines in its helmet", () => {
    const src = read("app/ops/OpsCars.dc.html");
    expect(src).toMatch(/:root\{--vt-shadow-accent:none\}/);
    expect(src).toMatch(/\.vt-input--focus\{box-shadow:none\}/);
    expect(src.replace(":root{--vt-shadow-accent:none}", "")).not.toMatch(/--vt-shadow-accent/);
    expect(src).not.toMatch(/--vt-yellow-(50|100|200|300|600|700)\b/);
    expect(src).not.toMatch(/tone[=:]\s*["']warning["']/);
    expect(src).not.toMatch(/(^|[;{"'\s])(margin|padding)-(left|right)\s*:/);
    expect(src).not.toMatch(/(^|[;{"'\s])(left|right)\s*:/);
    expect(src).not.toMatch(/CHF/);
  });

  it("the new words are in the shared dictionary with de, fr and ar", () => {
    const dict = read("app/vamos-i18n-dict.js");
    for (const en of ["Cars", "Add a car", "Edit car", "Delete this car?", "No cars yet", "No driver"]) {
      const line = dict.split("\n").find((l) => l.trimStart().startsWith(`'${en}':`));
      expect(line, en).toBeDefined();
      expect(line).toMatch(/de: '/);
      expect(line).toMatch(/fr: '/);
      expect(line).toMatch(/ar: '/);
    }
  });
});
