import { describe, expect, it } from "vitest";
import { mapBoardBooking, type SqlBoardRow } from "./bookings-map";

const base = {
  id: "b1",
  reference: "VT-1",
  status: "confirmed",
  lines: [],
} as unknown as SqlBoardRow;

function row(lines: unknown, policy: unknown = {}): SqlBoardRow {
  return { ...base, lines, policy } as unknown as SqlBoardRow;
}

describe("ops booking map: generic extras and fare lines (D-35)", () => {
  it("prints an owner-named extra by name, each amount once, lines add up", () => {
    const mapped = mapBoardBooking(
      row([
        { kind: "fare", code: "distance_fare", amount_rappen: 6000, params: { list_rappen: 8000 } },
        {
          kind: "surcharge",
          code: "roof-box",
          amount_rappen: 2500,
          params: { names: { en: "Roof box", de: "Dachbox" } },
        },
        { kind: "coupon", code: "SAVE20", amount_rappen: null, params: { discount_rappen: 2000 } },
        { kind: "vat", code: "vat", amount_rappen: 100, params: {} },
      ]),
    );
    expect(mapped.extras).toEqual(["roof-box"]);
    expect(mapped.fareLines.map((l) => [l.kind, l.code, l.rappen])).toEqual([
      ["fare", "distance_fare", 8000],
      ["surcharge", "roof-box", 2500],
      ["coupon", "SAVE20", -2000],
      ["vat", "vat", 100],
    ]);
    const sum = mapped.fareLines.reduce((n, l) => n + (l.rappen ?? 0), 0);
    expect(sum).toBe(6000 + 2500 + 100);
    const roof = mapped.fareLines[1]!;
    expect(roof.label).toBe("Roof box");
    expect(roof.names?.de).toBe("Dachbox");
  });

  it("falls back to the humanised code without names", () => {
    const mapped = mapBoardBooking(
      row([
        { kind: "fare", code: "distance_fare", amount_rappen: 5000, params: {} },
        { kind: "surcharge", code: "baby-cot", amount_rappen: 900, params: {} },
      ]),
    );
    expect(mapped.fareLines[1]!.label).toBe("Baby cot");
    expect(mapped.extras).toEqual(["baby-cot"]);
  });

  it("still maps the legacy three-code lines", () => {
    const mapped = mapBoardBooking(
      row(
        [
          { kind: "fare", code: "distance_fare", i18n_key: "price.line.transfer", amount_rappen: 9000, params: {} },
          { kind: "surcharge", code: "child_seat", i18n_key: "price.surcharge.child_seat.label", amount_rappen: 1000, params: { n: 1 } },
        ],
        { extras: ["child_seat"] },
      ),
    );
    expect(mapped.extras).toEqual(["child_seat"]);
    expect(mapped.fareLines[1]!.label).toBe("Child seat");
  });

  it("uses policy.extras when the snapshot has no lines", () => {
    expect(mapBoardBooking(row([], { extras: ["ski_rack", "wifi"] })).extras).toEqual(["ski_rack", "wifi"]);
  });
});
