// apps/web/lib/ops/quote-lock-hours.test.ts
//
// Quick 261015-6om, Task 3 (b), signed by the owner 2026-10-15: "Price stays valid for" has a 24-hour
// maximum. The rate-book PUT turns the field's whole hours into quote_lock_minutes through this helper,
// so a value above 1440 minutes never reaches the draft (and checkout never promises more than the pay
// link's fixed 24 hours).
import { describe, expect, it } from "vitest";
import { QUOTE_LOCK_MAX_MINUTES, quoteLockMinutesFromWholeHours, quoteLockMinutesWithinCap } from "./quote-lock-hours";

describe("quoteLockMinutesFromWholeHours: whole hours 1 to 24", () => {
  it("the cap is 24 hours, 1440 minutes", () => {
    expect(QUOTE_LOCK_MAX_MINUTES).toBe(1440);
  });

  it.each([
    [24, 1440],
    ["24", 1440],
    [1, 60],
    ["1", 60],
    [12, 720],
    [" 6 ", 360],
  ])("accepts %j as %i minutes", (hours, minutes) => {
    expect(quoteLockMinutesFromWholeHours(hours)).toBe(minutes);
  });

  it.each([25, "25", 48, 35791394, 0, "0", -1, 1.5, "1.5", "", "x", null, undefined, true, Number.NaN])(
    "refuses %j",
    (hours) => {
      expect(quoteLockMinutesFromWholeHours(hours)).toBeNull();
    },
  );

  it("minutes: 1440 and 60 are within the cap; 1441, 1500 (25 h), 0 and 59 are not", () => {
    expect(quoteLockMinutesWithinCap(1440)).toBe(true);
    expect(quoteLockMinutesWithinCap(60)).toBe(true);
    expect(quoteLockMinutesWithinCap(1441)).toBe(false);
    expect(quoteLockMinutesWithinCap(1500)).toBe(false);
    expect(quoteLockMinutesWithinCap(0)).toBe(false);
    expect(quoteLockMinutesWithinCap(59)).toBe(false);
    expect(quoteLockMinutesWithinCap(Number.NaN)).toBe(false);
    expect(quoteLockMinutesFromWholeHours(1441 / 60)).toBeNull();
  });

  it("the rate-book route uses this helper and keeps no copy of its own", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "../../app/[locale]/(ops)/api/staff/rate-book/route.ts"), "utf8");
    expect(src).toMatch(/import \{[^}]*quoteLockMinutesFromWholeHours[^}]*\} from "@\/lib\/ops\/quote-lock-hours";/);
    expect(src).not.toMatch(/function quoteLockMinutesFromWholeHours/);
    expect(src).not.toMatch(/INT4_MAX/);
  });
});
