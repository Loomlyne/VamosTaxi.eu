import { describe, expect, it } from "vitest";
import { CHARGE_CURRENCY, stripeLocale } from "./currency";

describe("checkout currency", () => {
  it("charges CHF only — no FX table", () => {
    expect(CHARGE_CURRENCY).toBe("chf");
  });

  it("maps the four Vamos locales through to Stripe", () => {
    expect(stripeLocale("en")).toBe("en");
    expect(stripeLocale("de")).toBe("de");
    expect(stripeLocale("fr")).toBe("fr");
    expect(stripeLocale("ar")).toBe("ar");
  });
});
