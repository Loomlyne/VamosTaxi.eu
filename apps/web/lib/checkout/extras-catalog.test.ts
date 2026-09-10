import { describe, expect, it } from "vitest";
import { catalogFromSurcharges, extraRappenOutsideLock, extraUi, recapExtraFares, recapExtras } from "./extras-catalog";

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
    expect(lines).toEqual([{ code: "child_seat", labelKey: "childSeat", icon: "baby" }]);
    expect(recapExtras([], (code) => code === "extra_stop")).toEqual([]);
  });

  it("puts selected extras on the fare with the book amount", () => {
    const catalog = catalogFromSurcharges([
      {
        code: "child_seat",
        kind: "amount",
        amount_rappen: 2000,
        percent: null,
        active: true,
      },
    ]);
    expect(recapExtraFares(catalog, (code) => code === "child_seat")).toEqual([
      { code: "child_seat", labelKey: "childSeat", icon: "baby", amount_rappen: 2000 },
    ]);
    expect(extraRappenOutsideLock(null, catalog, (code) => code === "child_seat")).toBe(2000);
    expect(extraRappenOutsideLock({ child_seats: 1 }, catalog, (code) => code === "child_seat")).toBe(0);
  });
});
