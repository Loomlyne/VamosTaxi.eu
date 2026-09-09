import { describe, expect, it } from "vitest";
import { bumpHm, parseHm } from "./hm";

describe("TimePicker", () => {
  it("parses and snaps minutes to 5", () => {
    expect(parseHm("03:25").hm).toBe("03:25");
    expect(parseHm("8:07").hm).toBe("08:05");
  });

  it("bumps hours and minutes like the DC spinner", () => {
    expect(bumpHm("03:25", 60)).toBe("04:25");
    expect(bumpHm("03:25", -5)).toBe("03:20");
    expect(bumpHm("00:00", -5)).toBe("00:00");
    expect(bumpHm("23:55", 5)).toBe("23:55");
  });
});
