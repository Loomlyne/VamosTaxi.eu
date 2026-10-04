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
//     live (16 captures, CHF 1,307.32) 30 days read CHF 93.38 a fare and the class lines summed CHF 1,207.32.
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

const {
  loadDashboardMoney,
  periodStartUtc,
  zurichMidnightUtc,
  dashboardClassOf,
  DASHBOARD_CLASSES,
} = await import("./bookings");

const env = {} as CloudflareEnv;
const claims = { sub: "staff", role: "authenticated" } as const;
// 2026-10-04 18:34 in Zurich: the minute VT-26-0753 was paid on live.
const NOW = new Date("2026-10-04T16:34:00.000Z");

// Live, read-only, 2026-10-04 ~21:25 +04: captured payments by the booking's first-leg class slug.
const LIVE_ALL_TIME: Row[] = [
  { class_slug: "business", income_rappen: 44810, fee_rappen: 0, fare_count: 4 },
  { class_slug: "mercedes-benz-v-class", income_rappen: 28794, fee_rappen: 0, fare_count: 3 },
  { class_slug: "saden", income_rappen: 33660, fee_rappen: 0, fare_count: 6 },
  // 9447 + the class-change difference 1184: two payments, one fare.
  { class_slug: "van-luxury", income_rappen: 23468, fee_rappen: 0, fare_count: 2 },
];

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

  it("live all time: income CHF 1,307.32 over 15 fares, and the class lines add up to income", async () => {
    db.classRows = LIVE_ALL_TIME;
    db.refund = 3556;
    db.lines = [{ customer: " Rider ", booking: "VT-26-0746", amount_rappen: 3556 }];
    const money = await loadDashboardMoney(env, claims, "all", NOW);
    expect(money.incomeRappen).toBe(130732);
    expect(money.fareCount).toBe(15);
    expect(Math.round(money.incomeRappen / money.fareCount)).toBe(8715); // CHF 87.15, not CHF 93.38
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

  it("an empty period is zeros with all three class lines", async () => {
    const money = await loadDashboardMoney(env, claims, "today", NOW);
    expect(money).toMatchObject({ incomeRappen: 0, refundRappen: 0, feeRappen: 0, fareCount: 0, refunds: [] });
    expect(money.byClass.map((l) => l.klass)).toEqual([...DASHBOARD_CLASSES]);
  });
});

describe("dashboardClassOf", () => {
  it("live and legacy slugs read Economy, Business, Van luxury; anything else reads Economy like the board", () => {
    expect(dashboardClassOf("saden")).toBe("Economy");
    expect(dashboardClassOf("economy")).toBe("Economy");
    expect(dashboardClassOf("mercedes-benz-v-class")).toBe("Business");
    expect(dashboardClassOf("business")).toBe("Business");
    expect(dashboardClassOf("van-luxury")).toBe("Van luxury");
    expect(dashboardClassOf("van")).toBe("Van luxury");
    expect(dashboardClassOf("first")).toBe("Economy");
    expect(dashboardClassOf(null)).toBe("Economy");
  });
});
