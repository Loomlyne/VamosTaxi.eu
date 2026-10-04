// apps/web/lib/ops/ops-board-sort.test.ts
//
// Quick 261004-ops-board-sort, owner 2026-10-04 (verbatim): "the table i want it to be the newest created
// booking to the oldest i wanna be able to change the from just clicking on booked title it will flip from
// newest-oldest to oldest-newest as well for vehicle by class type, and driver by assigned or not assigned,
// and total to biggest to smallest".
//
// The dashboard bookings table opens newest booked first. Booked, Vehicle, Driver and Total are real header
// buttons; the first click on a header sorts one way, the next click on the same header flips it. No DOM, no
// network: the script block of OpsBoard.dc.html runs against a stub DCLogic (as ops-board-booked.test.ts does).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
const html = read("app/ops/OpsBoard.dc.html");

type Json = Record<string, unknown>;
const LANGS = ["en", "de", "fr", "ar"] as const;
type Lang = (typeof LANGS)[number];
type Dir = "asc" | "desc";

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

type Header = React.ReactElement<{
  "aria-label"?: string;
  "data-active"?: string;
  "data-vt-sort"?: string;
  onClick: () => void;
  ref: (el: unknown) => void;
}>;
type Column = { key: string; header: string | Header; render?: (row: Json) => React.ReactElement };
type BoardComp = {
  state: Json;
  setState: (patch: Json | ((s: Json) => Json)) => void;
  renderVals(): {
    columns: Column[];
    pageRows: Json[];
    tShowing: string;
    statCards: Array<{ select: () => void }>;
    setBoardFilter: (v: string) => void;
    clearFilt: () => void;
  };
};
type Loaded = {
  Component: new () => BoardComp;
  T: Record<Lang, Record<string, string>>;
  SORT_FIRST: Record<string, Dir>;
  nextSort: (cur: { key: string; dir: Dir } | null, key: string) => { key: string; dir: Dir };
  sortBoardRows: (rows: Json[], key: string, dir: Dir, classOrder?: string[]) => Json[];
};

const CLASSES = ["Economy", "Business", "Van luxury"];

/** A stand-in for the design-system Icon: it only records which file the arrow asks for. */
const Icon = (p: { name: string }) => React.createElement("i", { "data-icon": p.name });

function loadBoard(rows: Json[] = [], lang: Lang = "en", classes: string[] = CLASSES): { comp: BoardComp; loaded: Loaded } {
  const m = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
  if (!m?.[1]) throw new Error("missing script block in OpsBoard.dc.html");
  const win = {
    VamosOps: {
      bookings: { all: () => rows, onChange: () => noop },
      VEHICLE_CLASSES: classes,
      BOOKING_STATUS: ["pending", "confirmed"],
      chauffeurs: { all: () => [] },
    },
    VamosLocale: { lang: () => lang, cur: () => "CHF", money: (v: unknown) => `CHF ${String(v)}` },
    addEventListener: noop,
    removeEventListener: noop,
    VamosTaxiDesignSystem_245af1: { Icon },
  };
  const loaded = new Function(
    "DCLogic", "React", "window", "location", "sessionStorage", "document", "history",
    `${m[1]}\nreturn { Component, T, SORT_FIRST, nextSort, sortBoardRows };`,
  )(StubLogic, React, win, { search: "" }, { getItem: () => null, removeItem: noop }, {}, {}) as Loaded;
  return { comp: new loaded.Component(), loaded };
}

/** The board's sort, alone. */
const { loaded: pure } = loadBoard();
const sort = (rows: Json[], key: string, dir: Dir, classes: string[] = CLASSES) =>
  pure.sortBoardRows(rows, key, dir, classes).map((r) => r.id);

