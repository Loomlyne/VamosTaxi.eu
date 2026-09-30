import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  airportPickupFromPlace,
  capExtraStops,
  extraAmountTimesQty,
  humaniseCode,
  publishedMaxExtraStops,
  selectableExtras,
} from "./extras-catalog";

const here = dirname(fileURLToPath(import.meta.url));
const extrasRoute = join(here, "../../app/api/checkout/extras/route.ts");

// 26.2-p4 A3: the name-based helpers of this module (catalogFromSurcharges, extraUi,
// extraIsOn, recapExtras, extraFaresOn, extraRappenOutsideLock…) are deleted with
// their tests. What is left here is name-free.
describe("checkout extras catalog", () => {
  it("public extras route still loads the live book", () => {
    const src = readFileSync(extrasRoute, "utf8");
    // The route reads through loadCheckoutCatalog, which asks for the published book only.
    const catalog = readFileSync(join(here, "checkout-catalog.ts"), "utf8");
    expect(catalog).toContain("preferDraft: false");
    expect(catalog).not.toMatch(/preferDraft:\s*true/);
    expect(src).toContain("loadCheckoutCatalog");
    expect(src).not.toMatch(/preferDraft:\s*true/);
    expect(src).toContain("vat_rate_bps: flags.vat_rate_bps");
  });

  it("an amount times a quantity; nothing for an empty amount or no quantity", () => {
    expect(extraAmountTimesQty(1000, 1)).toBe(1000);
    expect(extraAmountTimesQty(1000, 2)).toBe(2000);
    expect(extraAmountTimesQty(null, 2)).toBeNull();
    expect(extraAmountTimesQty(1000, 0)).toBeNull();
  });

  it("caps extra-stop places at 1 (D-21)", () => {
    expect(publishedMaxExtraStops(3)).toBe(1);
    expect(publishedMaxExtraStops("2")).toBe(1);
    expect(publishedMaxExtraStops(0)).toBe(1);
    expect(publishedMaxExtraStops(null)).toBe(1);
    expect(capExtraStops(4, 3)).toBe(1);
    expect(capExtraStops(1, null)).toBe(1);
    expect(capExtraStops(0, 9)).toBe(0);
  });

  it("reads an airport pickup from the place's zone type", () => {
    expect(airportPickupFromPlace({ zone_type: "airport" })).toBe(true);
    expect(airportPickupFromPlace({ zone_type: "city" })).toBe(false);
    expect(airportPickupFromPlace(null)).toBeUndefined();
  });
});

// D-35 + 26.2-p4 A2: generic extras. The row decides, never the name: a tick box
// is an active row with a fixed amount ≥ 1 rappen, the rule "manual" and no
// quantity source. The name the owner typed is the label (humanised code fallback).
describe("selectableExtras (D-35, 26.2-p4 A2)", () => {
  type Row = Parameters<typeof selectableExtras>[0][number];
  function sur(partial: Partial<Row> & Pick<Row, "code">): Row {
    return {
      kind: "amount",
      amount_rappen: 1000,
      percent: null,
      active: true,
      quantity_source: null,
      predicate: { kind: "manual" },
      ...partial,
    };
  }
  const codes = (rows: Row[]) => selectableExtras(rows, {}).map((row) => row.code);

  it("a manual row with an amount is a tick box whatever its code", () => {
    // The ten names of RESEARCH "Answer 4" as the pricing page stores them, then
    // every code the deleted name lists used to block or rename.
    const any = [
      "ski",
      "waiting",
      "night",
      "weekend",
      "holiday",
      "pet",
      "extra-stop",
      "child-seat",
      "meet-and-greet",
      "airport-pickup",
      "airport_pickup",
      "waiting_airport",
      "waiting_city",
      "extra_wait",
      "extra_stop",
      "return_trip",
      "anything-owner-typed",
    ];
    const rows = selectableExtras(any.map((code) => sur({ code })), {});
    expect(rows.map((row) => row.code)).toEqual(any);
    expect(rows.every((row) => row.amountRappen === 1000)).toBe(true);
    expect(selectableExtras([sur({ code: "one-rappen", amount_rappen: 1 })], {})[0]?.amountRappen).toBe(1);
  });

  it("a row the fare engine handles is not a tick box", () => {
    expect(
      codes([
        sur({ code: "child-seat", predicate: { kind: "always" } }),
        sur({ code: "pet", predicate: { kind: "pickup_zone_type" } }),
        sur({ code: "roof-box", predicate: { kind: "local_time_window" } }),
        sur({ code: "ski", predicate: { kind: "dest_zone_tag" } }),
        sur({ code: "child_seat", predicate: { kind: "quantity" }, quantity_source: "child_seats" }),
        sur({ code: "oversized_luggage", predicate: { kind: "quantity" }, quantity_source: "oversize_bags" }),
        sur({ code: "stop-by-count", predicate: { kind: "quantity" }, quantity_source: "extra_stops" }),
      ]),
    ).toEqual([]);
  });

  it("a row without a readable rule is not a tick box", () => {
    expect(
      codes([
        sur({ code: "empty-rule", predicate: {} }),
        sur({ code: "null-rule", predicate: null }),
        sur({ code: "no-rule", predicate: undefined }),
        sur({ code: "unknown-rule", predicate: { kind: "seasonal_moon_phase" } }),
      ]),
    ).toEqual([]);
  });

  it("a manual row with a quantity source is not a tick box", () => {
    expect(codes([sur({ code: "child-seat", quantity_source: "child_seats" })])).toEqual([]);
  });

  it("inactive, percent, included, amount 0 and empty amount are not tick boxes", () => {
    expect(
      codes([
        sur({ code: "inactive", active: false }),
        sur({ code: "pct", kind: "percent", amount_rappen: null, percent: "10.00" }),
        sur({ code: "free", kind: "included", amount_rappen: null }),
        sur({ code: "zero", amount_rappen: 0 }),
        sur({ code: "empty", amount_rappen: null }),
        sur({ code: "half", amount_rappen: 0.5 }),
      ]),
    ).toEqual([]);
  });

  it("the first row per code wins", () => {
    const rows = selectableExtras([sur({ code: "pet" }), sur({ code: "pet", amount_rappen: 1 })], {});
    expect(rows.map((row) => [row.code, row.amountRappen])).toEqual([["pet", 1000]]);
  });

  it("an owner-typed code is selectable; label falls back to the humanised code in every language", () => {
    const [row] = selectableExtras([sur({ code: "anything-owner-typed" })], {});
    expect(row?.labels).toEqual({
      en: "Anything owner typed",
      de: "Anything owner typed",
      fr: "Anything owner typed",
      ar: "Anything owner typed",
    });
    const [seat] = selectableExtras([sur({ code: "child-seat" })], {});
    expect(seat?.labels.en).toBe("Child seat");
    expect(seat?.labels.ar).toBe("Child seat");
  });

  it("uses a label row when one exists, per language, falling back per missing language", () => {
    const [row] = selectableExtras([sur({ code: "child-seat" })], {
      "child-seat": { en: "Child seat", de: "Kindersitz", fr: "Siège enfant" },
    });
    expect(row?.labels).toEqual({
      en: "Child seat",
      de: "Kindersitz",
      fr: "Siège enfant",
      ar: "Child seat",
    });
  });

  it("humaniseCode turns a slug into sentence case", () => {
    expect(humaniseCode("child-seat")).toBe("Child seat");
    expect(humaniseCode("oversized_luggage")).toBe("Oversized luggage");
    expect(humaniseCode("pet")).toBe("Pet");
  });
});
