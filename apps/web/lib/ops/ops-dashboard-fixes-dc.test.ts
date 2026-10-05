// apps/web/lib/ops/ops-dashboard-fixes-dc.test.ts
//
// Dashboard fixes, 2026-10-05 (audit .planning/audits/2026-10-05-repo-investigation.md, U9 and U10).
//   U10: the class names and their order come from the live vehicle classes, not from a list written in the
//        console store; a class outside the old three reads its own name, never Economy.
//   U9:  the board's pickup day line is written by Intl in the reader's language; the Arabic distance chip
//        keeps "240 km" in reading order.
// Everything runs from the page source in a bare vm or a Function: no DOM, no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
const storeSource = read("app/vamos-ops-data.js");

// ── U10: the console store ─────────────────────────────────────────────────────────────────────────────

type ClassRow = { id: string; slug: string; name: string; sortOrder: number; active: boolean };

// Live, read-only, 2026-10-05: public.vehicle_classes by sort_order, slug.
const LIVE_CLASSES: ClassRow[] = [
  { id: "c0", slug: "mahaha", name: "mahaha", sortOrder: 0, active: false },
  { id: "c1", slug: "saden", name: "Economy", sortOrder: 0, active: true },
  { id: "c2", slug: "economy", name: "Economy", sortOrder: 1, active: false },
  { id: "c3", slug: "business", name: "Business", sortOrder: 2, active: false },
  { id: "c4", slug: "first", name: "First", sortOrder: 3, active: false },
  { id: "c5", slug: "van", name: "Van", sortOrder: 4, active: false },
  { id: "c6", slug: "mercedes-benz-v-class", name: "Business", sortOrder: 10, active: true },
  { id: "c7", slug: "van-luxury", name: "Van luxury", sortOrder: 20, active: true },
];

type Store = {
  VEHICLE_CLASSES: string[];
  bookings: { all: () => Array<{ id: string; klass: string }> };
  vehicles: { all: () => Array<{ id: string; klass: string }> };
};

async function openStore(opts: {
  classes?: ClassRow[] | "fail";
  bookings?: Array<Record<string, unknown>>;
  vehicles?: Array<Record<string, unknown>>;
}) {
  const calls: string[] = [];
  const events: string[] = [];
  const windowStub: Record<string, unknown> = {
    VamosOpsApi: {
      request: (_method: string, path: string) => {
        calls.push(path);
        if (path === "/api/staff/vehicle-classes") {
          return Promise.resolve(
            opts.classes === "fail" ? { ok: false, code: "network" } : { ok: true, data: opts.classes ?? LIVE_CLASSES },
          );
        }
        if (path === "/api/staff/bookings") return Promise.resolve({ ok: true, data: opts.bookings ?? [] });
        if (path === "/api/staff/vehicles") return Promise.resolve({ ok: true, data: opts.vehicles ?? [] });
        return Promise.resolve({ ok: true, data: [] });
      },
    },
    dispatchEvent: (e: { detail?: { collection?: string } }) => {
      if (e?.detail?.collection) events.push(e.detail.collection);
      return true;
    },
    addEventListener: () => undefined,
  };
  const context = vm.createContext({
    window: windowStub,
    CustomEvent: class {
      detail: unknown;
      constructor(_type: string, init?: { detail?: unknown }) {
        this.detail = init?.detail;
      }
    },
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    console,
  });
  vm.runInContext(storeSource, context);
  const store = windowStub.VamosOps as Store;
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { store, calls, events, settle };
}

