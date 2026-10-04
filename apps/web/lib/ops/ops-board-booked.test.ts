// apps/web/lib/ops/ops-board-booked.test.ts
//
// Quick 261004-ops-booked-column, owner 2026-10-04 (question form): the dashboard bookings table shows
// when each booking was made. Format "4 Oct · 14:32" in Zurich time, the year only when it is not this
// year; the column sits where the reference would be, ahead of Pickup. The board table has no Ref column
// (Ref is editor-only since ceec3a9e), so Booked is the first column.
//
// Data path under test: bookings.created_at -> loadBookings SQL -> mapBoardBooking (createdAt, ISO UTC)
// -> vamos-ops-data.js cleanBooking -> OpsBoard column. No DOM, no network: the script block of the DC
// file runs against a stub DCLogic, the way ops-dc-p4.test.ts drives OpsDetail.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mapBoardBooking, type SqlBoardRow } from "./bookings-map";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

type Json = Record<string, unknown>;
const LANGS = ["en", "de", "fr", "ar"] as const;
type Lang = (typeof LANGS)[number];

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

type Column = {
  key: string;
  // A plain word, or the sort button the board puts in Booked, Vehicle, Driver and Total (ops-board-sort.test.ts).
  header: string | React.ReactElement;
  width?: string;
  render?: (row: Json) => React.ReactElement;
};
type BoardComp = { state: Json; renderVals(): { columns: Column[] } };
type BookedParts = { day: string; month: string; year: string; time: string; full: string };
type Loaded = {
  Component: new () => BoardComp;
  T: Record<Lang, Record<string, string>>;
  bookedParts: (at: unknown, now?: Date) => BookedParts | null;
};

function loadBoard(rows: Json[] = [], lang: Lang = "en"): { comp: BoardComp; loaded: Loaded } {
  const html = read("app/ops/OpsBoard.dc.html");
  const m = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
  if (!m?.[1]) throw new Error("missing script block in OpsBoard.dc.html");
  const win = {
    VamosOps: {
      bookings: { all: () => rows, onChange: () => noop },
      VEHICLE_CLASSES: ["Economy", "Business", "Van luxury"],
      BOOKING_STATUS: ["pending", "confirmed"],
      chauffeurs: { all: () => [] },
    },
    VamosLocale: { lang: () => lang, cur: () => "CHF", money: (v: unknown) => `CHF ${String(v)}` },
    addEventListener: noop,
    removeEventListener: noop,
    VamosTaxiDesignSystem_245af1: {},
  };
  const loaded = new Function(
    "DCLogic", "React", "window", "location", "sessionStorage", "document", "history",
    `${m[1]}\nreturn { Component, T, bookedParts };`,
  )(StubLogic, React, win, { search: "" }, { getItem: () => null, removeItem: noop }, {}, {}) as Loaded;
  return { comp: new loaded.Component(), loaded };
}

function renderOf(rows: Json[] = []): (row: Json) => React.ReactElement {
  const render = loadBoard(rows).comp.renderVals().columns[0]?.render;
  if (!render) throw new Error("Booked column has no render");
  return render;
}

/** The visible text of a rendered cell, tags dropped. */
const textOf = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]*>/g, "");

