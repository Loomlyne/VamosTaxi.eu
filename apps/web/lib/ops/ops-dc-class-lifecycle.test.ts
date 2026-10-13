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

function page(opts: { rows?: Json[]; lang?: Lang; rates?: Json[]; chauffeurs?: Json[]; goLiveAnswer?: Json; retireAnswer?: Json; bringAnswer?: Json } = {}) {
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
  )(StubLogic, win, { addEventListener: noop, removeEventListener: noop }, { createElement: (...args: unknown[]) => ({ args }) }) as {
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
