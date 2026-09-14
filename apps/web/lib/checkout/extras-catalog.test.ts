import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  catalogFromSurcharges,
  extraAmountTimesQty,
  extraChipIcon,
  extraFaresOn,
  extraIsOn,
  extraIsOnForStep,
  extraRappenOutsideLock,
  extraUi,
  airportPickupFromPlace,
  capExtraStops,
  publishedMaxExtraStops,
  recapExtraFares,
  recapExtras,
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
      "free_wait",
    ]);
    expect(extras[0]?.amount_rappen).toBe(2000);
    expect(extras[0]?.toggle).toBe(true);
    expect(extras[1]?.kind).toBe("included");
    expect(extras[1]?.toggle).toBe(false);
    expect(extras.find((item) => item.code === "free_wait")?.toggle).toBe(false);
    expect(extraUi("night")).toBeNull();
  });

  it("omits a surcharge after it is deleted from the published book", () => {
    const live = catalogFromSurcharges([
      row({ code: "child_seat", amount_rappen: 2000 }),
      row({ code: "pet", amount_rappen: 1500 }),
    ]);
    expect(live.map((item) => item.code)).toEqual(["child_seat", "pet", "free_wait"]);
    const afterDelete = catalogFromSurcharges([row({ code: "child_seat", amount_rappen: 2000 })]);
    expect(afterDelete.map((item) => item.code)).toEqual(["child_seat", "free_wait"]);
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
    expect(extras.map((item) => item.code)).toEqual(["child_seat", "free_wait"]);
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
    expect(extras.map((item) => item.code)).toEqual(["pet", "ski", "bike_rack", "free_wait"]);
    expect(extraChipIcon("bike_rack")).toBe("user");
    expect(extraChipIcon("ski")).toBe("snowflake");
  });

  it("public extras route still loads the live book", () => {
    const src = readFileSync(extrasRoute, "utf8");
    expect(src).toContain("preferDraft: false");
    expect(src).not.toMatch(/preferDraft:\s*true/);
    expect(src).toContain("vat_rate_bps: flags.vat_rate_bps");
    expect(src).toContain("max_extra_stops: maxStops");
    expect(src).toContain("publishedMaxExtraStops");
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

  it("does not price extras on /checkout/trip", () => {
    const on = {
      childSeat: true,
      oversized: true,
      extraStop: true,
      skiRack: true,
      extraCodes: [],
    };
    expect(extraIsOnForStep("trip", "child_seat", on)).toBe(false);
    expect(extraIsOnForStep("details", "child_seat", on)).toBe(true);
    expect(extraIsOnForStep("payment", "child_seat", on)).toBe(true);
    expect(extraIsOn("pet", { ...on, extraCodes: ["pet"] })).toBe(true);
  });

  it("exposes meet & greet and free wait as two default-on cards (D-38)", () => {
    const catalog = catalogFromSurcharges([
      {
        code: "meet_greet",
        kind: "included",
        amount_rappen: null,
        percent: null,
        active: true,
      },
    ]);
    expect(extraUi("meet_greet")?.toggle).toBe(false);
    expect(extraUi("free_wait")?.toggle).toBe(false);
    const meet = catalog.find((item) => item.code === "meet_greet");
    const wait = catalog.find((item) => item.code === "free_wait");
    expect(meet?.toggle).toBe(false);
    expect(wait?.kind).toBe("included");
    expect(wait?.toggle).toBe(false);
    const defaults = {
      childSeat: false,
      oversized: false,
      extraStop: false,
      skiRack: false,
      extraCodes: [],
    };
    expect(extraIsOn("meet_greet", defaults)).toBe(true);
    expect(extraIsOn("meet_greet", { ...defaults, meetGreet: false })).toBe(true);
    expect(extraIsOn("free_wait", defaults)).toBe(false);
    expect(extraIsOn("free_wait", { ...defaults, airportPickup: true })).toBe(true);
    expect(extraIsOn("free_wait", { ...defaults, airportPickup: false })).toBe(false);
    expect(
      extraIsOn("free_wait", { ...defaults, airportPickup: true, freeWait: false }),
    ).toBe(true);
    expect(
      recapExtras(catalog, (code) => extraIsOn(code, { ...defaults, meetGreet: false })),
    ).toEqual([
      expect.objectContaining({ code: "meet_greet" }),
    ]);
    const restored = recapExtras(
      catalog,
      (code) => extraIsOn(code, { ...defaults, airportPickup: true, meetGreet: true }),
    );
    expect(restored.map((row) => row.code)).toEqual(["meet_greet", "free_wait"]);
    expect(extraIsOnForStep("trip", "meet_greet", { ...defaults, meetGreet: false })).toBe(
      true,
    );
    expect(
      extraIsOnForStep("details", "free_wait", { ...defaults, airportPickup: true }),
    ).toBe(true);
    expect(airportPickupFromPlace({ zone_type: "airport" })).toBe(true);
    expect(airportPickupFromPlace({ zone_type: "city" })).toBe(false);
    expect(airportPickupFromPlace(null)).toBeUndefined();
  });
});