const NOW = new Date("2026-10-20T08:00:00Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("data path: bookings.created_at reaches the board row", () => {
  const base: SqlBoardRow = {
    id: "00000000-0000-4000-8000-000000000737",
    reference: "VT-26-0737",
    status: "confirmed",
    contact_name: "Test Guest",
    contact_email: null,
    contact_phone: null,
    company_name: null,
    note: null,
    pay_link_sent_at: null,
    pickup_text: "Zurich Airport",
    dropoff_text: "Bahnhofstrasse",
    scheduled_local: "2026-10-21 08:15",
    scheduled_at: "2026-10-21T06:15:00Z",
    flight_no: null,
    pax: 2,
    bags: 1,
    class_slug: "economy",
    chauffeur_name: null,
    payment_status: "captured",
    captured_at: "2026-10-04T12:33:00Z",
    payment_created_at: "2026-10-04T12:31:00Z",
    stripe_checkout_session_id: null,
    charged_rappen: null,
  };

  it("the staff board query selects b.created_at (the table's own column, no migration)", () => {
    const sql = read("apps/web/lib/ops/bookings.ts");
    const select = sql.slice(sql.indexOf("select\n        b.id,"), sql.indexOf("from public.bookings b"));
    expect(select).toMatch(/\bb\.created_at,/);
  });

  it("mapBoardBooking hands createdAt over as a UTC ISO string, from a Date or a string", () => {
    expect(mapBoardBooking({ ...base, created_at: new Date("2026-10-04T12:32:07.000Z") }).createdAt).toBe(
      "2026-10-04T12:32:07.000Z",
    );
    expect(mapBoardBooking({ ...base, created_at: "2026-10-04 14:32:07+02" }).createdAt).toBe(
      "2026-10-04T12:32:07.000Z",
    );
  });

  it("a row without a creation time maps to an empty string, never a made-up date", () => {
    expect(mapBoardBooking(base).createdAt).toBe("");
    expect(mapBoardBooking({ ...base, created_at: null }).createdAt).toBe("");
    expect(mapBoardBooking({ ...base, created_at: "not a date" }).createdAt).toBe("");
  });

  it("the store (cleanBooking) keeps createdAt, so the board can read it", async () => {
    const store = read("app/vamos-ops-data.js");
    const win: Json = {
      VamosOpsApi: {
        request: () =>
          Promise.resolve({
            ok: true,
            data: [{ id: "VT-1", status: "confirmed", paid: true, createdAt: "2026-10-04T12:32:07.000Z" }],
          }),
      },
      dispatchEvent: () => true,
      addEventListener: noop,
    };
    vm.runInContext(
      store,
      vm.createContext({ window: win, CustomEvent: class {}, setTimeout: () => 0, clearTimeout: noop, console }),
    );
    const bookings = (win.VamosOps as { bookings: { all: () => Json[] } }).bookings;
    bookings.all();
    await new Promise((resolve) => setImmediate(resolve));
    expect(bookings.all()[0]?.createdAt).toBe("2026-10-04T12:32:07.000Z");
  });
});

describe("Booked formatter: Zurich time, year only when it is not this year", () => {
  const { loaded } = loadBoard();
  const parts = (at: string, now = NOW) => loaded.bookedParts(at, now);

  it("this year: no year", () => {
    expect(parts("2026-10-04T12:32:00.000Z")).toMatchObject({ day: "4", month: "Oct", year: "", time: "14:32" });
  });

  it("another year: the year is added", () => {
    expect(parts("2025-10-04T12:32:00.000Z")).toMatchObject({ day: "4", month: "Oct", year: "2025", time: "14:32" });
  });

  it("converts to Zurich: 22:30 UTC on the 3rd is 00:30 on the 4th in summer (UTC+2)", () => {
    expect(parts("2026-10-03T22:30:00.000Z")).toMatchObject({ day: "4", month: "Oct", time: "00:30" });
  });

  it("converts to Zurich in winter too (UTC+1) and shows midnight as 00, never 24", () => {
    expect(parts("2026-01-15T23:30:00.000Z")).toMatchObject({ day: "16", month: "Jan", time: "00:30" });
    expect(parts("2026-01-15T23:00:00.000Z")).toMatchObject({ day: "16", time: "00:00" });
  });

  it("this year is the Zurich year: 23:30 UTC on 31 Dec is already 1 January in Zurich", () => {
    expect(parts("2025-12-31T23:30:00.000Z", new Date("2026-06-01T10:00:00Z"))).toMatchObject({
      day: "1",
      month: "Jan",
      year: "",
      time: "00:30",
    });
    // "now" is 00:30 on 1 January in Zurich while UTC still says 2025.
    expect(parts("2026-01-01T00:10:00.000Z", new Date("2025-12-31T23:30:00Z"))?.year).toBe("");
    expect(parts("2025-12-31T22:30:00.000Z", new Date("2025-12-31T23:30:00Z"))?.year).toBe("2025");
  });

  it("month tokens are the dictionary's English keys, all twelve, September as Sep", () => {
    const got = Array.from(
      { length: 12 },
      (_, i) => parts(`2026-${String(i + 1).padStart(2, "0")}-15T12:00:00.000Z`)?.month,
    );
    expect(got).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
    const dict = read("app/vamos-i18n-dict.js");
    for (const m of got) expect(dict, String(m)).toMatch(new RegExp(`'${m}': \\{ de:`));
  });

  it("nothing readable gives null: empty, junk, or a time with no zone", () => {
    for (const bad of ["", "junk", "2026-10-04 14:32", null, undefined]) {
      expect(loaded.bookedParts(bad, NOW)).toBeNull();
    }
  });
});

