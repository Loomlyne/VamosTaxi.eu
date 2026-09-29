import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const SENTENCES = {
  en: "The pay link was not sent. The booking is saved. Send the link again.",
  de: "Der Zahllink wurde nicht gesendet. Die Buchung ist gespeichert. Senden Sie den Link erneut.",
  fr: "Le lien de paiement n'a pas été envoyé. La réservation est enregistrée. Renvoyez le lien.",
  ar: "لم يُرسل رابط الدفع. الحجز موجود. أعد إرسال الرابط.",
} as const;

function checkout(locale: keyof typeof SENTENCES): Record<string, string> {
  const raw = readFileSync(join(here, `../../i18n/messages/${locale}.json`), "utf8");
  return JSON.parse(raw).checkout as Record<string, string>;
}

describe("checkout.emailFailed", () => {
  for (const locale of ["en", "de", "fr", "ar"] as const) {
    it(`${locale} is the email-failed sentence, not payCouldNotStart`, () => {
      const copy = checkout(locale);
      expect(copy.emailFailed).toBe(SENTENCES[locale]);
      expect(copy.emailFailed).not.toBe(copy.payCouldNotStart);
      expect(copy.emailFailed).not.toContain("CHF");
    });
  }

  it("German has no ß", () => {
    expect(checkout("de").emailFailed).not.toContain("ß");
  });
});
