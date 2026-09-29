import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../i18n/messages/ar.json";
import de from "../../i18n/messages/de.json";
import en from "../../i18n/messages/en.json";
import fr from "../../i18n/messages/fr.json";
import { CONFIRMING_MS, confirmationPhase } from "./confirmation-phase";

describe("confirmationPhase (D-27)", () => {
  it("confirmed or assigned is booked at any elapsed time", () => {
    for (const status of ["confirmed", "assigned"]) {
      for (const elapsedMs of [0, 5000, 60_000]) {
        expect(confirmationPhase({ elapsedMs, status, paymentStatus: null })).toBe("booked");
      }
    }
  });

  it("a captured payment is booked", () => {
    expect(confirmationPhase({ elapsedMs: 1000, status: "pending", paymentStatus: "succeeded" })).toBe("booked");
  });

  it("pending or paid before 20 s is confirming, after is received", () => {
    for (const status of ["pending", "paid", "quote"]) {
      expect(confirmationPhase({ elapsedMs: 0, status, paymentStatus: null })).toBe("confirming");
      expect(confirmationPhase({ elapsedMs: CONFIRMING_MS - 1, status, paymentStatus: null })).toBe("confirming");
      expect(confirmationPhase({ elapsedMs: CONFIRMING_MS, status, paymentStatus: null })).toBe("received");
    }
  });

  it("not visible yet is confirming, then received, never an error", () => {
    expect(confirmationPhase({ elapsedMs: 3000, status: null, paymentStatus: null })).toBe("confirming");
    expect(confirmationPhase({ elapsedMs: 25_000, status: "", paymentStatus: null })).toBe("received");
  });

  it("a failed payment on the return path still never shows error copy", () => {
    expect(confirmationPhase({ elapsedMs: 1000, status: "pending", paymentStatus: "failed" })).toBe("confirming");
    expect(confirmationPhase({ elapsedMs: 30_000, status: "pending", paymentStatus: "failed" })).toBe("received");
  });

  it("a cancelled or refunded booking is hidden from the return path", () => {
    for (const status of ["cancelled", "refunded", "no_show"]) {
      expect(confirmationPhase({ elapsedMs: 0, status, paymentStatus: null })).toBe("hidden");
    }
  });
});

describe("post-payment strings in four languages (D-27, D-28)", () => {
  const all = { en, de, fr, ar } as const;
  const plain = [
    "confirmingTitle",
    "confirmingBody",
    "receivedTitle",
    "receivedBody",
    "statusBooked",
    "bookedTitleNoName",
    "factWhen",
    "factTravellers",
    "factClass",
    "receiptFarePlain",
    "receiptVatPlain",
    "receiptTotalPaid",
  ] as const;

  for (const locale of ["en", "de", "fr", "ar"] as const) {
    it(`${locale}: every post-payment string formats and is non-empty`, () => {
      const t = createTranslator({ locale, messages: all[locale], namespace: "checkout" });
      for (const key of plain) expect(String(t(key)).trim(), key).not.toBe("");
      expect(t("receivedContact", { email: "info@vamostaxi.site" })).toContain("info@vamostaxi.site");
      expect(t("bookedTitle", { firstName: "Ana" })).toContain("Ana");
      expect(t("receiptFare", { class: "Economy" })).toContain("Economy");
      expect(t("receiptVat", { rate: "8.1" })).toContain("8.1");
      expect(t("receiptVoucher", { code: "SAVE" })).toContain("SAVE");
      const tag = (chunks: unknown) => `[${String(chunks)}]`;
      const lede = String(t.rich("bookedLede", { reference: "VT-26-0001", email: "a@b.ch", ref: tag, mail: tag } as never));
      expect(lede).toContain("[VT-26-0001]");
      expect(lede).toContain("[a@b.ch]");
      const noMail = String(t.rich("bookedLedeNoEmail", { reference: "VT-26-0001", ref: tag } as never));
      expect(noMail).toContain("[VT-26-0001]");
      const pres = String(
        t.rich("receiptPresentment", { paid: "EUR 10", currency: "EUR", received: "CHF 000", fig: tag } as never),
      );
      expect(pres).toContain("[EUR 10]");
      expect(pres).toContain("[CHF 000]");
    });
  }

  it("de uses ss, never the sharp s", () => {
    const t = createTranslator({ locale: "de", messages: de, namespace: "checkout" });
    for (const key of plain) expect(String(t(key))).not.toContain("\u00df");
  });

  it("ar copy is Arabic script", () => {
    const t = createTranslator({ locale: "ar", messages: ar, namespace: "checkout" });
    expect(String(t("confirmingTitle"))).toMatch(/[\u0600-\u06FF]/);
    expect(String(t("receivedTitle"))).toMatch(/[\u0600-\u06FF]/);
  });
});
