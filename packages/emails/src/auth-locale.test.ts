// 26.2 (unit 09, finding 5): the sign-in mails carried three English strings in every
// language: the greeting, the footer line and the code label.

import { describe, expect, it } from "vitest";
import { renderAuthEmail } from "./auth";

const ENGLISH = ["Hello Anna.", "This link works once and expires after 1 hour.", "Or enter this code"];
const data = { name: "Anna", code: "123456", link: "https://vamostaxi.site/x" };

describe("sign-in mails speak one language", () => {
  for (const locale of ["de", "fr", "ar"] as const) {
    it(`${locale}: no English greeting, footer or code label`, () => {
      const out = renderAuthEmail("otp", locale, data);
      for (const phrase of ENGLISH) {
        expect(out.html, phrase).not.toContain(phrase);
        expect(out.text, phrase).not.toContain(phrase);
      }
      expect(out.html).not.toContain("ß");
      expect(out.html).toContain("Anna");
      expect(out.text).toContain("Anna");
      expect(out.html).toContain("+41 79 626 70 82");
      expect(out.text).toContain("+41 79 626 70 82");
    });
  }

  it("en: greeting, footer and code label read as before", () => {
    const out = renderAuthEmail("otp", "en", data);
    for (const phrase of ENGLISH) expect(out.html).toContain(phrase);
    expect(out.text).toContain("Hello Anna.");
    expect(out.text).toContain("This link works once and expires after 1 hour.\n+41 79 626 70 82");
  });

  it("a name with $ sequences is printed as typed", () => {
    const out = renderAuthEmail("otp", "de", { ...data, name: "Ada $& $'" });
    expect(out.text).toContain("Ada $& $'");
  });
});
