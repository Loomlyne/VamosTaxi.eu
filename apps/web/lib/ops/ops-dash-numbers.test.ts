// apps/web/lib/ops/ops-dash-numbers.test.ts
//
// Quick 261004-ops-dash-numbers. Owner, 2026-10-04 (verbatim): "now i want to fix the dashboard because it
// not reading or calculating anything".
//
// The overview screen (app/ops/OpsDash.dc.html) run against a stub DCLogic, as ops-board-sort.test.ts does:
// no DOM, no network. The rows are the live dashboard of 2026-10-04 (read-only): 25 bookings on the board,
// 16 captured payments for CHF 1,307.32 (one on an erased booking, one a class-change difference), one refund.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const html = readFileSync(join(repoRoot, "app/ops/OpsDash.dc.html"), "utf8");

type Json = Record<string, unknown>;
type Vals = {
  incomeMoney: string;
  expensesMoney: string;
  expensesFoot?: string;
  netMoney: string;
  avgMoney: string;
  subtitle: string;
  counts: Array<{ label: string; value: string }>;
  attention: Array<{ title: string; count: string; href: string }>;
  income: Array<{ label: string; amount: string }>;
  expenses: Array<{ label: string; amount: string }>;
  selectPeriod: (key: string) => void;
};
type Dash = { state: Json; renderVals(): Vals; loadMoney(): void; select(key: string): void };

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
const chf = (n: number) => `CHF ${(n / 100).toFixed(2)}`;

type Fetch = (url: string) => Promise<{ json: () => Promise<unknown> }>;

function loadDash(rows: Json[], opts: { fetch?: Fetch; lang?: string } = {}): Dash {
  const m = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
  if (!m?.[1]) throw new Error("missing script block in OpsDash.dc.html");
  const win = {
    VamosOps: {
      bookings: { all: () => rows, onChange: () => noop },
      chauffeurs: { all: () => [{ id: "c1", status: "off" }], onChange: () => noop },
    },
    VamosLocale: {
      lang: () => opts.lang ?? "en",
      money: (v: unknown) => `CHF ${String(v)}`,
      fromChf: (n: number) => chf(n),
      t: (s: string) => s,
    },
    addEventListener: noop,
    removeEventListener: noop,
  };
  const fetchImpl: Fetch = opts.fetch ?? (() => new Promise(() => undefined));
  const Component = new Function("DCLogic", "window", "fetch", `${m[1]}\nreturn Component;`)(
    StubLogic,
    win,
    fetchImpl,
  ) as new () => Dash;
  const comp = new Component();
  comp.state = { ...comp.state, lang: opts.lang ?? "en" };
  return comp;
}

/** Zurich calendar day, `days` from today, as the screen reckons it. */
function zurichDay(days = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());
  const [y, mo, d] = today.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// The board rows the store holds on live: the erased booking (CHF 100.00) is not among them, and the van
// booking's snapshot total (CHF 106.31) is its fare plus the class-change difference paid later.
const boardRow = (id: string, klass: string, totalRappen: number, capturedAt: string, status = "confirmed"): Json => ({
  id, klass, totalRappen, capturedAt, paid: Boolean(capturedAt), status, dateIso: zurichDay(-40), driver: "",
});
const LIVE_BOARD: Json[] = [
  boardRow("VT-26-0719", "Business", 12000, "2026-09-09T21:03:00.000Z", "cancelled"),
  boardRow("VT-26-0720", "Business", 12000, "2026-09-09T21:45:00.000Z", "cancelled"),
  boardRow("VT-26-0723", "Business", 10810, "2026-09-10T19:53:00.000Z", "completed"),
  boardRow("VT-26-0736", "Business", 8776, "2026-09-28T19:23:00.000Z"),
  boardRow("VT-26-0737", "Economy", 8658, "2026-09-28T19:42:00.000Z"),
  boardRow("VT-26-0738", "Economy", 6190, "2026-09-29T10:36:00.000Z"),
  boardRow("VT-26-0739", "Van luxury", 12837, "2026-09-29T12:10:00.000Z"),
  boardRow("VT-26-0742", "Economy", 2554, "2026-09-29T12:22:00.000Z"),
  boardRow("VT-26-0743", "Economy", 9294, "2026-09-29T13:15:00.000Z"),
  boardRow("VT-26-0746", "Economy", 3556, "2026-09-30T10:24:00.000Z", "cancelled"),
  boardRow("VT-26-0747", "Economy", 3408, "2026-09-30T12:29:00.000Z"),
  boardRow("VT-26-0750", "Van luxury", 10631, "2026-10-01T23:09:00.000Z"),
  boardRow("VT-26-0752", "Business", 9979, "2026-10-03T17:19:00.000Z"),
  boardRow("VT-26-0753", "Business", 10039, "2026-10-04T16:34:00.000Z"),
];

// GET /api/staff/dashboard?period=all on live, as the fixed server answers it.
const LIVE_ALL_MONEY = {
  period: "all",
  incomeRappen: 130732,
  refundRappen: 3556,
  feeRappen: 0,
  fareCount: 15,
  byClass: [
    { klass: "Economy", rappen: 33660 },
    { klass: "Business", rappen: 73604 },
    { klass: "Van luxury", rappen: 23468 },
  ],
  refunds: [{ customer: "Rider", booking: "VT-26-0746", amountRappen: 3556 }],
};

