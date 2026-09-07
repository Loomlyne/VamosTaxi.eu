import { describe, expect, it } from "vitest";
import { e164Phone, isCheckoutEmail } from "./contact-validate";
import { placeText } from "./vamos-trip";

describe("checkout contact + rail helpers", () => {
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

  it("prefers the stored full address on the rail", () => {
    expect(placeText({ text: "Zurich HB", s: "8001 Zürich, Switzerland" }, "Zurich HB")).toBe(
      "Zurich HB, 8001 Zürich, Switzerland",
    );
    expect(placeText({ text: "The Dolder Grand, Zurich" }, "short")).toBe("The Dolder Grand, Zurich");
    expect(placeText(null, "Zurich HB")).toBe("Zurich HB");
  });
});
