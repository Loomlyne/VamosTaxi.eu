// apps/web/lib/ops/dashboard-money.test.ts
//
// Quick 261004-ops-dash-numbers. Owner, 2026-10-04 (verbatim): "now i want to fix the dashboard because it
// not reading or calculating anything".
//
// GET /api/staff/dashboard (loadDashboardMoney). Two faults found against live-shaped rows:
//  1. The period started at `${ymd}::date at time zone 'Europe/Zurich'`: a date turned into a Zurich wall
//     clock and read back in the session zone (UTC on Supabase), so "Today" began at 02:00 UTC, 04:00 in
//     Zurich. A fare captured between midnight and 04:00 was left out of Today, 7 days and 30 days.
//  2. The average fare and the "Money in" class lines were worked out in the browser from the board's rows,
//     which leave out an erased booking and fold a class-change difference into the first capture date. On
//     live (16 captures, 130732 rappen) 30 days read 9338 rappen a fare and the class lines summed 120732 rappen.
// The server now returns the fare count and the class split from the same captured payments as Income.
// No database: asStaff is replaced by a recorder that answers each statement with live-shaped rows.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db: { texts: string[]; values: unknown[][]; classRows: Row[]; refund: number; lines: Row[] } = {
  texts: [],
  values: [],
  classRows: [],
  refund: 0,
  lines: [],
};

vi.mock("@/lib/db/identity", () => ({
  asStaff: async (_env: unknown, _claims: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      db.texts.push(text);
      db.values.push(values);
      if (/from paid/.test(text)) return db.classRows;
      if (/sum\(r\.refund_rappen\)/.test(text)) return [{ refund_rappen: db.refund }];
      if (/b\.contact_name as customer/.test(text)) return db.lines;
      throw new Error(`unexpected statement: ${text.slice(0, 80)}`);
    };
    return fn(tx);
  },
}));

const { loadDashboardMoney, periodStartUtc, zurichMidnightUtc, moneyClassLines } = await import("./bookings");

const env = {} as CloudflareEnv;
const claims = { sub: "staff", role: "authenticated" } as const;
// 2026-10-04 18:34 in Zurich: the minute VT-26-0753 was paid on live.
const NOW = new Date("2026-10-04T16:34:00.000Z");

// Live, read-only, 2026-10-04 ~21:25 +04: every vehicle_classes row (price-book order: sort_order, slug) with
// its captured income. Active and not hidden = live. U10 (2026-10-05): the query returns all of them.
const CLASS_ROWS = (income: Record<string, [number, number, number]> = {}): Row[] =>
  [
    { class_slug: "mahaha", class_name: "mahaha", sort_order: 0, live: false },
    { class_slug: "saden", class_name: "Economy", sort_order: 0, live: true },
    { class_slug: "economy", class_name: "Economy", sort_order: 1, live: false },
    { class_slug: "business", class_name: "Business", sort_order: 2, live: false },
    { class_slug: "first", class_name: "First", sort_order: 3, live: false },
    { class_slug: "van", class_name: "Van", sort_order: 4, live: false },
    { class_slug: "mercedes-benz-v-class", class_name: "Business", sort_order: 10, live: true },
    { class_slug: "van-luxury", class_name: "Van luxury", sort_order: 20, live: true },
  ].map((row) => {
    const [income_rappen, fee_rappen, fare_count] = income[row.class_slug] ?? [0, 0, 0];
    return { ...row, income_rappen, fee_rappen, fare_count };
  });

const LIVE_ALL_TIME: Row[] = CLASS_ROWS({
  business: [44810, 0, 4],
  "mercedes-benz-v-class": [28794, 0, 3],
  saden: [33660, 0, 6],
  // 9447 + the class-change difference 1184: two payments, one fare.
  "van-luxury": [23468, 0, 2],
});

beforeEach(() => {
  db.texts = [];
  db.values = [];
  db.classRows = [];
  db.refund = 0;
  db.lines = [];
});

