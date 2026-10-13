// apps/web/lib/ops/ops-dc-class-lifecycle.test.ts
//
// Phase 30, plan 08: the Pricing class lifecycle (badges, Go live, Retire, Retired list) drives from the server row.
// The whole script block of OpsPricing.dc.html runs here against a stub DCLogic and a stub VamosOps, so each test
// drives the real renderVals, handlers and copy tables in all four languages. No DOM, no network, no live data.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const SRC = readFileSync(join(repoRoot, "app/ops/OpsPricing.dc.html"), "utf8");

function scriptOf(): string {
  const m = SRC.match(/<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
  if (!m?.[1]) throw new Error("missing script block in OpsPricing.dc.html");
  return m[1];
}

type Json = Record<string, any>;
type Lang = "en" | "de" | "fr" | "ar";
const LANGS: Lang[] = ["en", "de", "fr", "ar"];

class StubLogic {
  props: Json = {};
  state: Json = {};
  setState(patch: Json | ((s: Json) => Json), done?: () => void) {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    if (done) done();
  }
  forceUpdate() {}
}

const noop = () => undefined;
const coll = (rows: unknown[]) => ({
  all: () => rows,
  get: (id: string) => rows.find((r) => (r as Json).id === id) ?? null,
  blank: () => ({ klass: "", baseFare: {}, perKm: {}, maxPax: 3, maxBags: 3, hideFromPublic: false, photo: "" }),
  onChange: () => noop,
  upsert: noop,
  remove: noop,
  reorder: noop,
  reset: noop,
});

/** What the server sends per class (30-04): status, retiredReason, inLiveBook, missing (comma string), unassignedPaidTrips. */
const ROWS: Json[] = [
  { id: "c-sedan", name: "Economy Sedan", status: "live", passengerCapacity: 3, luggageCapacity: 3, inLiveBook: true, missing: "", unassignedPaidTrips: 0 },
  { id: "c-van", name: "Economy Van", status: "draft", passengerCapacity: 7, luggageCapacity: 6, inLiveBook: false, missing: "photo,price", unassignedPaidTrips: 0 },
  { id: "c-lux", name: "Luxury Van", status: "draft", passengerCapacity: 7, luggageCapacity: 6, inLiveBook: true, missing: "", unassignedPaidTrips: 0 },
  { id: "c-old", name: "Business", status: "retired", retiredReason: "No longer offered", unassignedPaidTrips: 0 },
];

type Calls = { goLive: string[]; retire: Array<[string, string | null]>; bringBack: string[]; publish: unknown[]; classesReads: number };

function page(opts: { rows?: Json[]; lang?: Lang; rates?: Json[]; chauffeurs?: Json[]; goLiveAnswer?: Json; doc?: Json; retireAnswer?: Json; bringAnswer?: Json } = {}) {
  const calls: Calls = { goLive: [], retire: [], bringBack: [], publish: [], classesReads: 0 };
  let rows = opts.rows ?? ROWS;
  const answer = (a: Json | undefined) => Promise.resolve(a ?? { ok: true, data: {} });
  const win: Json = {
    VamosLocale: { lang: () => opts.lang ?? "en", cur: () => "CHF", money: (v: unknown) => `CHF ${String(v)}`, onChange: () => noop },
    VamosOpsApi: { request: () => Promise.resolve({ ok: true, data: [] }) },
    VamosOps: {
      CLASSES: [],
      LOCATIONS: [],
      routes: coll([]),
      rates: coll(opts.rates ?? []),
      bands: coll([]),
      coupons: coll([]),
      surcharges: coll([]),
      chauffeurs: { ...coll(opts.chauffeurs ?? []), peek: () => opts.chauffeurs ?? [] },
      profile: { get: () => ({ role: "admin" }), onChange: () => noop },
      onAny: () => noop,
      classes: () => { calls.classesReads += 1; return Promise.resolve(rows); },
      goLiveClass: (id: string) => { calls.goLive.push(id); return answer(opts.goLiveAnswer); },
      retireClass: (id: string, reason: string | null) => { calls.retire.push([id, reason]); return answer(opts.retireAnswer); },
      bringBackClass: (id: string) => { calls.bringBack.push(id); return answer(opts.bringAnswer); },
      publish: (...a: unknown[]) => { calls.publish.push(a); return Promise.resolve({ ok: true }); },
    },
    innerWidth: 1440,
    addEventListener: noop,
    removeEventListener: noop,
  };
  const out = new Function(
    "DCLogic", "window", "document", "React",
    `${scriptOf()}\nreturn { Component, T, AR_COUNT };`,
  )(StubLogic, win, opts.doc ?? { addEventListener: noop, removeEventListener: noop }, { createElement: (...args: unknown[]) => ({ args }) }) as {
    Component: new () => Json;
    T: Record<Lang, Record<string, string>>;
    AR_COUNT: Record<string, string>;
  };
  const comp = new out.Component();
  comp.state = { ...comp.state, lang: opts.lang ?? "en", classes: rows };
  return {
    comp, T: out.T, AR_COUNT: out.AR_COUNT, calls,
    setRows(next: Json[]) { rows = next; comp.state = { ...comp.state, classes: next }; },
    vals: () => comp.renderVals() as Json,
  };
}

/** Every element node (tag string or component) under a createElement stub tree. */
function nodes(n: any, out: any[] = []): any[] {
  if (!n || typeof n !== "object" || !Array.isArray(n.args)) return out;
  out.push(n);
  for (const c of n.args.slice(2)) nodes(c, out);
  return out;
}
const textOf = (n: any): string => (n && n.args ? n.args.slice(2).map(textOf).join("") : typeof n === "string" ? n : "");

function cellOf(vals: Json, rowId: string) {
  const col = vals.distanceColumns.find((c: Json) => c.key === "klass");
  const row = vals.distanceRows.find((r: Json) => r.vehicleClassId === rowId);
  expect(row, `row ${rowId}`).toBeTruthy();
  return nodes(col.lookup(row));
}

describe("Pricing class cell: badges come from the server status", () => {
  const rates = [
    { id: "r1", klass: "Economy Sedan", name: "Economy Sedan", vehicleClassId: "c-sedan", baseFare: { CHF: "1" }, perKm: { CHF: "1" }, airportStart: { CHF: "1" } },
    { id: "r2", klass: "Economy Van", name: "Economy Van", vehicleClassId: "c-van", baseFare: { CHF: "1" }, perKm: { CHF: "1" }, airportStart: { CHF: "1" } },
  ];
  for (const lang of LANGS) {
    it(`${lang}: LIVE is a plain badge, DRAFT is a labelled button that opens a dialog`, () => {
      const p = page({ lang, rates });
      const vals = p.vals();
      const live = cellOf(vals, "c-sedan");
      const badge = live.find((n) => n.args[0] === undefined && n.args[1]?.tone);
      expect(badge.args[1].tone).toBe("inverse");
      expect(textOf(badge)).toBe(p.T[lang].statusLive);
      expect(live.some((n) => n.args[0] === "button")).toBe(false);

      const draft = cellOf(vals, "c-van");
      const btn = draft.find((n) => n.args[0] === "button");
      expect(btn.args[1]["aria-haspopup"]).toBe("dialog");
      expect(btn.args[1]["aria-label"]).toBe(p.T[lang].draftBtnLabel);
      expect(btn.args[1]["data-draft-btn"]).toBe("1");
      expect(btn.args[1]["aria-disabled"]).toBeUndefined();
      const outline = draft.find((n) => n.args[1]?.tone === "outline");
      expect(textOf(outline)).toBe(p.T[lang].statusDraft);
    });
  }

  it("a row with no status shows no badge (never a guessed state)", () => {
    const p = page({ rows: [{ id: "c-sedan", name: "Economy Sedan" }], rates: [rates[0]!] });
    const cell = cellOf(p.vals(), "c-sedan");
    expect(cell.some((n) => n.args[1]?.tone)).toBe(false);
    expect(cell.some((n) => n.args[0] === "button")).toBe(false);
  });

  it("the Draft button is aria-disabled and ignores clicks while that class is going live", async () => {
    const p = page({ rates });
    p.comp.state = { ...p.comp.state, goLiveTarget: { id: "c-van", rowId: "r2" }, goLiveBusy: true };
    const btn = cellOf(p.vals(), "c-van").find((n) => n.args[0] === "button");
    expect(btn.args[1]["aria-disabled"]).toBe("true");
    btn.args[1].onClick({ stopPropagation: noop });
    expect(p.comp.state.goLiveTarget).toEqual({ id: "c-van", rowId: "r2" });
  });

  it("the Draft button opens the Go live dialog for its class", () => {
    const p = page({ rates });
    const btn = cellOf(p.vals(), "c-van").find((n) => n.args[0] === "button");
    btn.args[1].onClick({ stopPropagation: noop });
    expect(p.comp.state.goLiveTarget).toEqual({ id: "c-van", rowId: "r2" });
    expect(p.vals().goLiveOpen).toBe(true);
  });
});

describe("Go live dialog: the checklist is the server's missing list", () => {
  const open = (p: ReturnType<typeof page>, id: string) => {
    p.comp.state = { ...p.comp.state, goLiveTarget: { id, rowId: "r" } };
    return p.vals();
  };
  for (const lang of LANGS) {
    it(`${lang}: Photo, Seats, Bags, Price states and the first-missing why-line`, () => {
      const p = page({ lang });
      const t = p.T[lang];
      // photo,price missing -> Photo is first -> goLiveNeedsPhoto
      let v = open(p, "c-van");
      expect(v.goLiveItems.map((i: Json) => [i.label, i.state])).toEqual([
        [t.needPhoto, "missing"], [t.needSeats, "done"], [t.needBags, "done"], [t.needPrice, "missing"],
      ]);
      expect(v.goLiveItems[0].stateLabel).toBe(t.itemMissing);
      expect(v.goLiveItems[1].stateLabel).toBe(t.itemDone);
      expect(v.goLiveItems[0].icon).toBe("circle-alert");
      expect(v.goLiveItems[1].icon).toBe("circle-check");
      expect(v.goLiveWhy).toBe(t.goLiveNeedsPhoto);
      expect(v.goLiveBlocked).toBe(true);
      expect(v.goLiveDisabled).toBe(true);

      // nothing missing -> no why-line, GO LIVE enabled
      v = open(p, "c-lux");
      expect(v.goLiveItems.every((i: Json) => i.state === "done")).toBe(true);
      expect(v.goLiveWhy).toBe("");
      expect(v.goLiveBlocked).toBe(false);
      expect(v.goLiveDisabled).toBe(false);
      expect(v.goLiveButtonLabel).toBe(t.goLive);
    });
  }

  it("why-line picks the first missing item in the order Photo, Seats, Bags, Price", () => {
    const cases: Array<[string, string]> = [
      ["photo,price", "goLiveNeedsPhoto"],
      ["seats,bags,price", "goLiveNeedsSeats"],
      ["bags", "goLiveNeedsBags"],
      ["price", "goLiveNeedsPrice"],
      ["price,bags", "goLiveNeedsBags"],
      ["", ""],
    ];
    for (const [missing, key] of cases) {
      const p = page({ rows: [{ id: "c1", name: "X", status: "draft", missing }] });
      p.comp.state = { ...p.comp.state, goLiveTarget: { id: "c1", rowId: "r" } };
      const v = p.vals();
      expect(v.goLiveWhy, missing).toBe(key ? p.T.en[key] : "");
    }
  });

  it("an empty Draft (photo,seats,bags,price missing) lists Seats and Bags as missing and blocks GO LIVE (sheet 11a)", () => {
    for (const lang of LANGS) {
      const p = page({ lang, rows: [{ id: "c1", name: "New", status: "draft", passengerCapacity: null, luggageCapacity: null, missing: "photo,seats,bags,price" }] });
      p.comp.state = { ...p.comp.state, goLiveTarget: { id: "c1", rowId: "r" } };
      const v = p.vals();
      expect(v.goLiveItems.map((i: Json) => i.state)).toEqual(["missing", "missing", "missing", "missing"]);
      expect(v.goLiveDisabled).toBe(true);
    }
  });

  it("a Draft row without a missing list is treated as missing everything, never complete", () => {
    const p = page({ rows: [{ id: "c1", name: "X", status: "draft" }] });
    p.comp.state = { ...p.comp.state, goLiveTarget: { id: "c1", rowId: "r" } };
    expect(p.vals().goLiveDisabled).toBe(true);
  });

  for (const lang of LANGS) {
    it(`${lang}: GO LIVE shows "Going live" while saving and the error line after a refused call`, async () => {
      const p = page({ lang, goLiveAnswer: { ok: false, code: "incomplete", missing: ["price"] } });
      const t = p.T[lang];
      p.comp.state = { ...p.comp.state, goLiveTarget: { id: "c-lux", rowId: "r" } };
      p.comp.confirmGoLive();
      let v = p.vals();
      expect(v.goLiveBusy).toBe(true);
      expect(v.goLiveButtonLabel).toBe(t.goingLive);
      expect(v.goLiveDisabled).toBe(true);
      await new Promise((r) => setTimeout(r, 0));
      v = p.vals();
      expect(p.calls.goLive).toEqual(["c-lux"]);
      expect(v.goLiveFailed).toBe(true);
      expect(v.tGoLiveError).toBe(t.goLiveError);
      expect(v.goLiveBusy).toBe(false);
      expect(v.goLiveOpen).toBe(true);
      expect(p.calls.classesReads).toBeGreaterThan(0);
    });
  }

  it("success closes the dialog and asks to focus the class badge; a blocked class never calls the server", async () => {
    const p = page();
    p.comp.state = { ...p.comp.state, goLiveTarget: { id: "c-van", rowId: "r" } };
    p.comp.confirmGoLive();
    expect(p.calls.goLive).toEqual([]);
    p.comp.state = { ...p.comp.state, goLiveTarget: { id: "c-lux", rowId: "r" } };
    p.comp.confirmGoLive();
    await new Promise((r) => setTimeout(r, 0));
    expect(p.calls.goLive).toEqual(["c-lux"]);
    expect(p.comp.state.goLiveTarget).toBeNull();
    expect(p.comp._pendingFocus).toEqual({ sel: '[data-class-id="c-lux"]' });
  });

  it("EDIT CLASS closes the dialog and opens the editor on that row", () => {
    const p = page();
    p.comp.state = { ...p.comp.state, goLiveTarget: { id: "c-van", rowId: "r2" } };
    p.comp.editFromGoLive();
    expect(p.comp.state.goLiveTarget).toBeNull();
    expect(p.comp.state.distanceEditId).toBe("r2");
    expect(p.comp.state.distanceEditTick).toBe(1);
  });

  it("no Phase 30 control publishes a price book", async () => {
    const p = page();
    p.comp.state = { ...p.comp.state, goLiveTarget: { id: "c-lux", rowId: "r" } };
    p.comp.confirmGoLive();
    p.comp.askRetire({ vehicleClassId: "c-sedan", klass: "Economy Sedan" });
    p.comp.submitRetire();
    p.comp.bringBack("c-old");
    await new Promise((r) => setTimeout(r, 0));
    expect(p.calls.publish).toEqual([]);
    // the only publish call in the source is the owner's existing Publish button
    expect((SRC.match(/\.publish\(/g) ?? []).length).toBe(1);
  });
});

describe("Seats and bags start empty (decision 6, sheet 11a)", () => {
  it("ADD CLASS opens with Seats and Bags empty, never 3 and 3", () => {
    const v = page().vals();
    const blank = v.distanceBlank();
    expect(blank.maxPax).toBe("");
    expect(blank.maxBags).toBe("");
  });

  it("the class table shows a dash for an empty count and keeps a real 0", () => {
    const v = page().vals();
    const pax = v.distanceColumns.find((c: Json) => c.key === "maxPax");
    const bags = v.distanceColumns.find((c: Json) => c.key === "maxBags");
    expect(pax.lookup({ maxPax: "" })).toBe("—");
    expect(bags.lookup({ maxBags: "" })).toBe("—");
    expect(bags.lookup({ maxBags: 0 })).toBe(0);
    expect(pax.lookup({ maxPax: 4 })).toBe(4);
  });

  it("the seat and bag editor fields allow an empty value", () => {
    const f = page().vals().distanceFields;
    expect(f.find((x: Json) => x.key === "maxPax").allowEmpty).toBe(true);
    expect(f.find((x: Json) => x.key === "maxBags").allowEmpty).toBe(true);
  });

  it("a server class row with null capacity maps to '' in the table row (never 3)", () => {
    const rows = [{ id: "c1", name: "New class", status: "draft", passengerCapacity: null, luggageCapacity: null, missing: "photo,seats,bags,price" }];
    const v = page({ rows }).vals();
    const row = v.distanceRows.find((r: Json) => r.vehicleClassId === "c1");
    expect(row.maxPax).toBe("");
    expect(row.maxBags).toBe("");
  });

  it("a rate row with null capacity stays '' too, a real 0 bags stays 0, and the class row fills a gap", () => {
    const rates = [
      { id: "r1", klass: "A", name: "A", vehicleClassId: "ca", maxPax: null, maxBags: null, baseFare: {}, perKm: {}, airportStart: {} },
      { id: "r2", klass: "B", name: "B", vehicleClassId: "cb", maxPax: 4, maxBags: 0, baseFare: {}, perKm: {}, airportStart: {} },
      { id: "r3", klass: "C", name: "C", vehicleClassId: "cc", maxPax: null, maxBags: null, baseFare: {}, perKm: {}, airportStart: {} },
    ];
    const rows = [
      { id: "ca", name: "A", status: "draft", passengerCapacity: null, luggageCapacity: null, missing: "seats,bags" },
      { id: "cb", name: "B", status: "live", passengerCapacity: 4, luggageCapacity: 0, missing: "" },
      { id: "cc", name: "C", status: "live", passengerCapacity: 7, luggageCapacity: 5, missing: "" },
    ];
    const v = page({ rows, rates }).vals();
    const by = (id: string) => v.distanceRows.find((r: Json) => r.vehicleClassId === id);
    expect([by("ca").maxPax, by("ca").maxBags]).toEqual(["", ""]);
    expect([by("cb").maxPax, by("cb").maxBags]).toEqual([4, 0]);
    expect([by("cc").maxPax, by("cc").maxBags]).toEqual([7, 5]);
  });
});

describe("source rules (plan 08)", () => {
  it("has no 78px class-cell cap, no fallback state from `active`, no default of 3", () => {
    expect(SRC).not.toContain("max-width:78px");
    expect(SRC).not.toContain("statusOf");
    expect(SRC).not.toContain("c.active === false || c.hiddenAt");
    expect(SRC).not.toMatch(/maxPax: r\.maxPax \|\| 3|r\.luggageCapacity \|\| 3|maxBags: blank\.maxBags \|\| 3/);
    expect((SRC.match(/allowEmpty:true/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(SRC).toContain('aria-haspopup');
  });
});

describe("Retire dialog: facts, warning, reason and result", () => {
  const retireRow = (id: string, extra: Json = {}) => [
    { id: "c-sedan", name: "Economy Sedan", status: "live", unassignedPaidTrips: 0 },
    { id: "c-van", name: "Economy Van", status: "draft", unassignedPaidTrips: 0 },
    ...[],
  ].map((r) => (r.id === id ? { ...r, ...extra } : r));
  const chauf = (n: number, cls = "c-sedan") => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, vehicleClassId: cls }));
  const open = (p: ReturnType<typeof page>, id = "c-sedan") => {
    p.comp.askRetire({ vehicleClassId: id, klass: "Economy Sedan" });
    return p.vals();
  };

  it("opens only from a row that has a class id, with the class name", () => {
    const p = page();
    p.comp.askRetire({ klass: "x" });
    expect(p.vals().retireOpen).toBe(false);
    const v = open(p);
    expect(v.retireOpen).toBe(true);
    expect(v.retireClassName).toBe("Economy Sedan");
  });

  it("the table's delete paths all open Retire (no removed function)", () => {
    const p = page();
    p.vals().deleteDistance("r1", { vehicleClassId: "c-sedan", klass: "Economy Sedan" });
    expect(p.vals().retireOpen).toBe(true);
  });

  it("trips line (R1) is hidden when unassignedPaidTrips is 0 or missing", () => {
    for (const extra of [{ unassignedPaidTrips: 0 }, { unassignedPaidTrips: undefined }, { unassignedPaidTrips: null }]) {
      const p = page({ rows: retireRow("c-sedan", extra) });
      expect(open(p).retireUnassignedShow, JSON.stringify(extra)).toBe(false);
    }
  });

  it("trips line reads the signed one/many wording in en, de and fr", () => {
    const want = {
      en: ["paid trip ahead has no chauffeur yet", "paid trips ahead have no chauffeur yet"],
      de: ["kommende bezahlte Fahrt hat noch keinen Chauffeur", "kommende bezahlte Fahrten haben noch keinen Chauffeur"],
      fr: ["course payée à venir n’a pas encore de chauffeur", "courses payées à venir n’ont pas encore de chauffeur"],
    } as const;
    for (const lang of ["en", "de", "fr"] as const) {
      const one = open(page({ lang, rows: retireRow("c-sedan", { unassignedPaidTrips: 1 }) }));
      expect([one.retireUnassignedShow, one.retireUnassignedN, one.retireUnassignedWords, one.retireUnassignedNumShow]).toEqual([true, "1", want[lang][0], true]);
      const two = open(page({ lang, rows: retireRow("c-sedan", { unassignedPaidTrips: 2 }) }));
      expect([two.retireUnassignedN, two.retireUnassignedWords]).toEqual(["2", want[lang][1]]);
    }
    expect(page().T.en.retireUnassignedOne).toBe("paid trip ahead has no chauffeur yet");
  });

  it("trips line in Arabic: five forms, number span only from 3 up", () => {
    const want: Record<number, string> = {
      1: "رحلة واحدة مدفوعة قادمة بلا سائق بعد",
      2: "رحلتان مدفوعتان قادمتان بلا سائق بعد",
      5: "رحلات مدفوعة قادمة بلا سائق بعد",
      11: "رحلةً مدفوعةً قادمةً بلا سائق بعد",
      100: "رحلة مدفوعة قادمة بلا سائق بعد",
    };
    for (const [n, words] of Object.entries(want)) {
      const v = open(page({ lang: "ar", rows: retireRow("c-sedan", { unassignedPaidTrips: Number(n) }) }));
      expect(v.retireUnassignedWords, `n=${n}`).toBe(words);
      expect(v.retireUnassignedNumShow, `n=${n}`).toBe(Number(n) >= 3);
      expect(v.retireUnassignedN).toBe(n);
    }
  });

  it("the trips line sits between the chauffeur line and the last-Live warning", () => {
    const block = SRC.slice(SRC.indexOf('<div data-retire-notes="1">'));
    const iCount = block.indexOf('data-retire-count="1"');
    const iTrips = block.indexOf('data-retire-unassigned="1"');
    const iLast = block.indexOf('data-retire-lastlive="1"');
    expect(iCount).toBeGreaterThan(-1);
    expect(iTrips).toBeGreaterThan(iCount);
    expect(iLast).toBeGreaterThan(iTrips);
  });

  it("chauffeur count line: hidden at 0 and while the list is not loaded; one/many in en, de, fr", () => {
    expect(open(page({ chauffeurs: [] })).retireCountShow).toBe(false);
    const want = {
      en: ["chauffeur is on this class", "chauffeurs are on this class"],
      de: ["Chauffeur ist in dieser Klasse", "Chauffeure sind in dieser Klasse"],
      fr: ["chauffeur est dans cette classe", "chauffeurs sont dans cette classe"],
    } as const;
    for (const lang of ["en", "de", "fr"] as const) {
      const one = open(page({ lang, chauffeurs: chauf(1) }));
      expect([one.retireCountShow, one.retireCountN, one.retireCountWords]).toEqual([true, "1", want[lang][0]]);
      const two = open(page({ lang, chauffeurs: chauf(2) }));
      expect([two.retireCountN, two.retireCountWords]).toEqual(["2", want[lang][1]]);
    }
    // chauffeurs of another class do not count
    expect(open(page({ chauffeurs: chauf(3, "c-van") })).retireCountShow).toBe(false);
  });

  it("chauffeur count line in Arabic: forms 1, 2, 5, 11, 100", () => {
    const want: Record<number, string> = {
      1: "سائق واحد في هذه الفئة", 2: "سائقان في هذه الفئة", 5: "سائقين في هذه الفئة", 11: "سائقًا في هذه الفئة", 100: "سائق في هذه الفئة",
    };
    for (const [n, words] of Object.entries(want)) {
      const v = open(page({ lang: "ar", chauffeurs: chauf(Number(n)) }));
      expect(v.retireCountWords, `n=${n}`).toBe(words);
      expect(v.retireCountNumShow).toBe(Number(n) >= 3);
    }
  });

  it("last-Live warning only for the last Live class, never blocks RETIRE", () => {
    const lastLive = [
      { id: "c-sedan", name: "Economy Sedan", status: "live" },
      { id: "c-van", name: "Economy Van", status: "draft" },
    ];
    expect(open(page({ rows: lastLive })).retireLastLiveShow).toBe(true);
    // a Draft class never shows it
    expect(open(page({ rows: lastLive }), "c-van").retireLastLiveShow).toBe(false);
    // another Live class exists
    const two = [...lastLive, { id: "c-x", name: "X", status: "live" }];
    expect(open(page({ rows: two })).retireLastLiveShow).toBe(false);
    // RETIRE is enabled with the warning showing
    const p = page({ rows: lastLive });
    const v = open(p);
    expect(v.retireLastLiveShow).toBe(true);
    expect(v.retireBusy).toBe(false);
    expect(SRC).toMatch(/<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1\.Button"[^>]*onClick="\{\{ submitRetire \}\}" disabled="\{\{ retireBusy \}\}"/);
  });

  it("the reason is capped at 140 characters (attribute and handler) with a live counter", () => {
    expect(SRC).toContain('max-length="{{ retireReasonMax }}"');
    const p = page();
    open(p);
    p.comp.setRetireReason({ target: { value: "x".repeat(200) } });
    const v = p.vals();
    expect(v.retireReasonMax).toBe(140);
    expect(p.comp.state.retireReason.length).toBe(140);
    expect(v.retireReasonCount).toBe("140 / 140");
  });

  it("RETIRE calls retireClass(id, trimmed reason or null) and closes on success", async () => {
    const p = page();
    open(p);
    p.comp.setRetireReason("  No longer offered  ");
    p.comp.submitRetire();
    expect(p.vals().retireBusy).toBe(true);
    expect(p.vals().retireSubmitLabel).toBe(p.T.en.retiring);
    await new Promise((r) => setTimeout(r, 0));
    expect(p.calls.retire).toEqual([["c-sedan", "No longer offered"]]);
    expect(p.vals().retireOpen).toBe(false);
    expect(p.comp._pendingFocus).toEqual({ sel: "[data-retired-head]" });

    const q = page();
    open(q);
    q.comp.submitRetire();
    await new Promise((r) => setTimeout(r, 0));
    expect(q.calls.retire).toEqual([["c-sedan", null]]);
  });

  for (const lang of LANGS) {
    it(`${lang}: a refused RETIRE shows the error, keeps the reason and re-enables the buttons`, async () => {
      const p = page({ lang, retireAnswer: { ok: false, code: "not-admin" } });
      open(p);
      p.comp.setRetireReason("Because");
      p.comp.submitRetire();
      await new Promise((r) => setTimeout(r, 0));
      const v = p.vals();
      expect(v.retireOpen).toBe(true);
      expect(v.retireErrorText).toBe(p.T[lang].retireError);
      expect(v.retireReason).toBe("Because");
      expect(v.retireBusy).toBe(false);
    });
  }

  it("CANCEL and Escape-style close do nothing while saving", () => {
    const p = page();
    open(p);
    p.comp.state = { ...p.comp.state, retireBusy: true };
    p.comp.closeRetire();
    expect(p.vals().retireOpen).toBe(true);
    p.comp.state = { ...p.comp.state, retireBusy: false };
    p.comp.closeRetire();
    expect(p.vals().retireOpen).toBe(false);
  });

  it("the old delete/hide dialog is gone from the source", () => {
    for (const bad of ["hideConflict", "deleteClassTitle", "hideWithReason", "deleteClassRow", "ops.deleteClass", "tDeleteClass", "hideTarget"]) {
      expect(SRC, bad).not.toContain(bad);
    }
  });

  it("the class table carries footDelete, actionsGap, tapArea and the Retire row icon", () => {
    const tag = SRC.match(/<dc-import name="OpsTable"[^>]*rows="\{\{ distanceRows \}\}"[^>]*>/)?.[0] ?? "";
    expect(tag).toContain('footDelete="{{ no }}"');
    expect(tag).toContain("actionsGap=");
    expect(tag).toContain('tapArea="{{ yes }}"');
    expect(tag).toContain('delete-icon="eye-off"');
    expect(tag).toContain('onAskDelete="{{ askRetire }}"');
    const v = page().vals();
    expect(v.no).toBe(false);
    expect(v.n12).toBe(12);
    expect(v.tRetire).toBe("Retire");
  });
});

describe("Retired list and Bring back (plan 08, task 3)", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const noRetired = ROWS.filter((r) => r.status !== "retired");

  it("the section is absent when no class is retired, present with the count otherwise", () => {
    expect(page({ rows: noRetired }).vals().hasRetired).toBe(false);
    const v = page().vals();
    expect(v.hasRetired).toBe(true);
    expect(v.retiredCount).toBe("1");
    expect(v.retiredItems.map((i: Json) => i.name)).toEqual(["Business"]);
  });

  it("is folded by default and the toggle label follows the open state", () => {
    const p = page();
    expect(p.vals().retiredOpen).toBe(false);
    expect(p.vals().retiredToggleLabel).toBe(p.T.en.retiredToggleClosed);
    p.comp.setState = (s: Json) => { p.comp.state = { ...p.comp.state, ...s }; };
    p.comp.toggleRetired();
    expect(p.vals().retiredOpen).toBe(true);
    expect(p.vals().retiredToggleLabel).toBe(p.T.en.retiredToggleOpen);
    expect(p.vals().retiredChevron).toBe("chevron-up");
  });

  it("the reason shows only when given", () => {
    const rows = [...noRetired, { id: "c-a", name: "A", status: "retired", retiredReason: "  Because  " }, { id: "c-b", name: "B", status: "retired", retiredReason: "" }, { id: "c-c", name: "C", status: "retired" }];
    const items = page({ rows }).vals().retiredItems;
    expect(items.map((i: Json) => [i.name, i.hasReason, i.reason])).toEqual([["A", true, "Because"], ["B", false, ""], ["C", false, ""]]);
  });

  it("BRING BACK calls bringBackClass with the id, re-reads classes and the live region announces in four languages", async () => {
    for (const lang of LANGS) {
      const p = page({ lang });
      expect(p.vals().announceText).toBe("");
      const reads = p.calls.classesReads;
      p.comp.bringBack("c-old");
      expect(p.vals().retiredItems[0].busy).toBe(true);
      expect(p.vals().retiredItems[0].label).toBe(p.T[lang].bringingBack);
      await tick(); await tick();
      expect(p.calls.bringBack, lang).toEqual(["c-old"]);
      expect(p.calls.classesReads, lang).toBeGreaterThan(reads);
      expect(p.vals().announceText, lang).toBe(p.T[lang].bringBackAnnounce);
      expect(p.vals().announceText.length).toBeGreaterThan(0);
    }
  });

  for (const lang of LANGS) {
    it(`${lang}: a refused BRING BACK shows the error on that row and keeps it`, async () => {
      const p = page({ lang, bringAnswer: { ok: false, code: "bad-transition" } });
      p.comp.bringBack("c-old");
      await tick(); await tick();
      const v = p.vals();
      expect(v.retiredItems[0].error).toBe(true);
      expect(v.retiredItems[0].busy).toBe(false);
      expect(v.tBringBackError).toBe(p.T[lang].bringBackError);
      expect(v.announceText).toBe("");
    });
  }

  it("source rules: on-scale padding, no medium weight in the retired rules, live region, inset hover", () => {
    expect(SRC).not.toContain("padding:10px 16px");
    expect(SRC).not.toContain("padding:8px 16px");
    const retiredRules = SRC.split("\n").filter((l) => l.trimStart().startsWith("[data-retired"));
    expect(retiredRules.length).toBeGreaterThan(3);
    for (const l of retiredRules) { expect(l).not.toContain("vt-weight-medium"); expect(l).not.toMatch(/font-weight:\s*500/); }
    expect(SRC).toContain('aria-live="polite"');
    expect(SRC).toContain("var(--vt-bg-inset)");
    expect(retiredRules.join("\n")).not.toMatch(/(margin|padding)-(left|right)|[^-]left:|[^-]right:/);
  });
});

describe("Go live dialog re-reads the class rows (30-08 lab defect)", () => {
  const stale: Json[] = ROWS.map((r) => (r.id === "c-van" ? { ...r, missing: "" } : r));
  const fresh: Json[] = ROWS.map((r) => (r.id === "c-van" ? { ...r, missing: "" } : r));
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("opening reloads the rows; once they answer the checklist is all done and GO LIVE is enabled", async () => {
    const p = page();
    const before = p.calls.classesReads;
    p.setRows(ROWS); // the page holds stale rows: photo,price missing
    p.setRows(fresh); // ...then the server answers with the saved state
    p.comp.state = { ...p.comp.state, classes: ROWS };
    p.comp.openGoLive("c-van", "r2");
    expect(p.calls.classesReads).toBe(before + 1);
    expect(p.vals().goLiveDisabled).toBe(true);
    await flush();
    const v = p.vals();
    expect(v.goLiveItems.every((i: Json) => i.state === "done")).toBe(true);
    expect(v.goLiveDisabled).toBe(false);
  });

  it("while the reload is pending GO LIVE is disabled and confirm does nothing, even if old rows said complete", async () => {
    const p = page({ rows: stale });
    let release: (r: Json[]) => void = () => undefined;
    p.comp.state = { ...p.comp.state, classes: stale };
    const pending = new Promise<Json[]>((res) => { release = res; });
    const w = (p.comp as Json);
    w.loadClasses = () => pending.then((rows) => w.setState({ classes: rows }));
    p.comp.openGoLive("c-van", "r2");
    expect(p.vals().goLiveDisabled).toBe(true);
    p.comp.confirmGoLive();
    expect(p.calls.goLive).toEqual([]);
    release(fresh);
    await flush();
    expect(p.vals().goLiveDisabled).toBe(false);
  });

  it("GO LIVE is enabled again after a failed reload (old rows decide)", async () => {
    const p = page({ rows: stale });
    const w = p.comp as Json;
    w.loadClasses = () => Promise.reject(new Error("offline"));
    w.openGoLive("c-van", "r2");
    await flush();
    expect(w.state.goLiveLoading).toBe(false);
  });

  it("a successful publish reloads the classes", async () => {
    const p = page();
    const before = p.calls.classesReads;
    p.comp.loadDraft = () => Promise.resolve();
    p.comp.afterPublish({ ok: true });
    await flush();
    expect(p.calls.classesReads).toBe(before + 1);
  });
});

describe("focusSoon retries while the table re-renders (30-08 lab defect)", () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const fakeDoc = () => {
    const body = { name: "body" };
    const els: Record<string, Json> = {};
    const doc: Json = {
      body, activeElement: body,
      addEventListener: noop, removeEventListener: noop,
      querySelector: (sel: string) => els[sel] ?? null,
    };
    const make = (sel: string) => { els[sel] = { focus() { doc.activeElement = this; } }; return els[sel]; };
    return { doc, make };
  };

  it("a target inserted after about 150 ms ends up focused", async () => {
    const { doc, make } = fakeDoc();
    const p = page({ doc });
    p.comp.focusSoon('[data-class-id="c-lux"]');
    await wait(150);
    const el = make('[data-class-id="c-lux"]');
    await wait(200);
    expect(doc.activeElement).toBe(el);
    p.comp.componentWillUnmount();
  });

  it("focus the user moved to another real element is not taken", async () => {
    const { doc, make } = fakeDoc();
    const p = page({ doc });
    const el = make('[data-class-id="c-lux"]');
    const other = { name: "other", focus() { doc.activeElement = this; } };
    p.comp.focusSoon('[data-class-id="c-lux"]');
    await wait(20);
    expect(doc.activeElement).toBe(el);
    doc.activeElement = other;
    await wait(300);
    expect(doc.activeElement).toBe(other);
    p.comp.componentWillUnmount();
  });
});
