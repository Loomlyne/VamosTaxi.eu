// apps/web/lib/ops/chauffeurs-duty.test.ts
//
// dutyStatus: Europe/Zurich civil date + clock. Leave wins. Overnight wrap.
// D-09 D-10 D-11 D-12.

import { describe, expect, it } from "vitest";
import { dutyStatus } from "./chauffeurs-model";

const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5] as const;

describe("dutyStatus (D-09 D-10 D-11 D-12)", () => {
  it("returns shift on a selected Friday inside the window (Zurich)", () => {
    const now = new Date("2026-09-18T10:00:00+02:00");
    expect(
      dutyStatus(
        { weekdays: WEEKDAYS_MON_FRI, start: "06:00", end: "14:00", leaveRanges: [] },
        now,
      ),
    ).toBe("shift");
  });

  it("returns off on a selected Friday after the window", () => {
    const now = new Date("2026-09-18T15:00:00+02:00");
    expect(
      dutyStatus(
        { weekdays: WEEKDAYS_MON_FRI, start: "06:00", end: "14:00", leaveRanges: [] },
        now,
      ),
    ).toBe("off");
  });

  it("returns off on Saturday when weekdays are Mon–Fri", () => {
    const now = new Date("2026-09-19T10:00:00+02:00");
    expect(
      dutyStatus(
        { weekdays: WEEKDAYS_MON_FRI, start: "06:00", end: "14:00", leaveRanges: [] },
        now,
      ),
    ).toBe("off");
  });

  it("leave covering Zurich today wins over the clock (D-12)", () => {
    const now = new Date("2026-09-18T10:00:00+02:00");
    expect(
      dutyStatus(
        {
          weekdays: WEEKDAYS_MON_FRI,
          start: "06:00",
          end: "14:00",
          leaveRanges: [{ from: "2026-09-17", until: "2026-09-18" }],
        },
        now,
      ),
    ).toBe("leave");
  });

  it("overnight wrap: start 22:00 end 06:00 is shift at 23:00 and 05:00, off at 12:00 (D-11)", () => {
    const weekdays = [5];
    expect(
      dutyStatus(
        { weekdays, start: "22:00", end: "06:00", leaveRanges: [] },
        new Date("2026-09-18T23:00:00+02:00"),
      ),
    ).toBe("shift");
    expect(
      dutyStatus(
        { weekdays, start: "22:00", end: "06:00", leaveRanges: [] },
        new Date("2026-09-18T05:00:00+02:00"),
      ),
    ).toBe("shift");
    expect(
      dutyStatus(
        { weekdays, start: "22:00", end: "06:00", leaveRanges: [] },
        new Date("2026-09-18T12:00:00+02:00"),
      ),
    ).toBe("off");
  });

  it("empty weekdays are off unless leave", () => {
    const now = new Date("2026-09-18T10:00:00+02:00");
    expect(dutyStatus({ weekdays: [], start: "06:00", end: "14:00", leaveRanges: [] }, now)).toBe(
      "off",
    );
  });

  it("missing start is off unless leave", () => {
    const now = new Date("2026-09-18T10:00:00+02:00");
    expect(
      dutyStatus({ weekdays: WEEKDAYS_MON_FRI, start: null, end: "14:00", leaveRanges: [] }, now),
    ).toBe("off");
  });

  it("end === start on a selected day is 24h on shift that civil day", () => {
    const weekdays = [5];
    expect(
      dutyStatus(
        { weekdays, start: "08:00", end: "08:00", leaveRanges: [] },
        new Date("2026-09-18T08:00:00+02:00"),
      ),
    ).toBe("shift");
    expect(
      dutyStatus(
        { weekdays, start: "08:00", end: "08:00", leaveRanges: [] },
        new Date("2026-09-18T07:59:00+02:00"),
      ),
    ).toBe("shift");
  });

  it("DST 2026-03-29 01:30 and 03:30 Zurich do not throw; civil date is Zurich", () => {
    const weekdays = [7];
    expect(() =>
      dutyStatus(
        { weekdays, start: "00:00", end: "12:00", leaveRanges: [] },
        new Date("2026-03-29T01:30:00+01:00"),
      ),
    ).not.toThrow();
    expect(() =>
      dutyStatus(
        { weekdays, start: "00:00", end: "12:00", leaveRanges: [] },
        new Date("2026-03-29T03:30:00+02:00"),
      ),
    ).not.toThrow();
    expect(
      dutyStatus(
        { weekdays, start: "00:00", end: "12:00", leaveRanges: [] },
        new Date("2026-03-29T03:30:00+02:00"),
      ),
    ).toBe("shift");
  });
});