describe("Zurich midnight as a UTC instant", () => {
  it("summer and winter days start at Zurich midnight, not at 02:00 UTC", () => {
    expect(zurichMidnightUtc("2026-10-04")).toBe("2026-10-03T22:00:00.000Z");
    expect(zurichMidnightUtc("2026-01-15")).toBe("2026-01-14T23:00:00.000Z");
    expect(zurichMidnightUtc("2026-07-01")).toBe("2026-06-30T22:00:00.000Z");
  });

  it("the two clock-change days still start at their own midnight", () => {
    // Clocks go forward 2026-03-29 02:00 and back 2026-10-25 03:00; midnight is before either jump.
    expect(zurichMidnightUtc("2026-03-29")).toBe("2026-03-28T23:00:00.000Z");
    expect(zurichMidnightUtc("2026-03-30")).toBe("2026-03-29T22:00:00.000Z");
    expect(zurichMidnightUtc("2026-10-25")).toBe("2026-10-24T22:00:00.000Z");
    expect(zurichMidnightUtc("2026-10-26")).toBe("2026-10-25T23:00:00.000Z");
  });

  it("each period starts at Zurich midnight of its first day; all time has no start", () => {
    expect(periodStartUtc("today", NOW)).toBe("2026-10-03T22:00:00.000Z");
    expect(periodStartUtc("week", NOW)).toBe("2026-09-27T22:00:00.000Z");
    expect(periodStartUtc("month", NOW)).toBe("2026-09-04T22:00:00.000Z");
    expect(periodStartUtc("all", NOW)).toBeNull();
  });

  it("at 00:30 in Zurich it is already the new day, and the day began 30 minutes ago", () => {
    const halfPastMidnight = new Date("2026-10-03T22:30:00.000Z");
    const start = periodStartUtc("today", halfPastMidnight);
    expect(start).toBe("2026-10-03T22:00:00.000Z");
    expect(Date.parse(start as string)).toBeLessThanOrEqual(halfPastMidnight.getTime());
  });
});

describe("loadDashboardMoney", () => {
  it("binds the period start as a UTC instant and never reads a date through the session zone", async () => {
    db.classRows = [{ class_slug: "mercedes-benz-v-class", income_rappen: 10039, fee_rappen: 0, fare_count: 1 }];
    await loadDashboardMoney(env, claims, "today", NOW);
    expect(db.texts).toHaveLength(3);
    for (const text of db.texts) {
      expect(text).not.toMatch(/::date at time zone/);
      expect(text).toMatch(/\?::timestamptz/);
    }
    for (const values of db.values) {
      expect(values.length).toBeGreaterThan(0);
      for (const v of values) expect(v).toBe("2026-10-03T22:00:00.000Z");
    }
  });

  it("all time binds no start", async () => {
    await loadDashboardMoney(env, claims, "all", NOW);
    for (const values of db.values) for (const v of values) expect(v).toBeNull();
  });

  it("live all time: income 130732 rappen over 15 fares, and the class lines add up to income", async () => {
    db.classRows = LIVE_ALL_TIME;
    db.refund = 3556;
    db.lines = [{ customer: " Rider ", booking: "VT-26-0746", amount_rappen: 3556 }];
    const money = await loadDashboardMoney(env, claims, "all", NOW);
    expect(money.incomeRappen).toBe(130732);
    expect(money.fareCount).toBe(15);
    expect(Math.round(money.incomeRappen / money.fareCount)).toBe(8715); // 8715 rappen a fare, not 9338
    expect(money.byClass).toEqual([
      { klass: "Economy", rappen: 33660 },
      { klass: "Business", rappen: 73604 },
      { klass: "Van luxury", rappen: 23468 },
    ]);
    expect(money.byClass.reduce((n, l) => n + l.rappen, 0)).toBe(money.incomeRappen);
    expect(money.refundRappen).toBe(3556);
    expect(money.feeRappen).toBe(0);
    expect(money.refunds).toEqual([{ customer: "Rider", booking: "VT-26-0746", amountRappen: 3556 }]);
  });

  it("the payment rows carry the fare count: a class-change difference is income but not a fare", async () => {
    await loadDashboardMoney(env, claims, "week", NOW);
    const paid = db.texts[0] ?? "";
    expect(paid).toMatch(/extra\.extra_snapshot_id = p\.snapshot_id/);
    expect(paid).toMatch(/count\(\*\) filter \(where not is_extra\)/);
    expect(paid).toMatch(/order by leg\.leg_seq/);
  });

  it("an empty period is zeros with a line for every class on offer, in price-book order", async () => {
    db.classRows = CLASS_ROWS();
    const money = await loadDashboardMoney(env, claims, "today", NOW);
    expect(money).toMatchObject({ incomeRappen: 0, refundRappen: 0, feeRappen: 0, fareCount: 0, refunds: [] });
    expect(money.byClass).toEqual([
      { klass: "Economy", rappen: 0 },
      { klass: "Business", rappen: 0 },
      { klass: "Van luxury", rappen: 0 },
    ]);
  });

  it("the class lines come from the live class rows (U10): the query lists every class with its name and order", async () => {
    await loadDashboardMoney(env, claims, "week", NOW);
    const paid = db.texts[0] ?? "";
    expect(paid).toMatch(/from public\.vehicle_classes as vc\s+full join by_class as b on b\.class_id = vc\.id/);
    expect(paid).toMatch(/vc\.name as class_name/);
    expect(paid).toMatch(/\(vc\.active and vc\.hidden_at is null\) as live/);
    expect(paid).toMatch(/order by vc\.sort_order, vc\.slug/);
  });
});

