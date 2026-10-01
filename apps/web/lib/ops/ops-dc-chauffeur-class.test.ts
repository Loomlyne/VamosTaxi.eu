// apps/web/lib/ops/ops-dc-chauffeur-class.test.ts
//
// Quick 261001-chauffeur-car — owner decisions 2026-10-01 (.planning/decisions/2026-10-01-no-cars-page.md):
// no cars on the dashboard; each chauffeur has a class and a plate; Assign lists only the drivers of
// the booking's class; each chauffeur keeps a read-only history of his bookings.
//
// Pinned on the live dashboard DC sources (app/ops/*.dc.html, app/vamos-ops-data.js) with the
// technique of ops-dc-dash-design.test.ts: the DC logic class is loaded from the page source and run
// with a stubbed window. No DOM, no network.

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
function readDc(name: string): string {
  return read(`app/ops/${name}`);
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

type Vals = Record<string, any>;
type Logic = {
  props: Record<string, unknown>;
  state: Record<string, any>;
  renderVals(): Vals;
  componentDidMount(): void;
  componentWillUnmount(): void;
};

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
  componentDidMount() {}
  componentDidUpdate() {}
  componentWillUnmount() {}
  renderVals() {
    return {};
  }
}

function loadLogic(file: string, win: Record<string, unknown>, lang = "en", props: Record<string, unknown> = {}): Logic {
  const src = scriptOf(readDc(file));
  const React = { createElement: (...args: unknown[]) => ({ args }) };
  const doc = {
    body: { style: {} as Record<string, string> },
    addEventListener() {},
    removeEventListener() {},
    documentElement: { getAttribute: () => "ltr" },
  };
  const fn = new Function(
    "DCLogic",
    "StreamableLogic",
    "React",
    "window",
    "document",
    "history",
    "localStorage",
    "location",
    "PopStateEvent",
    `${src}\n;return Component;`,
  );
  const Component = fn(
    Base,
    Base,
    React,
    win,
    doc,
    { pushState() {} },
    { getItem: (k: string) => (k === "vamosLang" ? lang : null), setItem() {} },
    { pathname: "/fleet/chauffeurs", href: "https://dashboard.vamostaxi.site/fleet/chauffeurs" },
    class {},
  ) as new (p: Record<string, unknown>) => Logic;
  const logic = new Component(props);
  if (lang) logic.state = { ...logic.state, lang };
  return logic;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

// ── fixtures (no amounts) ───────────────────────────────────────────────────────────────────
const MARCO = "c0000000-0000-4000-8000-00000000aa01";
const LUCA = "c0000000-0000-4000-8000-00000000aa02";
const NINA = "c0000000-0000-4000-8000-00000000aa03";
const ECONOMY = "e0000000-0000-4000-8000-00000000ec01";
const BUSINESS = "e0000000-0000-4000-8000-00000000b501";
const VAN = "e0000000-0000-4000-8000-00000000fa01";
const OLD = "e0000000-0000-4000-8000-0000000001d0";
const LIVE = [
  { id: ECONOMY, name: "Economy" },
  { id: BUSINESS, name: "Business" },
  { id: VAN, name: "Van luxury" },
];
const DRIVERS = [
  { id: MARCO, name: "Marco Rossi", phone: "+41 79 000 00 01", vehicleClassId: BUSINESS, vehicleClassName: "Business", plate: "ZH 123 456", licence: "CH 000 001" },
  { id: LUCA, name: "Luca Bianchi", phone: "+41 79 000 00 02", vehicleClassId: ECONOMY, vehicleClassName: "Economy", plate: "ZH 654 321", licence: "CH 000 002" },
  { id: NINA, name: "Nina Keller", phone: "+41 79 000 00 03", vehicleClassId: "", vehicleClassName: "", plate: "", licence: "" },
];

function fleetWindow(over: { request?: ReturnType<typeof vi.fn>; drivers?: unknown[]; live?: unknown } = {}) {
  const on = () => () => undefined;
  const upsert = vi.fn(async (_rec: Record<string, unknown>) => ({ ok: true }));
  const remove = vi.fn(async (_id: string) => ({ ok: true }));
  const request = over.request ?? vi.fn(async () => ({ ok: true, data: [] }));
  const win = {
    VamosOps: {
      onAny: on,
      VEHICLE_STATUS: ["service", "idle", "workshop"],
      VEHICLE_CLASSES: ["Economy", "Business", "Van luxury"],
      CLASSES: [],
      liveClasses: () => over.live ?? { status: "ok", classes: LIVE, names: { [OLD]: "Old class" } },
      vehicles: { all: () => [], blank: () => ({}) },
      chauffeurs: { all: () => over.drivers ?? DRIVERS, blank: () => ({}), upsert, remove },
      rates: { all: () => [] },
      bookings: { all: () => [] },
    },
    VamosOpsApi: { request },
    addEventListener() {},
    removeEventListener() {},
  };
  return { win, upsert, remove, request };
}
function fleet(lang = "en", props: Record<string, unknown> = {}, over: Parameters<typeof fleetWindow>[0] = {}) {
  const w = fleetWindow(over);
  const logic = loadLogic("OpsFleet.dc.html", w.win, lang, props);
  return { ...w, logic, vals: () => logic.renderVals() };
}
type Field = { key: string; label: string; editor?: string; half?: boolean; required?: boolean; options?: { value: string; label: string }[]; emptyLabel?: string; placeholder?: string };

// ── 0 · the console store loads once ────────────────────────────────────────────────────────
describe("0 · the console store", () => {
  it("loads once: a second run of the file keeps the first store and its listeners", async () => {
    // The shell's helmet runs vamos-ops-data.js twice (parser, then the dc-runtime). The second run
    // replaced window.VamosOps, so a screen that had subscribed to the first store never heard the
    // second store's list arrive: the Chauffeurs list could stay at "0" (found on the rejected Cars
    // branch, 6 of 12 offline loads of main's real shell).
    let calls = 0;
    const windowStub: Record<string, unknown> = {
      VamosOpsApi: {
        request: () => {
          calls++;
          return Promise.resolve({ ok: true, data: [{ id: "c0000000-0000-4000-8000-00000000aa01", name: "Marco" }] });
        },
      },
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
    const source = read("app/vamos-ops-data.js");
    vm.runInContext(source, context);
    const first = windowStub.VamosOps as { chauffeurs: { all: () => unknown[] }; onAny: (fn: () => void) => () => void };
    let heard = 0;
    first.onAny(() => {
      heard++;
    });
    vm.runInContext(source, context);
    expect(windowStub.VamosOps).toBe(first);
    (windowStub.VamosOps as typeof first).chauffeurs.all();
    await new Promise((r) => setImmediate(r));
    expect(calls).toBe(1);
    expect(heard).toBeGreaterThan(0);
  });
});

// ── 1 · the chauffeur form: as before, Class + Plate number, no car ─────────────────────────
describe("1 · the chauffeur form", () => {
  it("is the form of before the dashboard-design ship plus Plate number; no Car field", () => {
    const f = fleet().vals().fields as Field[];
    expect(f.map((x) => x.key)).toEqual(["photo", "name", "phone", "email", "licence", "vehicleClassId", "plate", "languages", "note"]);
    expect(f.find((x) => x.key === "defaultVehicleId")).toBeUndefined();
    const cls = f.find((x) => x.key === "vehicleClassId")!;
    expect(cls.label).toBe("Class");
    expect(cls.editor).toBe("select");
    expect(cls.half).toBe(true);
    const plate = f.find((x) => x.key === "plate")!;
    expect(plate.label).toBe("Plate number");
    expect(plate.half).toBe(true);
    expect(plate.placeholder).toBe("ZH 000 000");
    // Optional, like Licence: the form marks only Name as required.
    expect(plate.required).toBeFalsy();
    expect(f.filter((x) => x.required).map((x) => x.key)).toEqual(["name"]);
  });

  it("Class offers the live price book's classes from the server, never a fixed list", () => {
    const opts = (fleet().vals().fields as Field[]).find((x) => x.key === "vehicleClassId")!.options;
    expect(opts).toEqual([
      { value: "", label: "No class" },
      { value: ECONOMY, label: "Economy" },
      { value: BUSINESS, label: "Business" },
      { value: VAN, label: "Van luxury" },
    ]);
    const src = read("app/vamos-ops-data.js");
    expect(src).toMatch(/liveClasses:\s*function/);
    expect(src).toMatch(/\/api\/staff\/rate-versions/);
    expect(src).toMatch(/\/api\/staff\/rate-book\?versionId=/);
  });

  it("a driver whose class left the live book keeps it in the list, by its own name", () => {
    const drivers = [{ ...DRIVERS[0], vehicleClassId: OLD, vehicleClassName: "" }];
    const opts = (fleet("en", {}, { drivers }).vals().fields as Field[]).find((x) => x.key === "vehicleClassId")!.options!;
    expect(opts.map((o) => o.label)).toEqual(["No class", "Economy", "Business", "Van luxury", "Old class"]);
  });

  it("labels in four languages (Swiss German)", () => {
    const label = (lang: string, key: string) => (fleet(lang).vals().fields as Field[]).find((x) => x.key === key)!.label;
    expect(["de", "fr", "ar"].map((l) => label(l, "vehicleClassId"))).toEqual(["Klasse", "Classe", "الفئة"]);
    expect(["de", "fr", "ar"].map((l) => label(l, "plate"))).toEqual(["Kennzeichen", "Plaque", "رقم اللوحة"]);
    const noClass = (lang: string) => (fleet(lang).vals().fields as Field[]).find((x) => x.key === "vehicleClassId")!.options![0]!.label;
    expect(["de", "fr", "ar"].map(noClass)).toEqual(["Keine Klasse", "Aucune classe", "بلا فئة"]);
  });

  it("the edit box shows the languages he speaks (the store holds names, the select holds codes)", () => {
    // Found while picturing: on origin/main the Languages select of an existing chauffeur read "—"
    // because the server sends names ("German, English") and the select's values are codes.
    const drivers = [{ ...DRIVERS[0], languages: "German, English" }];
    const v = fleet("en", {}, { drivers }).vals();
    const row = (v.rows as { languages: string; languageText: string }[])[0]!;
    expect(row.languages).toBe("de, en");
    expect(row.languageText).toBe("German, English");
    expect(v.searchKeys).toContain("languageText");
  });

  it("Save sends the class and the trimmed plate, and no car", async () => {
    const f = fleet();
    await f.vals().onSave({ id: MARCO, name: "Marco Rossi", vehicleClassId: BUSINESS, plate: "  ZH 123 456 ", defaultVehicleId: "87a4578f-0000-4000-8000-000000000013", vehicle: "87a4578f-0000-4000-8000-000000000013" });
    const sent = f.upsert.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(sent).toMatchObject({ vehicleClassId: BUSINESS, plate: "ZH 123 456", defaultVehicleId: null, vehicle: null });
    await f.vals().onSave({ id: MARCO, name: "Marco Rossi", vehicleClassId: "", plate: "" });
    expect(f.upsert.mock.calls.at(-1)?.[0]).toMatchObject({ vehicleClassId: null, plate: "" });
  });

  it("a plate another chauffeur has is refused in the owner's language", async () => {
    const want: Record<string, string> = {
      en: "Another chauffeur already has this plate number.",
      de: "Ein anderer Chauffeur hat dieses Kennzeichen bereits.",
      fr: "Un autre chauffeur a déjà cette plaque.",
      ar: "رقم اللوحة هذا مسجّل لسائق آخر.",
    };
    for (const [lang, text] of Object.entries(want)) {
      const f = fleet(lang);
      f.upsert.mockResolvedValueOnce({ ok: false, code: "chauffeurs-plate-taken", message: "Another chauffeur already has this plate number." } as never);
      const json = (await f.vals().onSave({ name: "Marco Rossi", plate: "ZH 654 321" })) as { message?: string };
      expect(json.message, lang).toBe(text);
    }
  });
});

// ── 2 · the Chauffeurs list ─────────────────────────────────────────────────────────────────
describe("2 · the Chauffeurs list shows name, class and plate", () => {
  it("columns: Chauffeur, Class, Plate, Licence; search finds the plate", () => {
    const v = fleet().vals();
    const cols = v.columns as { key: string; header: string; kind?: string; emptyLabel?: string; lookup: (r: unknown) => unknown }[];
    expect(cols.map((c) => c.key)).toEqual(["name", "className", "plate", "licence"]);
    expect(cols.map((c) => c.header)).toEqual(["Chauffeur", "Class", "Plate", "Licence"]);
    const cls = cols.find((c) => c.key === "className")!;
    expect(cls.kind).toBe("need");
    expect(cls.emptyLabel).toBe("No class");
    expect(DRIVERS.map((d) => cls.lookup(d))).toEqual(["Business", "Economy", ""]);
    expect(cols.find((c) => c.key === "plate")!.kind).toBe("mono");
    expect((v.rows as { className: string; plate: string }[]).map((r) => [r.className, r.plate])).toEqual([
      ["Business", "ZH 123 456"],
      ["Economy", "ZH 654 321"],
      ["", ""],
    ]);
    expect(v.searchKeys).toEqual(expect.arrayContaining(["name", "plate", "className"]));
    expect(v.searchKeys).not.toContain("carClassName");
  });

  it("the third count is the chauffeurs with a class (no vehicle words)", () => {
    const counts = fleet().vals().counts as { label: string; value: string; of: string }[];
    expect(counts[2]).toMatchObject({ label: "With a class", value: "2", of: "/ 3" });
    const de = fleet("de").vals().counts as { label: string }[];
    expect(de[2]!.label).toBe("Mit Klasse");
  });

  it("no car or vehicle words on the page any more", () => {
    const v = fleet().vals();
    for (const key of ["subtitle", "note", "emptyBody", "deleteBody"]) {
      expect(String(v[key]), key).not.toMatch(/\b(car|cars|vehicle|vehicles)\b/i);
    }
  });
});

// ── 3 · delete ──────────────────────────────────────────────────────────────────────────────
describe("3 · deleting a chauffeur", () => {
  it("a chauffeur with an unfinished trip is refused in plain words, four languages", async () => {
    const want: Record<string, string> = {
      en: "Marco Rossi still has trips that are not finished: VT-26-0042, VT-26-0043. Assign them to another driver first.",
      de: "Marco Rossi hat noch Fahrten, die nicht beendet sind: VT-26-0042, VT-26-0043. Weisen Sie sie zuerst einem anderen Fahrer zu.",
      fr: "Marco Rossi a encore des courses non terminées : VT-26-0042, VT-26-0043. Assignez-les d’abord à un autre chauffeur.",
      ar: "لدى Marco Rossi رحلات لم تنتهِ بعد: VT-26-0042، VT-26-0043. أسندها إلى سائق آخر أولًا.",
    };
    for (const [lang, text] of Object.entries(want)) {
      const f = fleet(lang);
      f.remove.mockResolvedValueOnce({ ok: false, code: "chauffeur-in-use", name: "Marco Rossi", references: ["VT-26-0042", "VT-26-0043"], message: "x" } as never);
      const json = (await f.vals().onDelete(MARCO)) as { ok: boolean; message?: string };
      expect(json.ok).toBe(false);
      expect(json.message, lang).toBe(text);
      expect(text).not.toContain("ß");
    }
  });

  it("the confirm box says he is deleted completely (no vehicle words)", () => {
    expect(fleet().vals().deleteBody).toBe("The chauffeur is deleted for good. Finished trips keep their record without him.");
  });
});

// ── 4 · the chauffeur's bookings history ────────────────────────────────────────────────────
describe("4 · the chauffeur's bookings history (read-only)", () => {
  const HISTORY = [
    { bookingId: "b2", reference: "VT-26-0050", status: "assigned", pickup: "Zurich HB", dropoff: "Zurich Airport (ZRH)", date: "2026-10-05", time: "14:30", takenOff: false },
    { bookingId: "b3", reference: "VT-26-0045", status: "confirmed", pickup: "Zurich Airport (ZRH)", dropoff: "Baden", date: "2026-10-03", time: "09:00", takenOff: true },
    { bookingId: "b1", reference: "VT-26-0040", status: "completed", pickup: "Zurich Airport (ZRH)", dropoff: "Bahnhofstrasse 1, Zurich", date: "2026-09-20", time: "08:00", takenOff: false },
  ];

  it("loads GET /api/staff/chauffeurs/:id/bookings on the profile and lists every row, newest first", async () => {
    const request = vi.fn(async () => ({ ok: true, data: HISTORY }));
    const f = fleet("en", { chauffeurId: MARCO }, { request });
    f.logic.componentDidMount();
    await flush();
    expect(request).toHaveBeenCalledWith("GET", `/api/staff/chauffeurs/${MARCO}/bookings`);
    const v = f.vals();
    expect(v.tHistory).toBe("Bookings");
    const rows = v.historyRows as { ref: string; href: string; route: string; when: string; statusLabel: string; takenOff: boolean; takenOffLabel: string }[];
    expect(rows.map((r) => r.ref)).toEqual(["VT-26-0050", "VT-26-0045", "VT-26-0040"]);
    expect(rows[0]).toMatchObject({ href: "/bookings/VT-26-0050", route: "Zurich HB → Zurich Airport (ZRH)", when: "2026-10-05 · 14:30", statusLabel: "Assigned", takenOff: false });
    expect(rows[1]).toMatchObject({ takenOff: true, takenOffLabel: "Taken off" });
    expect(rows[2]!.statusLabel).toBe("Completed");
    expect(v.noHistory).toBe(false);
  });

  it("an empty history says so; four languages", async () => {
    for (const [lang, title, empty] of [
      ["en", "Bookings", "No bookings yet"],
      ["de", "Buchungen", "Noch keine Buchungen"],
      ["fr", "Réservations", "Aucune réservation"],
      ["ar", "الحجوزات", "لا حجوزات بعد"],
    ] as const) {
      const f = fleet(lang, { chauffeurId: MARCO });
      f.logic.componentDidMount();
      await flush();
      const v = f.vals();
      expect(v.tHistory, lang).toBe(title);
      expect(v.tNoHistory, lang).toBe(empty);
      expect(v.noHistory).toBe(true);
    }
    const taken = { de: "Abgezogen", fr: "Retiré", ar: "أُزيل عنه" } as Record<string, string>;
    for (const [lang, text] of Object.entries(taken)) {
      const request = vi.fn(async () => ({ ok: true, data: [HISTORY[1]] }));
      const f = fleet(lang, { chauffeurId: MARCO }, { request });
      f.logic.componentDidMount();
      await flush();
      expect((f.vals().historyRows as { takenOffLabel: string }[])[0]!.takenOffLabel, lang).toBe(text);
    }
  });

  it("the profile shows Class and Plate; one Bookings section replaces Live trips and Past bookings", () => {
    const facts = fleet("en", { chauffeurId: MARCO }).vals().profileFacts as { label: string; value: string }[];
    expect(facts.map((x) => x.label)).toEqual(["Email", "Class", "Plate", "Licence number", "Languages"]);
    expect(facts.find((x) => x.label === "Plate")!.value).toBe("ZH 123 456");
    const nina = fleet("en", { chauffeurId: NINA }).vals().profileFacts as { label: string; value: string }[];
    expect(nina.find((x) => x.label === "Class")!.value).toBe("No class");
    const tpl = templateOf(readDc("OpsFleet.dc.html"));
    expect(tpl).toMatch(/<sc-for list="\{\{ historyRows \}\}"/);
    expect(tpl).not.toMatch(/liveTrips|pastBookings/);
    // Read-only: rows are links to the booking, no buttons.
    const section = tpl.slice(tpl.indexOf("{{ tHistory }}"), tpl.indexOf("</sc-if>", tpl.indexOf("{{ historyRows }}")));
    expect(section).toMatch(/<a href="\{\{ h\.href \}\}"/);
    expect(section).not.toMatch(/<button|onClick/);
  });
});

// ── 5 · Assign on booking detail: only the drivers of the booking's class ─────────────────────
function booking(over: Record<string, unknown> = {}) {
  return {
    id: "VT-26-0042",
    bookingId: "b0000000-0000-4000-8000-000000000042",
    time: "08:00",
    date: "Fri 2 Oct",
    dateIso: "2026-10-02",
    customer: "Ada Example",
    email: "ada@example.com",
    phone: "+41 79 000 00 00",
    pickup: "Zurich Airport (ZRH)",
    dropoff: "Bahnhofstrasse 1, 8001 Zurich",
    klass: "Business",
    className: "Business",
    vehicleClassId: BUSINESS,
    vehicle: "",
    pax: 2,
    bags: 2,
    status: "confirmed",
    driver: "",
    chauffeur: "",
    chauffeurPlate: "",
    paid: true,
    paidByCard: true,
    totalRappen: 0,
    events: [],
    ...over,
  };
}
function detail(over: Record<string, unknown> = {}, lang = "en", answer: unknown = { ok: true }, drivers: unknown[] = DRIVERS) {
  const b = booking(over);
  const request = vi.fn(async () => answer);
  const on = () => () => undefined;
  const win = {
    VamosOps: {
      bookings: { all: () => [b], onChange: on, reset: vi.fn() },
      chauffeurs: { all: () => drivers, onChange: on },
      profile: { get: () => ({ role: "admin" }), onChange: on },
    },
    VamosOpsApi: { request },
    VamosLocale: { money: () => "CHF 000" },
    VamosOpsBar: { set: vi.fn(), clear: vi.fn() },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    open() {},
  };
  const logic = loadLogic("OpsDetail.dc.html", win, lang, { id: b.id });
  return { logic, request, vals: () => logic.renderVals() };
}

describe("5 · Assign lists only the drivers of the booking's class", () => {
  it("a Business booking lists Marco (Business) with his plate, not Luca (Economy) or Nina (no class)", () => {
    const rows = detail().vals().assignRows as { id: string; name: string; plate: string }[];
    expect(rows.map((r) => [r.name, r.plate])).toEqual([["Marco Rossi", "ZH 123 456"]]);
  });

  it("an Economy booking lists Luca only", () => {
    const rows = detail({ vehicleClassId: ECONOMY, klass: "Economy", className: "Economy" }).vals().assignRows as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(["Luca Bianchi"]);
  });

  it("the radio shows the plate under the name; no car anywhere in the box", () => {
    const tpl = templateOf(readDc("OpsDetail.dc.html"));
    const box = tpl.slice(tpl.indexOf("<div data-ops-assign"), tpl.indexOf("<div data-ops-pax>"));
    expect(box).toMatch(/VamosTaxiDesignSystem_245af1\.Radio"[^>]*label="\{\{ d\.name \}\}"[^>]*description="\{\{ d\.plate \}\}"/);
    expect(box).not.toMatch(/d\.car|carLine|tCar/);
    expect(box.match(/variant="primary"[^>]*onClick="\{\{ confirmAssign \}\}"/g) ?? []).toHaveLength(1);
  });

  it("no driver of this class: the box says so with the class name, four languages", () => {
    const want: Record<string, string> = {
      en: "No chauffeur has the class Van luxury yet. Choose it on Chauffeurs.",
      de: "Noch kein Chauffeur hat die Klasse Van luxury. Wählen Sie sie unter Chauffeure.",
      fr: "Aucun chauffeur n’a encore la classe Van luxury. Choisissez-la sous Chauffeurs.",
      ar: "لا يوجد سائق من فئة Van luxury بعد. اخترها في صفحة السائقين.",
    };
    for (const [lang, text] of Object.entries(want)) {
      const v = detail({ vehicleClassId: VAN, klass: "Van luxury", className: "Van luxury" }, lang).vals();
      expect(v.noDrivers, lang).toBe(true);
      expect(v.tNoDrivers, lang).toBe(text);
    }
  });

  it("the server's refusal of another class is worded with the driver's name, four languages", async () => {
    const want: Record<string, [string, string]> = {
      en: ["Marco Rossi drives Economy; the trip is Business.", "Marco Rossi has no class yet. Choose one on Chauffeurs."],
      de: ["Marco Rossi fährt Economy; die Fahrt ist Business.", "Marco Rossi hat noch keine Klasse. Wählen Sie eine unter Chauffeure."],
      fr: ["Marco Rossi conduit en Economy ; la course est en Business.", "Marco Rossi n’a pas encore de classe. Choisissez-en une sous Chauffeurs."],
      ar: ["يقود Marco Rossi فئة Economy، والرحلة من فئة Business.", "لا فئة لـ Marco Rossi بعد. اختر له فئة في صفحة السائقين."],
    };
    for (const [lang, [mismatch, noClass]] of Object.entries(want)) {
      const a = detail({}, lang, { ok: false, code: "class-mismatch", driverName: "Marco Rossi", driverClass: "Economy", tripClass: "Business" });
      (a.vals().assignRows as { pick: () => void }[])[0]!.pick();
      a.vals().confirmAssign();
      await flush();
      expect(a.vals().assignError, lang).toBe(mismatch);
      const b = detail({}, lang, { ok: false, code: "no-class", driverName: "Marco Rossi", tripClass: "Business" });
      (b.vals().assignRows as { pick: () => void }[])[0]!.pick();
      b.vals().confirmAssign();
      await flush();
      expect(b.vals().assignError, lang).toBe(noClass);
      expect(mismatch + noClass).not.toContain("ß");
    }
  });

  it("a refusal without names falls back to the picked driver and the trip's class", async () => {
    const a = detail({}, "en", { ok: false, code: "class-mismatch" });
    (a.vals().assignRows as { pick: () => void }[])[0]!.pick();
    a.vals().confirmAssign();
    await flush();
    expect(a.vals().assignError).toBe("Marco Rossi drives Business; the trip is Business.");
  });

  it("the assigned driver's plate shows under the driver, not a car", () => {
    const v = detail({ driver: "Marco Rossi", chauffeur: "Marco Rossi", assignedChauffeurId: MARCO, chauffeurPlate: "ZH 123 456", status: "assigned" }).vals();
    expect(v.driverName).toBe("Marco Rossi");
    expect(v.tPlate).toBe("Plate");
    expect(v.driverPlate).toBe("ZH 123 456");
    expect(v.hasDriverPlate).toBe(true);
    const none = detail({ driver: "Nina Keller", chauffeur: "Nina Keller", assignedChauffeurId: NINA, chauffeurPlate: "", status: "assigned" }).vals();
    expect(none.hasDriverPlate).toBe(false);
  });
});

// ── 6 · the menu: only Chauffeurs, no Cars, no fleet entry ────────────────────────────────────
describe("6 · the menu", () => {
  it("has Chauffeurs and no Cars or Vehicles entry", () => {
    const rail = readDc("OpsSidebar.dc.html");
    expect(rail).toMatch(/Chauffeurs/);
    expect(rail).not.toMatch(/>Cars<|'Cars'|"Cars"|label:\s*'Vehicles'|>Vehicles</);
    expect(read("app/ops/ops.dc.html")).not.toMatch(/OpsCars/);
  });
});
