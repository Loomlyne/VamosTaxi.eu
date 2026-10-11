// J6 (W2-01, W2-03): the new refusal codes have a message in four languages and are handled by the checkout.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../i18n/messages/ar.json";
import de from "../../i18n/messages/de.json";
import en from "../../i18n/messages/en.json";
import fr from "../../i18n/messages/fr.json";
import { CHECKOUT_REFUSALS, refuse } from "./errors";
import { MIN_CHARGE_RAPPEN } from "./checkout-charge";

const all = { en, de, fr, ar } as const;
const form = readFileSync(join(__dirname, "../../app/[locale]/checkout/CheckoutForm.tsx"), "utf8");

describe("J6 refusal codes", () => {
  it("are typed 409 refusals with no body detail beyond the code", async () => {
    for (const code of ["pickup_in_past", "pickup_too_soon", "amount_below_minimum"] as const) {
      expect(CHECKOUT_REFUSALS[code].status).toBe(409);
      const res = refuse(code);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ code });
    }
  });

  it("the minimum is 50 rappen, the owner's signed figure", () => {
    expect(MIN_CHARGE_RAPPEN).toBe(50);
  });

  it("the checkout handles each code and the messages exist in en, de, fr and ar", () => {
    for (const code of ["pickup_in_past", "pickup_too_soon", "amount_below_minimum"]) {
      expect(form, code).toContain(`"${code}"`);
    }
    for (const locale of ["en", "de", "fr", "ar"] as const) {
      const t = createTranslator({ locale, messages: all[locale], namespace: "checkout" });
      for (const key of ["pickupPassed", "pickupTooSoon"] as const) {
        expect(String(t(key)).trim().length, `${locale}.${key}`).toBeGreaterThan(10);
      }
      const money = String(t("amountBelowMinimum", { email: "info@vamostaxi.site" }));
      expect(money).toContain("info@vamostaxi.site");
      if (locale === "ar") expect(money).toMatch(/[\u0600-\u06FF]/);
      if (locale === "de") expect(`${t("pickupPassed")}${t("pickupTooSoon")}${money}`).not.toContain("\u00df");
    }
  });
});