describe("moneyClassLines (U10)", () => {
  const rows = (income: Record<string, number>) =>
    CLASS_ROWS(Object.fromEntries(Object.entries(income).map(([slug, n]) => [slug, [n, 0, 1]]))) as unknown as Parameters<typeof moneyClassLines>[0];

  it("live and legacy rows with the same name are one line, at the first one's place", () => {
    expect(moneyClassLines(rows({ saden: 100, economy: 50, business: 20, "mercedes-benz-v-class": 30 }))).toEqual([
      { klass: "Economy", rappen: 150 },
      { klass: "Business", rappen: 50 },
      { klass: "Van luxury", rappen: 0 },
    ]);
  });

  it("a class outside the old three keeps its own name and its own money: first is First, never Economy", () => {
    const lines = moneyClassLines(rows({ saden: 100, first: 700, "van-luxury": 5 }));
    expect(lines).toEqual([
      { klass: "Economy", rappen: 100 },
      { klass: "Business", rappen: 0 },
      { klass: "First", rappen: 700 },
      { klass: "Van luxury", rappen: 5 },
    ]);
    expect(lines.reduce((n, l) => n + l.rappen, 0)).toBe(805);
  });

  it("a dropped class with no income in the period has no line; the same class with income has one", () => {
    expect(moneyClassLines(rows({})).map((l) => l.klass)).not.toContain("First");
    expect(moneyClassLines(rows({})).map((l) => l.klass)).not.toContain("mahaha");
    expect(moneyClassLines(rows({ mahaha: 9 })).map((l) => l.klass)).toContain("mahaha");
  });

  it("a name the owner gives a live class is the line's name, and the order is the price book's, not alphabet", () => {
    const lines = moneyClassLines([
      { class_slug: "z-van", class_name: "Zeta van", sort_order: 5, live: true, income_rappen: 10 },
      { class_slug: "a-sedan", class_name: "Alpha sedan", sort_order: 9, live: true, income_rappen: 20 },
      { class_slug: "m-mid", class_name: "Mid", sort_order: 7, live: true, income_rappen: 0 },
    ]);
    expect(lines).toEqual([
      { klass: "Zeta van", rappen: 10 },
      { klass: "Mid", rappen: 0 },
      { klass: "Alpha sedan", rappen: 20 },
    ]);
  });

  it("a class row without a stored name reads as its slug's own name", () => {
    expect(moneyClassLines([{ class_slug: "first", class_name: null, sort_order: 1, live: true, income_rappen: 3 }])).toEqual([
      { klass: "First", rappen: 3 },
    ]);
  });

  it("income whose booking has no class row is not put on Economy: it is its own last line, so the lines still add up", () => {
    const lines = moneyClassLines([
      ...rows({ saden: 100 }),
      { class_slug: null, class_name: null, sort_order: null, live: null, income_rappen: 40 },
    ]);
    expect(lines.at(-1)).toEqual({ klass: "", rappen: 40 });
    expect(lines.find((l) => l.klass === "Economy")?.rappen).toBe(100);
    expect(lines.reduce((n, l) => n + l.rappen, 0)).toBe(140);
  });
});