describe("U10: the class list is the live vehicle classes", () => {
  it("the store holds no list of class names: nothing is listed before the live classes arrive", async () => {
    const { store, calls } = await openStore({});
    expect(store.VEHICLE_CLASSES).toEqual([]);
    expect(calls).toContain("/api/staff/vehicle-classes"); // asking for them is what reading the list does
  });

  it("once they arrive: the classes on offer, in price-book order, one entry per name (Economy, Business, Van luxury)", async () => {
    const { store, settle } = await openStore({});
    void store.VEHICLE_CLASSES;
    await settle();
    expect(store.VEHICLE_CLASSES).toEqual(["Economy", "Business", "Van luxury"]);
  });

  it("the order is the price book's sort_order, not alphabet and not a fixed list; a name the owner gave shows", async () => {
    const { store, settle } = await openStore({
      classes: [
        { id: "a", slug: "zeta", name: "Zeta van", sortOrder: 5, active: true },
        { id: "b", slug: "alpha", name: "Alpha sedan", sortOrder: 9, active: true },
        { id: "c", slug: "mid", name: "Mid", sortOrder: 7, active: true },
        { id: "d", slug: "old", name: "Old class", sortOrder: 1, active: false },
      ],
    });
    void store.VEHICLE_CLASSES;
    await settle();
    expect(store.VEHICLE_CLASSES).toEqual(["Zeta van", "Mid", "Alpha sedan"]);
  });

  it("a class that is no longer on offer is listed while a booking still carries it, under its own name", async () => {
    const { store, settle } = await openStore({
      bookings: [
        { id: "VT-1", klass: "Economy", status: "confirmed", paid: true },
        { id: "VT-2", klass: "First", status: "confirmed", paid: true },
      ],
    });
    void store.VEHICLE_CLASSES;
    store.bookings.all();
    await settle();
    expect(store.VEHICLE_CLASSES).toEqual(["Economy", "Business", "Van luxury", "First"]);
  });

  it("a booking of class First stays First in the store: no name is turned into Economy", async () => {
    const { store, settle } = await openStore({
      bookings: [
        { id: "VT-1", klass: "First", status: "confirmed", paid: true },
        { id: "VT-2", klass: "Mahaha", status: "confirmed", paid: true },
        { id: "VT-3", klass: "", status: "confirmed", paid: true },
      ],
      vehicles: [{ id: "v1", klass: "Sedan Plus", model: "x", plate: "ZH 1" }],
    });
    store.bookings.all();
    store.vehicles.all();
    await settle();
    expect(Object.fromEntries(store.bookings.all().map((b) => [b.id, b.klass]))).toEqual({
      "VT-1": "First",
      "VT-2": "Mahaha",
      "VT-3": "",
    });
    expect(store.vehicles.all()[0]?.klass).toBe("Sedan Plus");
  });

  it("screens hear when the list lands: the classes and the bookings change events fire", async () => {
    const { store, events, settle } = await openStore({});
    void store.VEHICLE_CLASSES;
    await settle();
    expect(events).toContain("classes");
    expect(events).toContain("bookings");
  });

  it("the classes asked for once, not on every read", async () => {
    const { store, calls, settle } = await openStore({});
    void store.VEHICLE_CLASSES;
    await settle();
    void store.VEHICLE_CLASSES;
    void store.VEHICLE_CLASSES;
    await settle();
    expect(calls.filter((c) => c === "/api/staff/vehicle-classes")).toHaveLength(1);
  });

  it("a failed answer lists only what the store's rows carry, and does not invent the old three", async () => {
    const { store, settle } = await openStore({ classes: "fail", bookings: [{ id: "VT-2", klass: "First", status: "confirmed", paid: true }] });
    void store.VEHICLE_CLASSES;
    store.bookings.all();
    await settle();
    expect(store.VEHICLE_CLASSES).toEqual(["First"]);
  });
});

