import { describe, expect, it } from "vitest";
import { formatTripWhen, joinWhen, splitWhen } from "./trip-format";

describe("trip-format", () => {
  it("formats the wall clock without a time zone shift", () => {
    expect(formatTripWhen("2026-09-29T08:15", "en")).toMatch(/^Tue,? 29 Sep\w*,? 08:15$/);
    expect(formatTripWhen("2026-09-29T00:05", "de")).toContain("00:05");
    expect(formatTripWhen("nope", "en")).toBe("");
  });
  it("splits and joins", () => {
    expect(splitWhen("2026-09-29T08:15")).toEqual({ date: "2026-09-29", time: "08:15" });
    expect(splitWhen(null)).toEqual({ date: "", time: "" });
    expect(joinWhen("2026-09-29", "08:15")).toBe("2026-09-29T08:15");
    expect(joinWhen("2026-09-29", "")).toBeNull();
  });
});
