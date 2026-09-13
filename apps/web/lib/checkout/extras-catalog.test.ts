import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  catalogFromSurcharges,
  extraChipIcon,
  extraFaresOn,
  extraIsOn,
  extraIsOnForStep,
  extraRappenOutsideLock,
  extraUi,
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
    expect(extras.map((row) => row.code)).toEqual(["child_seat", "meet_greet", "extra_stop"]);
    expect(extras[0]?.amount_rappen).toBe(2000);
    expect(extras[0]?.toggle).toBe(true);
    expect(extras[1]?.kind).toBe("included");
    expect(extras[1]?.toggle).toBe(false);
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
  });

  it("lists a new published chip (pet, ski, unknown slug) and skips inactive", () => {
    const extras = catalogFromSurcharges([
      row({ code: "pet", amount_rappen: 1800 }),
      row({ code: "ski", amount_rappen: 2200 }),
      row({ code: "bike_rack", amount_rappen: 900 }),
      row({ code: "child_seat", amount_rappen: 2000, active: false }),
    ]);
    expect(extras.map((item) => item.code)).toEqual(["pet", "ski", "bike_rack"]);
    expect(extraChipIcon("bike_rack")).toBe("user");
    expect(extraChipIcon("ski")).toBe("snowflake");
  });

  it("public extras route still loads the live book", () => {
    const src = readFileSync(extrasRoute, "utf8");
    expect(src).toContain("preferDraft: false");
    expect(src).not.toMatch(/preferDraft:\s*true/);
    expect(src).toContain("vat_rate_bps: flags.vat_rate_bps");
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
});
