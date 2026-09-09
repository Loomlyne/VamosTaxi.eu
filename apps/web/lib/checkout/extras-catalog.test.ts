import { describe, expect, it } from "vitest";
import { catalogFromSurcharges, extraUi, recapExtras } from "./extras-catalog";

describe("checkout extras catalog", () => {
  it("keeps ops extras and drops night", () => {
    const extras = catalogFromSurcharges([
      {
        code: "child_seat",
        kind: "amount",
        amount_rappen: 2000,
        percent: null,
        active: true,
      },
      {
        code: "meet_greet",
        kind: "included",
        amount_rappen: null,
        percent: null,
        active: true,
      },
      {
        code: "night",
        kind: "percent",
        amount_rappen: null,
        percent: "10",
        active: true,
      },
    ]);
    expect(extras.map((row) => row.code)).toEqual(["child_seat", "meet_greet"]);
    expect(extras[0]?.amount_rappen).toBe(2000);
    expect(extras[0]?.toggle).toBe(true);
    expect(extras[1]?.kind).toBe("included");
    expect(extras[1]?.toggle).toBe(false);
    expect(extraUi("night")).toBeNull();
  });

  it("lists only selected extras on the recap, using book amounts", () => {
    const catalog = catalogFromSurcharges([
      {
        code: "child_seat",
        kind: "amount",
        amount_rappen: 2000,
        percent: null,
        active: true,
      },
      {
        code: "oversized_luggage",
        kind: "amount",
        amount_rappen: 0,
        percent: null,
        active: true,
      },
    ]);
    const lines = recapExtras(catalog, (code) => code === "child_seat");
    expect(lines).toEqual([{ code: "child_seat", labelKey: "childSeat", amount_rappen: 2000 }]);
    expect(recapExtras([], (code) => code === "extra_stop")).toEqual([
      { code: "extra_stop", labelKey: "additional-stop-2", amount_rappen: 0 },
    ]);
  });
});
