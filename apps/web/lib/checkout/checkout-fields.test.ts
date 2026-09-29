import { describe, expect, it } from "vitest";
import { e164Phone, isCheckoutEmail } from "./contact-validate";
import { geoLocale } from "./geo-locale";

describe("checkout contact helpers", () => {
  it("stores phone as plus plus digits", () => {
    expect(e164Phone("+971 50 975 8018")).toBe("+971509758018");
    expect(e164Phone("41796267082")).toBe("+41796267082");
    expect(e164Phone("")).toBe("");
  });

  it("refuses email without a dotted domain", () => {
    expect(isCheckoutEmail("koussayzayeni@gmail.com")).toBe(true);
    expect(isCheckoutEmail("name@host")).toBe(false);
    expect(isCheckoutEmail("not-an-email")).toBe(false);
  });

  it("maps a locale to a geo language and falls back to English", () => {
    expect(geoLocale("de")).toBe("de");
    expect(geoLocale("ar")).toBe("ar");
    expect(geoLocale("xx")).toBe("en");
  });
});