// Seven bookings, listed in the server's order (pickup time, newest first), NOT in booked order.
//   id: booked (UTC) / class / driver / total in rappen
const row = (id: string, createdAt: string, klass: string, driver: string, totalRappen: number, paid = true): Json => ({
  id, createdAt, klass, driver, totalRappen, paid, status: "confirmed", customer: id, pax: 2, bags: 1,
});
const SERVER_ORDER: Json[] = [
  row("D", "2026-06-02T09:10:00.000Z", "Van luxury", "", 600),
  row("F", "2025-12-18T09:20:00.000Z", "Van luxury", "Sofia Ricci", 400),
  row("G", "2025-03-07T14:05:00.000Z", "Economy", "Marco Bianchi", 100),
  row("A", "2026-10-04T12:32:00.000Z", "Economy", "", 300),
  row("B", "2026-10-03T22:30:00.000Z", "Economy", "Marco Bianchi", 100),
  row("C", "2026-09-29T07:05:00.000Z", "Business", "Sofia Ricci", 200),
  row("E", "2026-01-15T23:30:00.000Z", "Business", "Marco Bianchi", 200),
];
const ids = (rows: Json[]) => rows.map((r) => r.id);

/** What the board shows (page 1) after the given clicks, by header key. */
function boardAfter(clicks: string[], rows: Json[] = SERVER_ORDER, lang: Lang = "en") {
  const { comp } = loadBoard(rows, lang);
  for (const key of clicks) {
    const col = comp.renderVals().columns.find((c) => c.key === key);
    if (!col || typeof col.header === "string") throw new Error(`${key} has no sort button`);
    col.header.props.onClick();
  }
  return comp;
}
const shown = (comp: BoardComp) => ids(comp.renderVals().pageRows);

