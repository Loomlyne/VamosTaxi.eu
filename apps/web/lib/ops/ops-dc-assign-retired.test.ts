// apps/web/lib/ops/ops-dc-assign-retired.test.ts
//
// Phase 30 (CLS-09, CLS-10), plan 30-07: the Assign block of booking detail on a trip booked in a retired class.
// The picker offers nobody on that class, a muted "N chauffeurs left out: retired class" line says why (signed
// 2026-10-12, sheet 7; Arabic count forms 1, 2, 3-10, 11-99, 100+), and the false "No chauffeur has the class"
// note is not shown. A Draft class is not retired (state is the server field status, never active). Until the
// class rows have loaded nothing is hidden and no number is guessed.
//
// Technique of ops-dc-chauffeur-class.test.ts: the DC logic class is loaded from the page source with a
// stubbed window. No DOM, no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const detailSource = readFileSync(join(root, "app/ops/OpsDetail.dc.html"), "utf8");

function scriptOf(src: string): string {
  const m = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error("no data-dc-script");
  return m[1];
}

type Vals = Record<string, any>;
type Logic = { state: Record<string, any>; renderVals(): Vals };

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

function loadDetail(win: Record<string, unknown>, lang: string, props: Record<string, unknown>): Logic {
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
    `${scriptOf(detailSource)}\n;return Component;`,
  );
  const Component = fn(
    Base,
    Base,
    React,
    win,
    doc,
    { pushState() {} },
    { getItem: (k: string) => (k === "vamosLang" ? lang : null), setItem() {} },
    { pathname: "/bookings/VT-26-0042", href: "https://dashboard.vamostaxi.site/bookings/VT-26-0042" },
    class {},
  ) as new (p: Record<string, unknown>) => Logic;
  const logic = new Component(props);
  logic.state = { ...logic.state, lang };
  return logic;
}

