import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../i18n/messages/ar.json";
import de from "../../i18n/messages/de.json";
import en from "../../i18n/messages/en.json";
import fr from "../../i18n/messages/fr.json";
import { PAY_OUTCOME_NOTICE, payOutcomeNoticeKey } from "./pay-outcome-notice";
import { PAY_OUTCOMES, parseTripQuery } from "./trip-url";

// J5 (W3-01): the zod enum, the return route's emitted values and the checkout's renderer agree.

describe("pay outcome: schema and renderer agree", () => {
  it("every outcome in the schema has a message, and every message belongs to an outcome", () => {
    expect(Object.keys(PAY_OUTCOME_NOTICE).sort()).toEqual([...PAY_OUTCOMES].sort());
  });

  it("every outcome parses from the URL and yields a notice (unknown no longer parses to null)", () => {
    for (const outcome of PAY_OUTCOMES) {
      const { trip } = parseTripQuery(new URLSearchParams(`pay=${outcome}`));
      expect(trip.pay, outcome).toBe(outcome);
      const key = payOutcomeNoticeKey(trip.pay, false);
      expect(key, outcome).toBeTruthy();
    }
    expect(parseTripQuery(new URLSearchParams("pay=bogus")).trip.pay).toBeNull();
    expect(payOutcomeNoticeKey(null, false)).toBeNull();
  });

  it("cancelled adds no second copy when the resume flow already shows the back notice", () => {
    expect(payOutcomeNoticeKey("cancelled", true)).toBeNull();
    expect(payOutcomeNoticeKey("cancelled", false)).toBe("backFromStripe");
    expect(payOutcomeNoticeKey("unknown", true)).toBe("payUnknownNotice");
  });

  const all = { en, de, fr, ar } as const;
  for (const locale of ["en", "de", "fr", "ar"] as const) {
    it(`${locale}: each outcome message is real text, carries the support address where it names one`, () => {
      const t = createTranslator({ locale, messages: all[locale], namespace: "checkout" });
      for (const outcome of PAY_OUTCOMES) {
        const out = String(t(PAY_OUTCOME_NOTICE[outcome], { email: "info@vamostaxi.site" }));
        expect(out.trim().length, outcome).toBeGreaterThan(10);
        expect(out).not.toContain("{email}");
      }
      expect(String(t("payUnknownNotice", { email: "info@vamostaxi.site" }))).toContain("info@vamostaxi.site");
      if (locale === "ar") expect(String(t("payUnknownNotice", { email: "x" }))).toMatch(/[\u0600-\u06FF]/);
      if (locale === "de") {
        for (const key of ["payUnknownNotice", "payUnpaidNotice", "payFailedNotice", "payCheckingTitle", "payCheckingBody", "payCheckingStalledBody", "payCheckingAgain"] as const) {
          expect(String(t(key, { email: "x" })), key).not.toContain("\u00df");
        }
      }
    });
  }
});