const count = (v: Vals, label: string) => v.counts.find((c) => c.label === label)?.value;

describe("money tiles read the server's captured payments", () => {
  it("Average fare is income over the server's fare count (live all time: CHF 87.15, not CHF 93.38)", () => {
    const dash = loadDash(LIVE_BOARD);
    dash.state = { ...dash.state, period: "all", money: LIVE_ALL_MONEY };
    const v = dash.renderVals();
    expect(v.incomeMoney).toBe("CHF 1307.32");
    expect(v.avgMoney).toBe("CHF 87.15");
    expect(v.netMoney).toBe("CHF 1271.76");
  });

  it("the Money in class lines are the server's split and add up to Income", () => {
    const dash = loadDash(LIVE_BOARD);
    dash.state = { ...dash.state, period: "all", money: LIVE_ALL_MONEY };
    const v = dash.renderVals();
    expect(v.income).toEqual([
      { label: "Economy", amount: "CHF 336.60" },
      { label: "Business", amount: "CHF 736.04" },
      { label: "Van luxury", amount: "CHF 234.68" },
    ]);
  });

  it("before the stores fill, every money tile still reads the server (nothing waits on the board's rows)", () => {
    const dash = loadDash([]);
    dash.state = { ...dash.state, period: "all", money: LIVE_ALL_MONEY };
    const v = dash.renderVals();
    expect(v.avgMoney).toBe("CHF 87.15");
    expect(v.income.map((l) => l.amount)).toEqual(["CHF 336.60", "CHF 736.04", "CHF 234.68"]);
  });

  it("the Expenses foot says what is in it once there is something", () => {
    const dash = loadDash(LIVE_BOARD);
    dash.state = { ...dash.state, period: "all", money: LIVE_ALL_MONEY };
    expect(dash.renderVals().expensesMoney).toBe("CHF 35.56");
    expect(dash.renderVals().expensesFoot).toBe("Refunds and fees");
    dash.state = { ...dash.state, money: { ...LIVE_ALL_MONEY, refundRappen: 0, refunds: [] } };
    expect(dash.renderVals().expensesFoot).toBe("None recorded");
    expect(html).toMatch(/\{\{ expensesFoot \}\}/);
    expect(html).not.toMatch(/var\(--vt-text-muted\)">None recorded<\/span>/);
  });
});

describe("Pickups counts trips that will run", () => {
  it("an unpaid checkout left open is not a pickup; a cancelled trip is not either", () => {
    const row = (id: string, paid: boolean, status: string): Json => ({
      id, paid, status, capturedAt: paid ? "2026-10-01T10:00:00.000Z" : "", dateIso: zurichDay(-2), klass: "Economy", driver: "",
    });
    const dash = loadDash([
      row("paid-1", true, "confirmed"),
      row("paid-2", true, "completed"),
      row("unpaid", false, "pending"),
      row("gone", true, "cancelled"),
    ]);
    dash.state = { ...dash.state, period: "week", money: null };
    expect(count(dash.renderVals(), "Pickups")).toBe("2");
  });
});

// Owner answers, .planning/decisions/2026-10-04-dashboard-numbers.md (question form, 2026-10-04).
const HOUR = 3600 * 1000;
/** A booking made `bookedDaysAgo` Zurich days ago (noon UTC), with its pickup `pickupInHours` from now. */
function trip(id: string, over: Json & { bookedDaysAgo?: number; pickupInHours?: number } = {}): Json {
  const { bookedDaysAgo = 20, pickupInHours = 48, ...rest } = over;
  const pickup = new Date(Date.now() + pickupInHours * HOUR);
  return {
    id, klass: "Business", status: "confirmed", paid: true, capturedAt: "2026-09-01T10:00:00.000Z", driver: "",
    payLinkSent: false, pendingEditId: "",
    createdAt: `${zurichDay(-bookedDaysAgo)}T10:00:00.000Z`,
    pickupAt: pickup.toISOString(),
    dateIso: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(pickup),
    ...rest,
  };
}
const attentionCount = (v: Vals, title: string) => v.attention.find((a) => a.title === title)?.count;

describe("Bookings counts the bookings made in the period (owner answer 1)", () => {
  // Live on 4 Oct: VT-26-0753 booked today with its pickup on 15 Oct; Today read 0 by pickup day.
  const rows = [
    trip("booked-today", { bookedDaysAgo: 0, pickupInHours: 24 * 11 }),
    trip("booked-3-days-ago", { bookedDaysAgo: 3, pickupInHours: -24 * 2, status: "completed" }),
    trip("booked-12-days-ago", { bookedDaysAgo: 12, pickupInHours: 2, paid: false, capturedAt: "", status: "cancelled" }),
    trip("booked-60-days-ago", { bookedDaysAgo: 60, pickupInHours: 0.5 }),
  ];
  const bookingsFor = (period: string) => {
    const dash = loadDash(rows);
    dash.state = { ...dash.state, period, money: null };
    return count(dash.renderVals(), "Bookings");
  };
  it("by the Zurich day it was booked, whatever its pickup day or status", () => {
    expect(bookingsFor("today")).toBe("1");
    expect(bookingsFor("week")).toBe("2");
    expect(bookingsFor("month")).toBe("3");
    expect(bookingsFor("all")).toBe("4");
  });
});