const ECONOMY = "e0000000-0000-4000-8000-00000000ec01";
const BUSINESS = "e0000000-0000-4000-8000-00000000b501";
const VAN = "e0000000-0000-4000-8000-00000000fa01";
const idOf = (n: number) => `c0000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

function onClass(count: number, classId: string, className: string, first = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: idOf(first + i),
    name: `Chauffeur ${first + i}`,
    vehicleClassId: classId,
    vehicleClassName: className,
    plate: `ZH ${first + i}`,
  }));
}

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

function detail(opts: {
  trip?: Record<string, unknown>;
  drivers: unknown[];
  classRows?: { id: string; status: string }[] | null;
  lang?: string;
  answer?: unknown;
}) {
  const b = booking(opts.trip);
  const request = vi.fn(async () => opts.answer ?? { ok: true });
  const on = () => () => undefined;
  const win = {
    VamosOps: {
      bookings: { all: () => [b], onChange: on, reset: vi.fn() },
      chauffeurs: { all: () => opts.drivers, onChange: on },
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
  const logic = loadDetail(win, opts.lang ?? "en", { id: b.id });
  if (opts.classRows !== undefined) logic.state = { ...logic.state, classRows: opts.classRows };
  return { logic, request, vals: () => logic.renderVals() };
}

const ROWS = [
  { id: BUSINESS, status: "retired" },
  { id: ECONOMY, status: "live" },
  { id: VAN, status: "draft" },
];

describe("Assign block, trip booked in a retired class (30-07)", () => {
  it("(a) 2 chauffeurs on the retired class: picker empty, left-out line shown, no false note (en, de, fr)", () => {
    const drivers = [...onClass(2, BUSINESS, "Business"), ...onClass(1, ECONOMY, "Economy", 5)];
    const want: Record<string, string> = {
      en: "chauffeurs left out: retired class",
      de: "Chauffeure ausgeblendet: stillgelegte Klasse",
      fr: "chauffeurs écartés : classe retirée",
    };
    for (const [lang, tail] of Object.entries(want)) {
      const v = detail({ drivers, classRows: ROWS, lang }).vals();
      expect(v.driverOptions, lang).toEqual([]);
      expect(v.showLeftOut, lang).toBe(true);
      expect(v.leftOutN, lang).toBe(2);
      expect(v.leftOutNumShow, lang).toBe(true);
      expect(v.tLeftOut, lang).toBe(tail);
      expect(v.showNoDrivers, lang).toBe(false);
    }
  });

  it("(a) Arabic dual: the sentence carries the number, so the number span is not shown", () => {
    const drivers = onClass(2, BUSINESS, "Business");
    const v = detail({ drivers, classRows: ROWS, lang: "ar" }).vals();
    expect(v.showLeftOut).toBe(true);
    expect(v.leftOutNumShow).toBe(false);
    expect(v.tLeftOut).toBe("سائقان مستبعدان: فئة موقوفة");
    expect(v.showNoDrivers).toBe(false);
  });

  it("(b) one chauffeur: the singular line in en, de, fr and the Arabic one-form with no number span", () => {
    const drivers = onClass(1, BUSINESS, "Business");
    const want: Record<string, string> = {
      en: "chauffeur left out: retired class",
      de: "Chauffeur ausgeblendet: stillgelegte Klasse",
      fr: "chauffeur écarté : classe retirée",
      ar: "سائق واحد مستبعد: فئة موقوفة",
    };
    for (const [lang, tail] of Object.entries(want)) {
      const v = detail({ drivers, classRows: ROWS, lang }).vals();
      expect(v.leftOutN, lang).toBe(1);
      expect(v.tLeftOut, lang).toBe(tail);
      expect(v.leftOutNumShow, lang).toBe(lang !== "ar");
    }
  });

  it("(b) 5 and 11 chauffeurs: the Arabic plural and accusative forms, number span shown", () => {
    const five = detail({ drivers: onClass(5, BUSINESS, "Business"), classRows: ROWS, lang: "ar" }).vals();
    expect(five.leftOutN).toBe(5);
    expect(five.leftOutNumShow).toBe(true);
    expect(five.tLeftOut).toBe("سائقين مستبعدين: فئة موقوفة");
    const eleven = detail({ drivers: onClass(11, BUSINESS, "Business"), classRows: ROWS, lang: "ar" }).vals();
    expect(eleven.leftOutN).toBe(11);
    expect(eleven.tLeftOut).toBe("سائقًا مستبعدًا: فئة موقوفة");
    const many = detail({ drivers: onClass(5, BUSINESS, "Business"), classRows: ROWS, lang: "en" }).vals();
    expect(many.tLeftOut).toBe("chauffeurs left out: retired class");
  });

  it("(c) a trip in a Live class: line hidden, picker unchanged", () => {
    const drivers = [...onClass(2, BUSINESS, "Business"), ...onClass(2, ECONOMY, "Economy", 5)];
    const v = detail({ trip: { vehicleClassId: ECONOMY, klass: "Economy", className: "Economy" }, drivers, classRows: ROWS }).vals();
    expect(v.showLeftOut).toBe(false);
    expect(v.leftOutN).toBe(0);
    expect(v.driverOptions.map((o: { value: string }) => o.value)).toEqual([idOf(5), idOf(6)]);
    expect(v.showNoDrivers).toBe(false);
  });

  it("(c) a Live-class trip still gets the existing 'no chauffeur has the class' note when nobody has it", () => {
    const v = detail({ trip: { vehicleClassId: ECONOMY, klass: "Economy", className: "Economy" }, drivers: onClass(2, BUSINESS, "Business"), classRows: ROWS }).vals();
    expect(v.showLeftOut).toBe(false);
    expect(v.showNoDrivers).toBe(true);
    expect(v.tNoDrivers).toBe("No chauffeur has the class Economy yet. Choose it on Chauffeurs.");
  });

  it("(d) a Draft class is not retired: chauffeurs on it are offered as today", () => {
    const drivers = onClass(2, VAN, "Van luxury");
    const v = detail({ trip: { vehicleClassId: VAN, klass: "Van luxury", className: "Van luxury" }, drivers, classRows: ROWS }).vals();
    expect(v.showLeftOut).toBe(false);
    expect(v.driverOptions).toHaveLength(2);
  });

  it("(d) a class that is inactive but not retired (active false, status draft) is not retired", () => {
    const drivers = onClass(2, VAN, "Van luxury");
    const rows = [{ id: VAN, status: "draft", active: false, hiddenAt: "2026-10-01" }];
    const v = detail({ trip: { vehicleClassId: VAN, klass: "Van luxury", className: "Van luxury" }, drivers, classRows: rows as never }).vals();
    expect(v.showLeftOut).toBe(false);
    expect(v.driverOptions).toHaveLength(2);
  });

  it("(e) class rows not loaded: line hidden, nothing guessed", () => {
    const drivers = onClass(2, BUSINESS, "Business");
    const v = detail({ drivers, classRows: null }).vals();
    expect(v.showLeftOut).toBe(false);
    expect(v.leftOutN).toBe(0);
  });

  it("a chauffeur on another retired class is left out of every picker (strict rule)", () => {
    const drivers = [...onClass(1, BUSINESS, "Business"), ...onClass(1, ECONOMY, "Economy", 5)];
    const rows = [{ id: BUSINESS, status: "live" }, { id: ECONOMY, status: "retired" }];
    const v = detail({ drivers, classRows: rows }).vals();
    expect(v.driverOptions.map((o: { value: string }) => o.value)).toEqual([idOf(1)]);
    expect(v.showLeftOut).toBe(false);
  });

  it("an assign answer class-retired shows the existing generic assignFailed line", async () => {
    const drivers = onClass(1, ECONOMY, "Economy");
    const d = detail({
      trip: { vehicleClassId: ECONOMY, klass: "Economy", className: "Economy" },
      drivers,
      classRows: [{ id: ECONOMY, status: "live" }],
      answer: { ok: false, code: "class-retired" },
    });
    d.vals().pickDriverFromSelect({ target: { value: idOf(1) } });
    d.vals().confirmAssign();
    await new Promise((r) => setTimeout(r, 0));
    expect(d.logic.state.assignError).toBe("Could not assign VT-26-0042");
  });

  it("the markup: a muted 13px line under the picker, number span vt-dir-keep + data-vt-no-i18n, no icon", () => {
    const line = /<p data-ops-assign-leftout="1" data-ops-assign-under>(.*?)<\/p>/.exec(detailSource);
    expect(line).not.toBeNull();
    expect(line![1]).toMatch(/<span class="vt-dir-keep" data-vt-no-i18n [^>]*>\{\{ leftOutN \}\}<\/span>/);
    expect(line![1]).toContain("{{ tLeftOut }}");
    expect(line![1]).not.toMatch(/Icon|<svg/);
    expect(detailSource).toMatch(/\[data-ops-assign-leftout\]\{margin:8px 0 0;font-size:13px;[^}]*color:var\(--vt-text-muted\)\}/);
    expect(detailSource).toMatch(/c\.status === 'retired'/);
    expect(detailSource).not.toMatch(/c\.active === false \|\| c\.hiddenAt/);
  });
});
