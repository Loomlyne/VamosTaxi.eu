import { describe, expect, it } from "vitest";
import { driverFromJson, manageExtrasFromJson, methodFromStored, moneyFromJson, telHref } from "./manage-money";

const lines = [
  { kind: "fare", code: "distance_fare", names: null, vat_rate_bps: null, amount_rappen: 9000 },
  { kind: "surcharge", code: "child-seat", names: { en: "Child seat", de: "Kindersitz" }, vat_rate_bps: null, amount_rappen: 1000 },
  { kind: "coupon", code: "coupon", names: null, vat_rate_bps: null, amount_rappen: -500 },
  { kind: "vat", code: "vat", names: null, vat_rate_bps: 81, amount_rappen: 770 },
];

describe("moneyFromJson", () => {
  it("keeps every line, names the child seat per language, and reports the EUR presentment", () => {
    const money = moneyFromJson({
      charged_rappen: 10270,
      payment_method_type: "card",
      presentment_amount_minor: 1100,
      presentment_currency: "eur",
      vehicle_class_name: "Van luxury",
      lines,
    })!;
    expect(money.lines).toHaveLength(4);
    expect(money.lines[1]!.labels).toEqual({ en: "Child seat", de: "Kindersitz", fr: "Child seat", ar: "Child seat" });
    expect(money.lines[1]!.amountRappen).toBe(1000);
    expect(money.lines[2]!.amountRappen).toBe(-500);
    expect(money.presentment).toEqual({ amountMinor: 1100, currency: "EUR" });
    expect(money.method).toBe("card");
    expect(money.className).toBe("Van luxury");
  });

  it("falls back to the humanised code when an extra has no names", () => {
    const money = moneyFromJson({
      charged_rappen: 1200,
      lines: [
        { kind: "fare", code: "distance_fare", amount_rappen: 200 },
        { kind: "surcharge", code: "pet_crate", names: null, amount_rappen: 1000 },
      ],
    })!;
    expect(money.lines[1]!.labels.de).toBe("Pet crate");
  });

  it("shows the total alone when the lines do not add up to the charge", () => {
    const money = moneyFromJson({ charged_rappen: 10271, lines })!;
    expect(money.lines).toEqual([]);
    expect(money.chargedRappen).toBe(10271);
  });

  it("has no presentment for CHF and none for a bad currency", () => {
    expect(moneyFromJson({ charged_rappen: 5, presentment_amount_minor: 5, presentment_currency: "CHF", lines: [] })!.presentment).toBeNull();
    expect(moneyFromJson({ charged_rappen: 5, presentment_amount_minor: 5, presentment_currency: "??", lines: [] })!.presentment).toBeNull();
  });

  it("returns null with no payment", () => {
    expect(moneyFromJson(null)).toBeNull();
    expect(moneyFromJson({ charged_rappen: 0, lines })).toBeNull();
  });

  // 261003: fare pieces and a voucher saved the way checkout writes them (coupon amount null).
  it("shows the fee, the route with its towns and a voucher as its discount; the lines still add up to the charge", () => {
    const money = moneyFromJson({
      charged_rappen: 4400,
      vehicle_class_name: "Business",
      lines: [
        { kind: "fare", code: "distance_fare", amount_rappen: 0, list_rappen: 4000, discount_rappen: null, origin: null, destination: null },
        { kind: "fare", code: "airport_fee", amount_rappen: 500, list_rappen: 1500, discount_rappen: null, origin: null, destination: null },
        { kind: "fare", code: "fixed_route", amount_rappen: 2500, list_rappen: null, discount_rappen: null, origin: "Zürich", destination: "Genève" },
        { kind: "surcharge", code: "child-seat", names: { en: "Child seat" }, amount_rappen: 1000, list_rappen: null, discount_rappen: null, origin: null, destination: null },
        { kind: "coupon", code: "WELCOME", amount_rappen: null, list_rappen: null, discount_rappen: 5000, origin: null, destination: null },
        { kind: "vat", code: "vat", vat_rate_bps: 81, amount_rappen: 400, list_rappen: null, discount_rappen: null, origin: null, destination: null },
      ],
    })!;
    expect(money.lines.map((l) => [l.code, l.amountRappen])).toEqual([
      ["distance_fare", 4000],
      ["airport_fee", 1500],
      ["fixed_route", 2500],
      ["child-seat", 1000],
      ["WELCOME", -5000],
      ["vat", 400],
    ]);
    expect(money.lines.reduce((s, l) => s + l.amountRappen, 0)).toBe(4400);
    expect(money.lines[2]).toMatchObject({ origin: "Zürich", destination: "Genève" });
    expect(money.lines[1]).toMatchObject({ origin: null, destination: null });
  });

  it("a booking saved before the change reads exactly as before (one Fare line, a negative legacy voucher)", () => {
    const money = moneyFromJson({ charged_rappen: 10270, lines })!;
    expect(money.lines.map((l) => [l.code, l.amountRappen, l.origin])).toEqual([
      ["distance_fare", 9000, null],
      ["child-seat", 1000, null],
      ["coupon", -500, null],
      ["vat", 770, null],
    ]);
  });
});

describe("methodFromStored", () => {
  it("names the known methods and treats old or unknown ones as null", () => {
    expect(methodFromStored("twint")).toBe("twint");
    expect(methodFromStored("apple_pay")).toBe("apple_pay");
    expect(methodFromStored("sepa_debit")).toBeNull();
    expect(methodFromStored(null)).toBeNull();
  });
});

describe("driverFromJson", () => {
  it("returns exactly the four fields, dropping anything else", () => {
    const driver = driverFromJson({ first_name: "Anna", phone: "+41 79 000 00 77", vehicle_model: "V-Class", plate: "ZH 1", surname: "Keller", photo: "x" });
    expect(driver).toEqual({ firstName: "Anna", phone: "+41 79 000 00 77", vehicleModel: "V-Class", plate: "ZH 1" });
  });
  it("is null when unassigned", () => {
    expect(driverFromJson(null)).toBeNull();
    expect(driverFromJson({ first_name: "" })).toBeNull();
  });
});

describe("manageExtrasFromJson / telHref", () => {
  it("survives a null payload", () => {
    expect(manageExtrasFromJson(null)).toEqual({ money: null, driver: null });
  });
  it("builds a tap-to-call link", () => {
    expect(telHref("+41 79 000 00 77")).toBe("tel:+41790000077");
    expect(telHref("n/a")).toBeNull();
  });
});
