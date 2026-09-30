// D-36: a booking leg's scheduled_at is the Europe/Zurich wall clock turned
// into the UTC instant, with PostgreSQL's DST rules (standard time preferred
// when in doubt; a nonexistent spring-forward time moves forward one hour).

import { describe, expect, it } from "vitest";
import type { QuoteLockPayload } from "../quote/lock";
import { checkoutLegsFromLock, InvalidScheduleError } from "../checkout/lock-to-rpc";
import { zurichLocalToUtcMs } from "./serviceArea";

function iso(local: string): string | null {
  const ms = zurichLocalToUtcMs(local);
  return ms == null ? null : new Date(ms).toISOString();
}

describe("zurichLocalToUtcMs", () => {
  it("summer time is UTC+2", () => {
    expect(iso("2026-10-01T08:00")).toBe("2026-10-01T06:00:00.000Z");
  });

  it("winter time is UTC+1", () => {
    expect(iso("2026-01-15T08:00")).toBe("2026-01-15T07:00:00.000Z");
  });

  it("a nonexistent spring-forward time lands one hour later, as Postgres", () => {
    expect(iso("2027-03-28T02:30")).toBe("2027-03-28T01:30:00.000Z");
  });

  it("an ambiguous fall-back time prefers standard time, as Postgres", () => {
    expect(iso("2026-10-25T02:30")).toBe("2026-10-25T01:30:00.000Z");
  });

  it("refuses text that is not a wall clock", () => {
    expect(zurichLocalToUtcMs("tomorrow")).toBeNull();
    expect(zurichLocalToUtcMs("")).toBeNull();
  });

  it("refuses a day the month does not have instead of rolling into the next month", () => {
    expect(zurichLocalToUtcMs("2026-02-31T10:00")).toBeNull();
    expect(zurichLocalToUtcMs("2026-04-31T10:00")).toBeNull();
    expect(zurichLocalToUtcMs("2026-02-29T10:00")).toBeNull();
  });

  it("still reads the last real day of a month, including 29 February in a leap year", () => {
    expect(iso("2026-02-28T10:00")).toBe("2026-02-28T09:00:00.000Z");
    expect(iso("2028-02-29T10:00")).toBe("2028-02-29T09:00:00.000Z");
    expect(iso("2026-04-30T10:00")).toBe("2026-04-30T08:00:00.000Z");
    expect(iso("2026-12-31T10:00")).toBe("2026-12-31T09:00:00.000Z");
  });
});

function lock(scheduledLocal: string): QuoteLockPayload {
  return {
    v: 1,
    quote_id: "00000000-0000-4000-8000-000000000001",
    exp: "2026-09-05T13:00:00.000Z",
    engine_version: "quote-engine@test",
    rate_version_id: 1,
    settings_version_id: 1,
    computed_at: "2026-09-05T12:00:00.000Z",
    display_currency: "CHF",
    mode: "one_way",
    pax: 1,
    bags: 0,
    extras: null,
    coupon: null,
    class_totals: [],
    legs: [
      {
        leg_seq: 1,
        pickup: { lng: 8.5, lat: 47.4, text: "A" },
        dropoff: { lng: 8.54, lat: 47.37, text: "B" },
        scheduled_local: scheduledLocal,
        distance_m: 1000,
        duration_s: 600,
        origin_zone_id: null,
        dest_zone_id: null,
        waypoints: [],
        flight_no: null,
        landing_source: null,
      },
    ],
  } as QuoteLockPayload;
}

describe("checkoutLegsFromLock scheduled_at (D-36)", () => {
  it("stores the Zurich instant and keeps scheduled_local as typed", () => {
    const [summer] = checkoutLegsFromLock(lock("2026-10-01T08:00"), "cls");
    expect(summer?.scheduled_at).toBe("2026-10-01T06:00:00.000Z");
    expect(summer?.scheduled_local).toBe("2026-10-01T08:00");
    const [winter] = checkoutLegsFromLock(lock("2026-01-15T08:00"), "cls");
    expect(winter?.scheduled_at).toBe("2026-01-15T07:00:00.000Z");
    const [gap] = checkoutLegsFromLock(lock("2027-03-28T02:30"), "cls");
    expect(gap?.scheduled_at).toBe("2027-03-28T01:30:00.000Z");
    const [overlap] = checkoutLegsFromLock(lock("2026-10-25T02:30"), "cls");
    expect(overlap?.scheduled_at).toBe("2026-10-25T01:30:00.000Z");
  });

  it("refuses a lock whose day does not exist, so no booking is saved for another date", () => {
    expect(() => checkoutLegsFromLock(lock("2026-02-31T10:00"), "cls")).toThrow(InvalidScheduleError);
  });

  it("refuses a lock whose wall clock cannot be read, as invalid_request", () => {
    expect(() => checkoutLegsFromLock(lock("not a time"), "cls")).toThrow(InvalidScheduleError);
    try {
      checkoutLegsFromLock(lock("not a time"), "cls");
    } catch (err) {
      expect((err as InvalidScheduleError).refusal).toBe("invalid_request");
    }
  });
});