describe("the board opens newest booked first", () => {
  it("default order is createdAt newest to oldest, whatever order the server sent", () => {
    const { comp } = loadBoard(SERVER_ORDER);
    expect(shown(comp)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(comp.state.sortKey).toBe("booked");
    expect(comp.state.sortDir).toBe("desc");
  });

  it("nothing is remembered across a reload: a fresh board is newest first again", () => {
    expect(shown(boardAfter(["total", "total", "driver"]))).not.toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(shown(loadBoard(SERVER_ORDER).comp)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(html).not.toMatch(/(?:local|session)Storage[^;\n]*sort/i);
    expect(html).not.toMatch(/sort[^;\n]*(?:local|session)Storage/i);
  });
});

describe("Booked: newest to oldest first, then oldest to newest", () => {
  it("sorts by the booking time, not by the pickup time", () => {
    expect(sort(SERVER_ORDER, "booked", "desc")).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(sort(SERVER_ORDER, "booked", "asc")).toEqual(["G", "F", "E", "D", "C", "B", "A"]);
  });

  it("a click on the active Booked header flips it, a second click flips back", () => {
    expect(shown(boardAfter(["booked"]))).toEqual(["G", "F", "E", "D", "C", "B", "A"]);
    expect(shown(boardAfter(["booked", "booked"]))).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });

  it("compares the instant, not the text: +02:00 and Z forms mix correctly", () => {
    const rows = [
      row("late", "2026-10-04T14:00:00+02:00", "Economy", "", 100), // 12:00Z
      row("early", "2026-10-04T11:30:00Z", "Economy", "", 100),
    ];
    expect(sort(rows, "booked", "desc")).toEqual(["late", "early"]);
  });
});

describe("Total: biggest to smallest first, then the flip", () => {
  it("first click is biggest first; equal totals keep newest booked first", () => {
    expect(shown(boardAfter(["total"]))).toEqual(["D", "F", "A", "C", "E", "B", "G"]);
  });

  it("flip is smallest first; equal totals still keep newest booked first", () => {
    expect(shown(boardAfter(["total", "total"]))).toEqual(["B", "G", "C", "E", "A", "F", "D"]);
  });
});

describe("Driver: not assigned first, then assigned", () => {
  it("first click puts the rows with no driver first; both groups keep newest booked first", () => {
    expect(shown(boardAfter(["driver"]))).toEqual(["A", "D", "B", "C", "E", "F", "G"]);
  });

  it("flip puts the assigned rows first", () => {
    expect(shown(boardAfter(["driver", "driver"]))).toEqual(["B", "C", "E", "F", "G", "A", "D"]);
  });

  it("assigned rows are not ordered by the driver's name", () => {
    const rows = [
      row("z-newer", "2026-10-04T10:00:00.000Z", "Economy", "Zed Zimmer", 100),
      row("a-older", "2026-10-03T10:00:00.000Z", "Economy", "Anna Aebi", 100),
    ];
    expect(sort(rows, "driver", "asc")).toEqual(["z-newer", "a-older"]);
  });
});

describe("Vehicle: class order, then the reverse", () => {
  it("first click is the dashboard's class order; inside a class, newest booked first", () => {
    expect(shown(boardAfter(["vehicle"]))).toEqual(["A", "B", "G", "C", "E", "D", "F"]);
  });

  it("flip is the reverse class order; inside a class, still newest booked first", () => {
    expect(shown(boardAfter(["vehicle", "vehicle"]))).toEqual(["D", "F", "C", "E", "A", "B", "G"]);
  });

  it("the order comes from the class list the dashboard hands over, not from names in the sort", () => {
    const rows = [
      row("m", "2026-10-04T10:00:00.000Z", "Mid", "", 100),
      row("a", "2026-10-03T10:00:00.000Z", "Alpha", "", 100),
      row("z", "2026-10-02T10:00:00.000Z", "Zeta", "", 100),
      row("u", "2026-10-01T10:00:00.000Z", "Unlisted", "", 100),
    ];
    // Zeta, Alpha, Mid listed in that order; Unlisted is not in the list.
    expect(sort(rows, "vehicle", "asc", ["Zeta", "Alpha", "Mid"])).toEqual(["z", "a", "m", "u"]);
    expect(sort(rows, "vehicle", "desc", ["Zeta", "Alpha", "Mid"])).toEqual(["m", "a", "z", "u"]);
    // The board hands over VamosOps.VEHICLE_CLASSES: another list, another order.
    const { comp } = loadBoard(rows, "en", ["Zeta", "Alpha", "Mid"]);
    const col = comp.renderVals().columns.find((c) => c.key === "vehicle");
    (col?.header as Header).props.onClick();
    expect(shown(comp)).toEqual(["z", "a", "m", "u"]);
  });

  it("the sort function names no vehicle class", () => {
    const fn = html.slice(html.indexOf("function sortBoardRows"), html.indexOf("function markSort"));
    expect(fn.length).toBeGreaterThan(300);
    expect(fn).not.toMatch(/Economy|Business|Van luxury/);
  });

  it("with no class list at all, no class is known: every row is unknown and the order is newest booked first", () => {
    expect(pure.sortBoardRows(SERVER_ORDER, "vehicle", "asc", undefined).map((r) => r.id)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });
});

describe("missing values go last, in both directions", () => {
  const rows = [
    row("old", "2026-01-01T10:00:00.000Z", "Economy", "Anna", 100),
    row("none", "", "", "", 0),
    row("new", "2026-10-01T10:00:00.000Z", "Business", "Beat", 300),
  ];
  it("no booking time", () => {
    expect(sort(rows, "booked", "desc")).toEqual(["new", "old", "none"]);
    expect(sort(rows, "booked", "asc")).toEqual(["old", "new", "none"]);
  });
  it("a booking time with no zone is not read, so it counts as missing", () => {
    const odd = [row("odd", "2026-10-04 14:32", "Economy", "", 100), ...rows.slice(0, 1)];
    expect(sort(odd, "booked", "desc")).toEqual(["old", "odd"]);
    expect(sort(odd, "booked", "asc")).toEqual(["old", "odd"]);
  });
  it("no total (shown as CHF 000)", () => {
    expect(sort(rows, "total", "desc")).toEqual(["new", "old", "none"]);
    expect(sort(rows, "total", "asc")).toEqual(["old", "new", "none"]);
  });
  it("no class, and a class the dashboard does not list", () => {
    const withUnknown = [...rows, row("odd", "2026-05-01T10:00:00.000Z", "Gold", "", 100)];
    expect(sort(withUnknown, "vehicle", "asc")).toEqual(["old", "new", "odd", "none"]);
    expect(sort(withUnknown, "vehicle", "desc")).toEqual(["new", "old", "odd", "none"]);
  });
  it("rows that are equal in every way keep the order they came in", () => {
    const twins = [row("t1", "2026-10-01T10:00:00.000Z", "Economy", "", 100), row("t2", "2026-10-01T10:00:00.000Z", "Economy", "", 100)];
    expect(sort(twins, "total", "desc")).toEqual(["t1", "t2"]);
    expect(sort(twins, "total", "asc")).toEqual(["t1", "t2"]);
  });
  it("does not change the list it was given", () => {
    const copy = JSON.stringify(SERVER_ORDER);
    pure.sortBoardRows(SERVER_ORDER, "total", "desc", CLASSES);
    expect(JSON.stringify(SERVER_ORDER)).toBe(copy);
  });
});

describe("clicks: one active sort, first direction per header, flip on the active one", () => {
  it("first directions", () => {
    expect(pure.SORT_FIRST).toEqual({ booked: "desc", vehicle: "asc", driver: "asc", total: "desc" });
  });

  it("nextSort: another header starts in its own first direction; the active one flips", () => {
    expect(pure.nextSort({ key: "booked", dir: "desc" }, "total")).toEqual({ key: "total", dir: "desc" });
    expect(pure.nextSort({ key: "booked", dir: "desc" }, "driver")).toEqual({ key: "driver", dir: "asc" });
    expect(pure.nextSort({ key: "total", dir: "desc" }, "total")).toEqual({ key: "total", dir: "asc" });
    expect(pure.nextSort({ key: "total", dir: "asc" }, "total")).toEqual({ key: "total", dir: "desc" });
    expect(pure.nextSort({ key: "vehicle", dir: "asc" }, "vehicle")).toEqual({ key: "vehicle", dir: "desc" });
  });

  it("a flipped header that loses the sort starts from its first direction again", () => {
    // Booked flipped (oldest first), then Total, then Booked again: newest first, not oldest first.
    expect(shown(boardAfter(["booked", "total", "booked"]))).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });

  it("only Booked, Vehicle, Driver and Total are buttons; Pickup, Customer and Route stay plain words", () => {
    const cols = loadBoard().comp.renderVals().columns;
    expect(cols.map((c) => [c.key, typeof c.header === "string"])).toEqual([
      ["booked", false], ["time", true], ["customer", true], ["route", true], ["vehicle", false], ["driver", false], ["total", false],
    ]);
  });

  it("the sort changes the table, not the table's paging basis: a sort click goes back to page 1", () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      row(`r${String(i).padStart(2, "0")}`, `2026-09-${String(1 + (i % 28)).padStart(2, "0")}T10:00:00.000Z`, "Economy", "", 100 + i));
    const { comp } = loadBoard(many);
    comp.setState({ page: 2 });
    expect(comp.renderVals().tShowing).toContain("41");
    const col = comp.renderVals().columns.find((c) => c.key === "total");
    (col?.header as Header).props.onClick();
    expect(comp.state.page).toBe(0);
    expect(comp.renderVals().pageRows).toHaveLength(20);
    expect(comp.renderVals().pageRows[0]?.totalRappen).toBe(144); // biggest first
  });
});

describe("the sort applies inside the chosen filter and survives switching filters", () => {
  const board = () => {
    const rows = [
      ...SERVER_ORDER,
      { ...row("U", "2026-10-02T10:00:00.000Z", "Business", "", 150, false), status: "pending" },
    ];
    return boardAfter(["total"], rows);
  };
  // The filters the page offers: the three stat cards (Today, Awaiting payment, Unassigned), the Filter menu, Clear.
  const card = (comp: BoardComp, i: number) => comp.renderVals().statCards[i]?.select();
  const UNASSIGNED = 2;
  const AWAITING = 1;

  it("All shows paid trips only, in the sorted order", () => {
    expect(shown(board())).toEqual(["D", "F", "A", "C", "E", "B", "G"]);
  });

  it("Unassigned card: only the unassigned paid trips, still biggest total first", () => {
    const comp = board();
    card(comp, UNASSIGNED);
    expect(comp.state.filter).toBe("Unassigned");
    expect(shown(comp)).toEqual(["D", "A"]);
    expect(comp.state.sortKey).toBe("total");
  });

  it("Awaiting payment card, then All from the Filter menu: the sort has not moved", () => {
    const comp = board();
    card(comp, AWAITING);
    expect(shown(comp)).toEqual(["U"]);
    comp.renderVals().setBoardFilter("All");
    expect(shown(comp)).toEqual(["D", "F", "A", "C", "E", "B", "G"]);
  });

  it("Clear filters leaves the sort alone", () => {
    const comp = board();
    card(comp, UNASSIGNED);
    comp.renderVals().clearFilt();
    expect(comp.state.filter).toBe("All");
    expect(shown(comp)).toEqual(["D", "F", "A", "C", "E", "B", "G"]);
  });

  it("a flip made inside a filter holds when the filter changes", () => {
    const comp = board();
    card(comp, UNASSIGNED);
    (comp.renderVals().columns.find((c) => c.key === "total")?.header as Header).props.onClick();
    expect(shown(comp)).toEqual(["A", "D"]);
    comp.renderVals().setBoardFilter("All");
    expect(shown(comp)).toEqual(["B", "G", "C", "E", "A", "F", "D"]);
  });

  it("the class filter narrows the rows and the sort orders what is left", () => {
    const comp = boardAfter(["total", "total"]);
    comp.setState({ klass: "Economy", page: 0 });
    expect(shown(comp)).toEqual(["B", "G", "A"]);
  });
});

describe("header buttons: aria-sort, arrow, name, state", () => {
  type FakeTh = { attrs: Record<string, string>; setAttribute: (k: string, v: string) => void; removeAttribute: (k: string) => void };
  const fakeTh = (): FakeTh => {
    const th: FakeTh = {
      attrs: {},
      setAttribute: (k, v) => { th.attrs[k] = v; },
      removeAttribute: (k) => { delete th.attrs[k]; },
    };
    return th;
  };
  /** Mounts every header the way React does: the ref gets the button, the button sits in its own <th>. */
  function mount(comp: BoardComp) {
    const ths: Record<string, FakeTh> = {};
    for (const c of comp.renderVals().columns) {
      const th = fakeTh();
      ths[c.key] = th;
      if (typeof c.header !== "string") c.header.props.ref({ closest: (sel: string) => (sel === "th" ? th : null) });
    }
    return ths;
  }
  const ariaSorts = (ths: Record<string, FakeTh>) => Object.fromEntries(Object.entries(ths).map(([k, t]) => [k, t.attrs["aria-sort"] ?? null]));

  it("default: aria-sort descending on Booked, nothing on the others", () => {
    expect(ariaSorts(mount(loadBoard(SERVER_ORDER).comp))).toEqual({
      booked: "descending", time: null, customer: null, route: null, vehicle: null, driver: null, total: null,
    });
  });

  it("each header: aria-sort after its first click and after the flip, and no other column carries one", () => {
    const cases: Array<[string, string, string]> = [
      ["booked", "descending", "ascending"],
      ["total", "descending", "ascending"],
      ["driver", "ascending", "descending"],
      ["vehicle", "ascending", "descending"],
    ];
    for (const [key, first, flipped] of cases) {
      // Booked is already on its first direction when the board opens; the others need one click.
      const afterFirst = key === "booked" ? loadBoard(SERVER_ORDER).comp : boardAfter([key]);
      const afterFlip = key === "booked" ? boardAfter(["booked"]) : boardAfter([key, key]);
      for (const [label, comp, want] of [["first", afterFirst, first], ["flip", afterFlip, flipped]] as const) {
        const got = ariaSorts(mount(comp));
        expect(got[key], `${key} ${label}`).toBe(want);
        expect(Object.entries(got).filter(([, v]) => v).map(([k]) => k), `${key} ${label}: one active sort`).toEqual([key]);
      }
    }
  });

  it("a header that loses the sort has its aria-sort removed from the cell", () => {
    const { comp } = loadBoard(SERVER_ORDER);
    const th = fakeTh();
    const booked = () => comp.renderVals().columns[0]?.header as Header;
    booked().props.ref({ closest: () => th });
    expect(th.attrs["aria-sort"]).toBe("descending");
    (comp.renderVals().columns.find((c) => c.key === "total")?.header as Header).props.onClick();
    booked().props.ref({ closest: () => th });
    expect(th.attrs["aria-sort"]).toBeUndefined();
  });

  it("the ref tolerates no element (React passes null on unmount)", () => {
    const h = loadBoard(SERVER_ORDER).comp.renderVals().columns[0]?.header as Header;
    expect(() => h.props.ref(null)).not.toThrow();
    expect(() => h.props.ref({ closest: () => null })).not.toThrow();
  });

  it("the active header has data-active; the others do not", () => {
    const { comp } = loadBoard(SERVER_ORDER);
    const active = comp.renderVals().columns.flatMap((c) => (typeof c.header !== "string" && c.header.props["data-active"] ? [c.key] : []));
    expect(active).toEqual(["booked"]);
  });

  const arrows = (comp: BoardComp) =>
    Object.fromEntries(
      comp.renderVals().columns.flatMap((c) =>
        typeof c.header === "string" ? [] : [[c.key, renderToStaticMarkup(c.header).match(/data-icon="(arrow-[a-z]+)"/)?.[1] ?? null]],
      ),
    );

  it("arrow: the active header shows the way it sorts now, the others the way a click would sort", () => {
    expect(arrows(loadBoard(SERVER_ORDER).comp)).toEqual({ booked: "arrow-down", vehicle: "arrow-up", driver: "arrow-up", total: "arrow-down" });
    expect(arrows(boardAfter(["booked"]))).toEqual({ booked: "arrow-up", vehicle: "arrow-up", driver: "arrow-up", total: "arrow-down" });
    expect(arrows(boardAfter(["total"]))).toEqual({ booked: "arrow-down", vehicle: "arrow-up", driver: "arrow-up", total: "arrow-down" });
    expect(arrows(boardAfter(["total", "total"]))).toEqual({ booked: "arrow-down", vehicle: "arrow-up", driver: "arrow-up", total: "arrow-up" });
    expect(arrows(boardAfter(["vehicle", "vehicle"]))).toEqual({ booked: "arrow-down", vehicle: "arrow-down", driver: "arrow-up", total: "arrow-down" });
  });

  it("arrows come from the vendored Lucide pair, through Icon, never drawn", () => {
    const fn = html.slice(html.indexOf("const sortHead"), html.indexOf("return {\n      n18"));
    expect(fn).toContain("'arrow-up'");
    expect(fn).toContain("'arrow-down'");
    expect(fn).not.toMatch(/<svg|createElement\('svg'|→|↑|↓/);
  });

  it("each header is a type=button with an accessible name in every language that contains the visible word", () => {
    const names = new Set<string>();
    for (const lang of LANGS) {
      const { comp, loaded } = loadBoard(SERVER_ORDER, lang);
      comp.state = { ...comp.state, lang };
      const wordOf: Record<string, string> = { booked: "colBooked", vehicle: "colVehicle", driver: "colDriver", total: "colTotal" };
      for (const c of comp.renderVals().columns) {
        if (typeof c.header === "string") continue;
        const word = loaded.T[lang][wordOf[c.key] as string] as string;
        const name = c.header.props["aria-label"] as string;
        expect(name, `${lang} ${c.key}`).toBe(loaded.T[lang].sortBy?.replace("%s", word));
        expect(name).toContain(word);
        expect((c.header.props as { type?: string }).type).toBe("button");
        expect(renderToStaticMarkup(c.header)).toContain(`<span>${word}</span>`);
        names.add(`${lang}|${name}`);
      }
    }
    expect(names.size).toBe(16);
  });

  it("the sort phrase has its own words in German, French and Arabic, and German keeps ss", () => {
    const { loaded } = loadBoard();
    expect(loaded.T.en.sortBy).toBe("Sort by %s");
    const seen = new Set<string>();
    for (const lang of LANGS) {
      const s = loaded.T[lang].sortBy as string;
      expect(s, lang).toContain("%s");
      expect(seen.has(s), `${lang} repeats another language`).toBe(false);
      seen.add(s);
    }
    expect(loaded.T.de.sortBy).not.toContain("ß");
  });

  it("the button text is the header word in the page's language (de, fr, ar)", () => {
    for (const lang of ["de", "fr", "ar"] as const) {
      const { comp, loaded } = loadBoard(SERVER_ORDER, lang);
      comp.state = { ...comp.state, lang };
      const h = comp.renderVals().columns[0]?.header as Header;
      expect(renderToStaticMarkup(h).replace(/<[^>]*>/g, "")).toBe(loaded.T[lang].colBooked);
      expect(renderToStaticMarkup(h)).not.toContain("Booked");
    }
  });
});

describe("header look (source pins)", () => {
  const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));

  it("a real button: 44 px target, start-aligned on the reading direction (logical properties only)", () => {
    expect(css).toMatch(/\[data-vt-sort\]\{[^}]*min-block-size:44px/);
    expect(css).toMatch(/\[data-vt-sort\]\{[^}]*padding-inline:16px/);
    expect(css).toMatch(/\[data-vt-sort\]\{[^}]*justify-content:flex-start/);
    const rule = css.match(/\[data-vt-sort\]\{[^}]*\}/)?.[0] ?? "";
    expect(rule).not.toMatch(/\b(?:left|right|margin-left|margin-right|padding-left|padding-right|text-align)\b/);
  });

  it("the cell hands its padding to the button, so the whole cell is the target", () => {
    expect(css).toMatch(/th:has\(\[data-vt-sort\]\)\{padding:0\}/);
  });

  it("focus shows the design-system ring (inside the cell, so the scroll box cannot clip it); no glow, no tint", () => {
    expect(css).toMatch(/\[data-vt-sort\]:focus-visible\{box-shadow:inset var\(--vt-ring\)\}/);
    expect(css).not.toMatch(/\[data-vt-sort\][^{]*\{[^}]*(?:--vt-shadow-accent|yellow-(?:50|100|200|300|600|700)|rgb\()/);
  });

  it("an inactive arrow stays out of sight until hover or focus, but is always shown where there is no hover", () => {
    expect(css).toMatch(/\[data-vt-sort-ico\]\{[^}]*opacity:0\}/);
    // Hover, keyboard focus and the active header all show the arrow (one rule, so none of the three can drop out).
    expect(css).toMatch(
      /\[data-vt-sort\]:hover \[data-vt-sort-ico\],\[data-vt-sort\]:focus-visible \[data-vt-sort-ico\],\[data-vt-sort\]\[data-active\] \[data-vt-sort-ico\]\{opacity:1\}/,
    );
    expect(css).toMatch(/@media \(hover:none\)\{\[data-vt-sort-ico\]\{opacity:1\}\}/);
  });

  it("the buttons' words come from the page's own language tables, so the translator leaves them alone", () => {
    expect(html).toMatch(/'data-vt-no-i18n': '1',\n\s+'aria-label': t\.sortBy/);
  });

  it("the design-system Table is not touched: it has no sort props, so the header button is the sort control", () => {
    const bundle = read("design-system/_ds_bundle.js");
    const table = bundle.slice(bundle.indexOf("function Table({"), bundle.indexOf("Object.assign(__ds_scope, { Table });"));
    expect(table).not.toMatch(/sortable|onSort|sortKey|aria-sort/);
    expect(html).toMatch(/header: sortHead\('booked'/);
  });
});
