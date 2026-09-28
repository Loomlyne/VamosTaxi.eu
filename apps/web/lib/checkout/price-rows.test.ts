// 26.1-11 / UI-SPEC §8: the airport pickup fee and the matched route pair are
// their own labelled rows in the checkout breakdown. Pure builder — no React.
import { describe, expect, it } from "vitest";
import { base64urlEncode } from "../crypto/hmac";
import {
  breakdownRappen,
  breakdownRows,
  peekLockPriceRows,
  type BreakdownLabelKey,
  type BreakdownLine,
} from "./price-rows";

function t(key: BreakdownLabelKey, values?: { origin: string; destination: string }): string {
  if (key === "routePair") return `${values?.origin} – ${values?.destination} route`;
  if (key === "routePairPlain") return "Route price";
  return "Airport pickup fee";
}

/** Display-side amount: rappen → major units, null stays null (PriceSummary → CHF 000). */
const toMajor = (rappen: number | null): number | null => (rappen == null ? null : rappen / 100);

function lockWith(payload: unknown): string {
  const body = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  return `h.${body}.s`;
}

describe("breakdownRows", () => {
  it("returns one airport-fee row and one route-pair row, in line order, with icons", () => {
    const lines: BreakdownLine[] = [
      { code: "distance_fare", amount_rappen: 2_000 },
      { code: "airport_fee", amount_rappen: 3_000 },
      { code: "fixed_route", amount_rappen: 5_000, params: { origin: "Zürich", destination: "Bern" } },
      { code: "child_seat", amount_rappen: 1_000 },
      { code: "vat", amount_rappen: 900 },
    ];
    const rows = breakdownRows(lines, t, toMajor);
    expect(rows.map((r) => r.code)).toEqual(["airport_fee", "fixed_route"]);
    expect(rows[0]).toMatchObject({ label: "Airport pickup fee", icon: "plane-landing", amount: 30 });
    expect(rows[1]).toMatchObject({ label: "Zürich – Bern route", icon: "map-pin", amount: 50 });
  });

  it("keeps line order when the route line comes first", () => {
    const rows = breakdownRows(
      [
        { code: "fixed_route", amount_rappen: 1 },
        { code: "airport_fee", amount_rappen: 2 },
      ],
      t,
      toMajor,
    );
    expect(rows.map((r) => r.code)).toEqual(["fixed_route", "airport_fee"]);
  });

  it("uses the plain route label when the pair line has no place names", () => {
    expect(breakdownRows([{ code: "fixed_route", amount_rappen: 5_000 }], t, toMajor)[0]?.label).toBe(
      "Route price",
    );
    expect(
      breakdownRows(
        [{ code: "fixed_route", amount_rappen: 5_000, params: { origin: "Zürich", destination: "" } }],
        t,
        toMajor,
      )[0]?.label,
    ).toBe("Route price");
  });

  it("a null amount stays null so PriceSummary renders the CHF 000 mark (Law 04)", () => {
    const rows = breakdownRows([{ code: "airport_fee", amount_rappen: null }], t, toMajor);
    expect(rows[0]?.amount).toBeNull();
    expect(rows[0]?.amount_rappen).toBeNull();
  });

  it("returns nothing for lines that carry neither component", () => {
    expect(breakdownRows([], t, toMajor)).toEqual([]);
    expect(breakdownRows([{ code: "distance_fare", amount_rappen: 100 }], t, toMajor)).toEqual([]);
  });
});

describe("breakdownRappen", () => {
  it("sums the known row amounts in rappen and ignores unknown ones", () => {
    const rows = breakdownRows(
      [
        { code: "airport_fee", amount_rappen: 3_000 },
        { code: "fixed_route", amount_rappen: null },
      ],
      t,
      toMajor,
    );
    expect(breakdownRappen(rows)).toBe(3_000);
    expect(breakdownRappen([])).toBe(0);
  });
});

describe("peekLockPriceRows", () => {
  const payload = {
    class_totals: [{ slug: "mercedes-benz-v-class", total_rappen: null }],
    price_rows: [
      {
        slug: "mercedes-benz-v-class",
        lines: [
          { code: "airport_fee", leg_seq: 1, amount_rappen: null },
          { code: "fixed_route", leg_seq: 1, amount_rappen: null, params: { origin: "Zürich", destination: "Bern" } },
        ],
      },
    ],
  };

  it("reads the selected class's rows from the lock payload", () => {
    const lines = peekLockPriceRows(lockWith(payload), "mercedes-benz-v-class");
    expect(lines.map((l) => l.code)).toEqual(["airport_fee", "fixed_route"]);
    expect(lines[1]?.params).toEqual({ origin: "Zürich", destination: "Bern" });
  });

  it("returns [] for another class, an old lock without price_rows, or an unreadable lock", () => {
    expect(peekLockPriceRows(lockWith(payload), "mercedes-s-class-special")).toEqual([]);
    expect(peekLockPriceRows(lockWith({ class_totals: [] }), "mercedes-benz-v-class")).toEqual([]);
    expect(peekLockPriceRows("not-a-lock", "mercedes-benz-v-class")).toEqual([]);
    expect(peekLockPriceRows(undefined, "mercedes-benz-v-class")).toEqual([]);
  });

  it("drops malformed rows and negative or non-finite amounts become null (never invent a figure)", () => {
    const lock = lockWith({
      price_rows: [
        {
          slug: "x",
          lines: [
            { code: "airport_fee", amount_rappen: -5 },
            { code: "fixed_route", amount_rappen: "12" },
            { code: "other", amount_rappen: 10 },
            null,
          ],
        },
      ],
    });
    const lines = peekLockPriceRows(lock, "x");
    expect(lines).toEqual([
      { code: "airport_fee", amount_rappen: null },
      { code: "fixed_route", amount_rappen: null },
    ]);
  });
});
