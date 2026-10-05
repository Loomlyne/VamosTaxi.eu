// Security S5 (owner, 2026-10-05): the sign-up confirmation goes out before the address is confirmed, so it
// must not greet by the name the person at the form typed. Same layout as the mail for an account without a
// name, in all four languages, no new wording. Recovery, sign-in code and e-mail change keep their greeting.

import { describe, expect, it } from "vitest";
import { renderAuthEmail } from "./auth";

const LOCALES = ["en", "de", "fr", "ar"] as const;
const link = "https://vamostaxi.site/x";
const typed = { name: "Mallory Typedname", code: "123456", link };
const none = { name: "", code: "123456", link };

/** The greeting word of each language, from `email-hello` in messages.ts. */
const GREETING = { en: "Hello", de: "Hallo", fr: "Bonjour", ar: "مرحبا" } as const;

describe("sign-up confirmation mail: no greeting before the address is confirmed", () => {
  for (const locale of LOCALES) {
    it(`${locale}: the typed name appears nowhere (subject, html, text)`, () => {
      const out = renderAuthEmail("signup", locale, typed);
      for (const part of [out.subject, out.html, out.text]) {
        expect(part).not.toContain("Mallory");
        expect(part).not.toContain("Typedname");
      }
      expect(out.html).not.toContain(GREETING[locale]);
      expect(out.text).not.toContain(GREETING[locale]);
    });

    it(`${locale}: identical to the same mail for an account without a name`, () => {
      const withName = renderAuthEmail("signup", locale, typed);
      const without = renderAuthEmail("signup", locale, none);
      expect(withName).toEqual(without);
    });

    it(`${locale}: the link and the code are still in it`, () => {
      const out = renderAuthEmail("signup", locale, typed);
      expect(out.html).toContain(link);
      expect(out.html).toContain("123456");
      expect(out.text).toContain(link);
      expect(out.text).toContain("123456");
    });
  }

  it("a name made of markup or placeholders cannot reach the mail either", () => {
    const out = renderAuthEmail("signup", "de", { ...none, name: "<script>alert(1)</script> {name} $&" });
    expect(out.html).not.toContain("script");
    expect(out.html).not.toContain("{name}");
    expect(out.text).not.toContain("alert(1)");
  });

  for (const type of ["recovery", "otp", "email_change"] as const) {
    it(`${type} is unchanged: it still greets by name`, () => {
      for (const locale of LOCALES) {
        const out = renderAuthEmail(type, locale, typed);
        expect(out.html, `${type} ${locale} html`).toContain("Mallory Typedname");
        expect(out.text, `${type} ${locale} text`).toContain("Mallory Typedname");
        expect(out.html).toContain(GREETING[locale]);
      }
    });
  }
});