describe("Booked column on the board", () => {
  it("is the first column, ahead of Pickup; every other column and width is as before", () => {
    const cols = loadBoard([]).comp.renderVals().columns;
    expect(cols.map((c) => c.key)).toEqual(["booked", "time", "customer", "route", "vehicle", "driver", "total"]);
    expect(cols.slice(1).map((c) => c.width)).toEqual(["100px", "168px", "148px", "120px", "168px", "112px"]);
    expect(cols[0]?.width).toBe("140px");
  });

  it("the header is Booked, and has its own words in German, French and Arabic", () => {
    const { loaded } = loadBoard();
    expect(loaded.T.en.colBooked).toBe("Booked");
    const seen = new Set<string>();
    for (const lang of LANGS) {
      const word = loaded.T[lang].colBooked;
      expect(word, lang).toBeTruthy();
      expect(seen.has(word as string), `${lang} repeats another language`).toBe(false);
      seen.add(word as string);
      const { comp } = loadBoard([], lang);
      comp.state = { ...comp.state, lang };
      const header = comp.renderVals().columns[0]?.header;
      expect(typeof header === "string" ? header : textOf(header as React.ReactElement)).toBe(word);
    }
  });

  it("reads '4 Oct · 14:32' this year and '4 Oct 2025 · 14:32' for another year", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const render = renderOf();
    expect(textOf(render({ createdAt: "2026-10-04T12:32:00.000Z" }))).toBe("4 Oct · 14:32");
    expect(textOf(render({ createdAt: "2025-10-04T12:32:00.000Z" }))).toBe("4 Oct 2025 · 14:32");
  });

  it("a row with no creation time shows an em dash in the muted style", () => {
    const html = renderToStaticMarkup(renderOf()({ id: "VT-26-0002", createdAt: "" }));
    expect(html).toBe('<span data-vt-quiet="1">—</span>');
  });

  it("day, year and time are left-to-right figures; the month is left to the translator", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const html = renderToStaticMarkup(renderOf()({ createdAt: "2025-10-04T12:32:00.000Z" }));
    expect(html).toContain('<span class="vt-dir-keep" data-vt-no-i18n="1">4</span>');
    expect(html).toContain('<span class="vt-dir-keep" data-vt-no-i18n="1">2025</span>');
    expect(html).toContain('<span class="vt-dir-keep" data-vt-no-i18n="1">14:32</span>');
    // The month sits in its own text node with no skip marker, so the dictionary turns it into Okt / oct / أكتوبر.
    expect(html).toContain(" <span>Oct</span> ");
  });

  it("the full date and time are in the title, Zurich time, isolated for right-to-left tooltips", () => {
    const html = renderToStaticMarkup(renderOf()({ createdAt: "2026-10-03T22:30:00.000Z" }));
    expect(html).toContain('title="⁦2026-10-04 00:30⁩"');
  });

  it("keeps the table's own horizontal scroll and a min-width that fits all seven columns", () => {
    const html = read("app/ops/OpsBoard.dc.html");
    expect(html).toMatch(/\[data-vt-board\]\{min-width:0;overflow-x:auto/);
    const widths = [140, 100, 168, 148, 120, 168, 112].reduce((a, b) => a + b, 0);
    const min = Number(html.match(/\.vt-table\{min-width:(\d+)px/)?.[1]);
    expect(min).toBeGreaterThanOrEqual(widths);
  });
});
