import { describe, expect, it } from "vitest";
import { t } from "./t";

describe("t() placeholder fill", () => {
  it("keeps a value that carries a replacement pattern ($&) as typed", () => {
    expect(t("en", "payLink.subject", { reference: "A$&B" })).toBe("Pay for booking A$&B");
  });

  it("keeps a coupon code with $$ as typed", () => {
    expect(t("en", "money.voucher", { code: "SAVE$$10" })).toBe("Voucher SAVE$$10");
  });

  it("does not fill a placeholder that sits inside another value", () => {
    expect(
      t("en", "money.presented", { paid: "{currency}", currency: "EUR", received: "CHF 1.00" }),
    ).toBe("You paid {currency} in EUR. Vamos received CHF 1.00.");
  });

  it("still fills every placeholder for ordinary values", () => {
    expect(t("en", "money.presented", { paid: "EUR 12.00", currency: "EUR", received: "CHF 11.30" })).toBe(
      "You paid EUR 12.00 in EUR. Vamos received CHF 11.30.",
    );
    expect(t("de", "payLink.subject", { reference: "VT-26-0042" })).toContain("VT-26-0042");
    expect(t("en", "payLink.holdLine", { hours: 24 })).toContain("24");
  });

  it("leaves a placeholder without a value untouched", () => {
    expect(t("en", "payLink.subject")).toBe("Pay for booking {reference}");
  });
});
