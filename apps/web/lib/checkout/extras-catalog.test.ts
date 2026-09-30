import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  catalogFromSurcharges,
  extraAmountTimesQty,
  extraFaresOn,
  extraIsOn,
  extraRappenOutsideLock,
  extraUi,
  airportPickupFromPlace,
  capExtraStops,
  publishedMaxExtraStops,
  recapExtraFares,
  recapExtras,
  humaniseCode,
  selectableExtras,
  type CheckoutExtraJson,
} from "./extras-catalog";

const here = dirname(fileURLToPath(import.meta.url));
const extrasRoute = join(here, "../../app/api/checkout/extras/route.ts");

function row(
  partial: Partial<CheckoutExtraJson> & Pick<CheckoutExtraJson, "code"> & { active?: boolean },
): Parameters<typeof catalogFromSurcharges>[0][number] {
  return {
    code: partial.code,
    kind: partial.kind ?? "amount",
    amount_rappen: partial.amount_rappen ?? 1000,
    percent: partial.percent ?? null,
    active: partial.active ?? true,
  };
}

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
      {
        code: "extra_stop",
        kind: "amount",
        amount_rappen: 1500,
        percent: null,
        active: true,
      },
    ]);
    expect(extras.map((row) => row.code)).toEqual([
      "child_seat",
      "meet_greet",
      "extra_stop",
    ]);
    expect(extras[0]?.amount_rappen).toBe(2000);
    expect(extras[0]?.toggle).toBe(true);
    expect(extras[1]?.kind).toBe("included");
    expect(extras[1]?.toggle).toBe(false);
    expect(extras.find((item) => item.code === "free_wait")).toBeUndefined();
    expect(extraUi("night")).toBeNull();
  });

  it("omits a surcharge after it is deleted from the published book", () => {
    const live = catalogFromSurcharges([
      row({ code: "child_seat", amount_rappen: 2000 }),
      row({ code: "pet", amount_rappen: 1500 }),
    ]);
    expect(live.map((item) => item.code)).toEqual(["child_seat", "pet"]);
    const afterDelete = catalogFromSurcharges([row({ code: "child_seat", amount_rappen: 2000 })]);
    expect(afterDelete.map((item) => item.code)).toEqual(["child_seat"]);
    expect(afterDelete.some((item) => item.code === "pet")).toBe(false);
    expect(afterDelete.find((item) => item.code === "pet")).toBeUndefined();
  });

  it("omits automatic night/weekend/holiday/waiting chips", () => {
    const extras = catalogFromSurcharges([
      row({ code: "child_seat" }),
      row({ code: "night", kind: "percent", amount_rappen: null, percent: "10" }),
      row({ code: "weekend", kind: "percent", amount_rappen: null, percent: "10" }),
      row({ code: "holiday", kind: "percent", amount_rappen: null, percent: "10" }),
      row({ code: "waiting", amount_rappen: 3000 }),
      row({ code: "waiting_airport", amount_rappen: 4000 }),
      row({ code: "waiting_city", amount_rappen: 2500 }),
    ]);
    expect(extras.map((item) => item.code)).toEqual(["child_seat"]);
    expect(extras.some((item) => item.code === "waiting_airport")).toBe(false);
    expect(extras.some((item) => item.code === "waiting")).toBe(false);
  });

  it("lists a new published chip (pet, ski, unknown slug) and skips inactive", () => {
    const extras = catalogFromSurcharges([
      row({ code: "pet", amount_rappen: 1800 }),
      row({ code: "ski", amount_rappen: 2200 }),
      row({ code: "bike_rack", amount_rappen: 900 }),
      row({ code: "child_seat", amount_rappen: 2000, active: false }),
    ]);
    expect(extras.map((item) => item.code)).toEqual(["pet", "ski", "bike_rack"]);
    expect(extraUi("bike_rack")).toBeNull();
    expect(extraUi("ski")?.labelKey).toBe("extraSki");
  });

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

  it("extra_stop is a chip without a fixed rappen × quantity fare", () => {
    const catalog = catalogFromSurcharges([
      row({ code: "extra_stop", amount_rappen: 1500 }),
      row({ code: "child_seat", amount_rappen: 2000 }),
      row({ code: "oversized_luggage", amount_rappen: 1000 }),
      row({ code: "pet", amount_rappen: 1800 }),
    ]);
    const stop = catalog.find((item) => item.code === "extra_stop");
    expect(stop?.amount_rappen).toBeNull();
    expect(extraAmountTimesQty(2000, 2)).toBe(4000);
    expect(extraAmountTimesQty(1000, 1)).toBe(1000);
    expect(extraAmountTimesQty(1800, 2)).toBe(3600);
    expect(
      recapExtraFares(catalog, (code) => code === "extra_stop")[0]?.amount_rappen,
    ).toBeNull();
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
    expect(lines).toEqual([{ code: "child_seat", labelKey: "childSeat" }]);
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
      { code: "child_seat", labelKey: "childSeat", amount_rappen: 2000 },
    ]);
    expect(extraRappenOutsideLock(null, catalog, (code) => code === "child_seat")).toBe(2000);
    expect(extraRappenOutsideLock({ child_seats: 1 }, catalog, (code) => code === "child_seat")).toBe(0);
    expect(extraFaresOn(catalog, (code) => code === "child_seat")).toEqual([
      { code: "child_seat", amount_rappen: 2000 },
    ]);
  });

  it("recap extras follow this booking's toggles, not a leftover lock", () => {
    const off = {
      childSeat: false,
      oversized: false,
      extraStop: false,
      skiRack: false,
      extraCodes: [],
    };
    expect(extraIsOn("child_seat", off)).toBe(false);
    expect(extraIsOn("child_seat", { ...off, childSeat: true })).toBe(true);
    expect(
      recapExtraFares(
        catalogFromSurcharges([
          {
            code: "child_seat",
            kind: "amount",
            amount_rappen: 2000,
            percent: null,
            active: true,
          },
        ]),
        (code) => extraIsOn(code, off),
      ),
    ).toEqual([]);
  });

  it("a code the owner added is on by its extra code list", () => {
    const on = {
      childSeat: true,
      oversized: true,
      extraStop: true,
      skiRack: true,
      extraCodes: [],
    };
    expect(extraIsOn("pet", { ...on, extraCodes: ["pet"] })).toBe(true);
  });

  it("does not invent meet & greet or free wait unless they are on the live book", () => {
    expect(catalogFromSurcharges([])).toEqual([]);
    const catalog = catalogFromSurcharges([
      {
        code: "meet_greet",
        kind: "included",
        amount_rappen: null,
        percent: null,
        active: true,
      },
      {
        code: "free_wait",
        kind: "included",
        amount_rappen: null,
        percent: null,
        active: true,
      },
    ]);
    expect(extraUi("meet_greet")?.toggle).toBe(false);
    expect(extraUi("free_wait")?.toggle).toBe(false);
    expect(catalog.map((item) => item.code)).toEqual(["meet_greet", "free_wait"]);
    expect(catalog.every((item) => item.toggle === false)).toBe(true);
    const defaults = {
      childSeat: false,
      oversized: false,
      extraStop: false,
      skiRack: false,
      extraCodes: [],
    };
    expect(extraIsOn("meet_greet", defaults)).toBe(true);
    expect(extraIsOn("free_wait", defaults)).toBe(true);
    expect(
      recapExtras(catalog, (code) => extraIsOn(code, defaults)),
    ).toEqual([
      expect.objectContaining({ code: "meet_greet" }),
      expect.objectContaining({ code: "free_wait" }),
    ]);
    expect(airportPickupFromPlace({ zone_type: "airport" })).toBe(true);
    expect(airportPickupFromPlace({ zone_type: "city" })).toBe(false);
    expect(airportPickupFromPlace(null)).toBeUndefined();
  });

  it("shows amount 0 as included and does not charge it; a price is on the quote once", () => {
    const catalog = catalogFromSurcharges([
      {
        code: "child-seat",
        kind: "amount",
        amount_rappen: 0,
        percent: null,
        active: true,
        predicate: { kind: "always" },
      },
      {
        code: "ski-bag",
        kind: "amount",
        amount_rappen: 100,
        percent: null,
        active: true,
        predicate: { kind: "always" },
      },
    ]);
    const free = catalog.find((row) => row.code === "child-seat");
    const priced = catalog.find((row) => row.code === "ski-bag");
    expect(free?.kind).toBe("included");
    expect(free?.amount_rappen).toBeNull();
    expect(free?.toggle).toBe(false);
    expect(priced?.kind).toBe("amount");
    expect(priced?.amount_rappen).toBe(100);
    expect(priced?.pricedInQuote).toBe(true);
    expect(extraFaresOn(catalog, () => true)).toEqual([]);
    expect(extraRappenOutsideLock(null, catalog, () => true)).toBe(0);
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