describe("U10: no screen writes a class list", () => {
  it("the board's class filter, form and vehicle sort read the live list", () => {
    const board = read("app/ops/OpsBoard.dc.html");
    expect(board).toMatch(/const classNames = \(ops && ops\.VEHICLE_CLASSES\) \|\| \[\];/);
    expect(board).toMatch(/sortBoardRows\(visibleRows, this\.state\.sortKey, this\.state\.sortDir, classNames\)/);
    expect(board).not.toMatch(/'Economy', 'Business', 'Van luxury'/);
  });

  it("the dashboard's Money in lines are the server's byClass, with no names written in the screen", () => {
    const dash = read("app/ops/OpsDash.dc.html");
    expect(dash).not.toMatch(/MONEY_IN_CLASSES/);
    expect(dash).not.toMatch(/'Van luxury'/);
    expect(dash).toMatch(/income: classLines\.map\(/);
  });
});

// ── U9: the board's pickup day line ────────────────────────────────────────────────────────────────────

function boardDayHelpers() {
  const src = read("app/ops/OpsBoard.dc.html");
  const zurich = src.slice(src.indexOf("function zurichYmd(d) {"), src.indexOf("/* Booked column"));
  const day = src.slice(src.indexOf("const DAY_LOCALE"), src.indexOf("function isClosedStatus"));
  expect(zurich.length).toBeGreaterThan(20);
  expect(day.length).toBeGreaterThan(200);
  return new Function(`${zurich}\n${day}\nreturn { pickupDay, pickupDayFull };`)() as {
    pickupDay: (row: Record<string, unknown>, lang: string) => string;
    pickupDayFull: (row: Record<string, unknown>, lang: string) => string;
  };
}

describe("U9: the pickup day line follows the language", () => {
  const { pickupDay, pickupDayFull } = boardDayHelpers();
  const row = { dateIso: "2026-10-09", date: "Fri 9 Oct", time: "08:00" };

  it("Friday 9 October reads in English, German, French and Arabic (Latin digits)", () => {
    expect(pickupDay(row, "en")).toBe("Fri 9");
    expect(pickupDay(row, "de")).toBe("Fr. 9");
    expect(pickupDay(row, "fr")).toBe("ven. 9");
    expect(pickupDay(row, "ar")).toBe("الجمعة 9");
  });

  it("the tooltip carries the month in the same language", () => {
    expect(pickupDayFull(row, "en")).toBe("Fri 9 Oct");
    expect(pickupDayFull(row, "de")).toMatch(/^Fr\.?,? 9\. Okt\.?$/);
    expect(pickupDayFull(row, "fr")).toBe("ven. 9 oct.");
    expect(pickupDayFull(row, "ar")).toMatch(/9 أكتوبر$/);
  });

  it("the day is the stored Zurich calendar day: the English text is not read at all", () => {
    expect(pickupDay({ dateIso: "2026-10-09", date: "garbage" }, "de")).toBe("Fr. 9");
    expect(pickupDay({ dateIso: "2026-10-31", date: "Fri 9 Oct" }, "en")).toBe("Sat 31");
  });

  it("without dateIso the pickup instant is read in Zurich, not in the browser's zone", () => {
    // 22:30 UTC on 8 October is 00:30 on Friday 9 October in Zurich (summer time).
    expect(pickupDay({ pickupAt: "2026-10-08T22:30:00.000Z" }, "en")).toBe("Fri 9");
    expect(pickupDay({ pickupAt: "2026-10-08T21:30:00.000Z" }, "en")).toBe("Thu 8");
  });

  it("a row with neither falls back to the first two words of the English text, and an unknown language reads English", () => {
    expect(pickupDay({ date: "Fri 9 Oct" }, "en")).toBe("Fri 9");
    expect(pickupDay({ date: "" }, "de")).toBe("");
    expect(pickupDay(row, "xx")).toBe("Fri 9");
  });

  it("the cell uses it: the day line and the tooltip come from the row and the page's language", () => {
    const src = read("app/ops/OpsBoard.dc.html");
    expect(src).toMatch(/title: pickupDayFull\(r, this\.state\.lang\)/);
    expect(src).toMatch(/'data-vt-no-i18n': '1' \}, pickupDay\(r, this\.state\.lang\)/);
    expect(src).not.toMatch(/pickupDay\(r\.date\)/);
  });
});

// ── U9: the Arabic distance chip ───────────────────────────────────────────────────────────────────────

describe("U9: the distance chip keeps its reading order in Arabic", () => {
  it("the chip text sits in a vt-dir-keep span: the design system's rule makes it left to right inside right-to-left text", () => {
    const detail = read("app/ops/OpsDetail.dc.html");
    expect(detail).toMatch(/<span class="vt-dir-keep" data-vt-no-i18n="1">\{\{ distanceChip \}\}<\/span>/);
    const laws = read("design-system/tokens/laws.css");
    expect(laws).toMatch(/\[dir="rtl"\] \.vt-dir-keep\{direction:ltr;unicode-bidi:isolate\}/);
  });
});
