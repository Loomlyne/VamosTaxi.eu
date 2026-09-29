import { describe, expect, it } from "vitest";
import { recapForClass } from "./draft-preview";

function entry(lines: unknown[]) {
  return { eligible: true, total_rappen: 10000, lines } as never;
}

describe("draft preview extras (both line kinds)", () => {
  it("counts a quote `extra` line once", () => {
    const recap = recapForClass(entry([{ kind: "fare", code: "fare", amount_rappen: 9000, basis: {} }, { kind: "extra", code: "x", amount_rappen: 1000 }]), 81);
    expect(recap.find((r) => r.code === "extras")?.amount_rappen).toBe(1000);
  });
  it("counts a snapshot `surcharge` line once", () => {
    const recap = recapForClass(entry([{ kind: "fare", code: "fare", amount_rappen: 9000, basis: {} }, { kind: "surcharge", code: "roof-box", amount_rappen: 1000 }]), 81);
    expect(recap.find((r) => r.code === "extras")?.amount_rappen).toBe(1000);
  });
});
