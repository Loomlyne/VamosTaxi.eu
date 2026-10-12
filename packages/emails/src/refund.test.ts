import { describe, expect, it } from "vitest";
import { renderRefundEmail } from "./refund";

describe("renderRefundEmail fill", () => {
  it("keeps a name with a replacement pattern ($&) as typed", () => {
    const out = renderRefundEmail("en", "issued", { name: "Ada $& Lovelace", reference: "VT-26-0042" });
    expect(out.text).toContain("Thank you, Ada $& Lovelace. The refund for VT-26-0042");
  });

  it("does not fill a placeholder that sits inside the name", () => {
    const out = renderRefundEmail("en", "pending", { name: "{reference}", reference: "VT-26-0042" });
    expect(out.text).toContain("Thank you, {reference}. A refund for VT-26-0042 will be issued");
  });

  it("still fills name and reference for ordinary values in every language", () => {
    for (const locale of ["en", "de", "fr", "ar"] as const) {
      for (const kind of ["pending", "issued"] as const) {
        const out = renderRefundEmail(locale, kind, { name: "Ada Lovelace", reference: "VT-26-0042" });
        expect(out.text).toContain("Ada Lovelace");
        expect(out.text).toContain("VT-26-0042");
        expect(out.text).not.toContain("{");
      }
    }
  });
});

describe("renderRefundEmail phone reads left to right (261002 F1)", () => {
  const PHONE = "+41 79 626 70 82";
  const WRAPPED = `<span dir="ltr" style="unicode-bidi:isolate;direction:ltr;white-space:nowrap">${PHONE}</span>`;
  const data = { name: "Ada", reference: "VT-26-0042" };

  it("wraps every visible phone in the HTML, in every language", () => {
    for (const locale of ["en", "de", "fr", "ar"] as const) {
      for (const kind of ["pending", "issued"] as const) {
        const html = renderRefundEmail(locale, kind, data).html;
        expect(html).toContain(WRAPPED);
        expect(html.split(PHONE).length).toBe(html.split(WRAPPED).length);
      }
    }
  });

  it("Arabic text: the phone sits between LRI and PDI", () => {
    const text = renderRefundEmail("ar", "pending", data).text;
    expect(text.endsWith(`\n\n⁦${PHONE}⁩`)).toBe(true);
  });

  it("en/de/fr text keeps its layout (the J8 wording change aside)", () => {
    expect(renderRefundEmail("en", "pending", data).text).toBe(
      "Vamos Taxi\n\nA refund is on the way\n\nThank you, Ada. A refund for VT-26-0042 will be issued to the card you paid with.\n\n+41 79 626 70 82",
    );
    for (const locale of ["de", "fr"] as const) {
      const text = renderRefundEmail(locale, "issued", data).text;
      expect(text.endsWith(`\n\n${PHONE}`)).toBe(true);
      expect(text).not.toMatch(/[‎‏‪-‮⁦-⁩]/);
    }
  });
});


// J8 (W6-17): amount, card not bank account, no English fallback word.
describe("renderRefundEmail, customer money copy (J8, W6-17)", () => {
  const data = { name: "Ada", reference: "VT-26-0042" };
  const LOCALES = ["en", "de", "fr", "ar"] as const;

  it("the issued mail names the refunded amount, so a part refund does not read like a full one", () => {
    const full = renderRefundEmail("en", "issued", { ...data, amountRappen: 12345 }).text;
    const part = renderRefundEmail("en", "issued", { ...data, amountRappen: 6000 }).text;
    expect(full).toContain("The refund of CHF 123.45 for VT-26-0042 has been issued to the card you paid with.");
    expect(part).toContain("The refund of CHF 60.00 for VT-26-0042");
    expect(part).not.toContain("123.45");
  });

  it("the amount appears in every language and never as a placeholder", () => {
    for (const locale of LOCALES) {
      const out = renderRefundEmail(locale, "issued", { ...data, amountRappen: 1234567 });
      expect(out.text, locale).toContain("CHF 12'345.67");
      expect(out.text, locale).not.toContain("{");
    }
  });

  it("Arabic isolates the amount so it keeps its order inside the sentence", () => {
    const text = renderRefundEmail("ar", "issued", { ...data, amountRappen: 5000 }).text;
    expect(text).toContain("\u2066CHF 50.00\u2069");
  });

  it("no usable amount (absent, null, zero, negative, fractional): the sentence without an amount, never CHF 000", () => {
    for (const amountRappen of [undefined, null, 0, -5, 12.5, Number.NaN]) {
      const out = renderRefundEmail("en", "issued", { ...data, amountRappen });
      expect(out.text, String(amountRappen)).toContain("The refund for VT-26-0042 has been issued to the card you paid with.");
      expect(out.text, String(amountRappen)).not.toMatch(/CHF/);
    }
  });

  it("the pending mail carries no amount even when one is passed", () => {
    expect(renderRefundEmail("en", "pending", { ...data, amountRappen: 5000 }).text).not.toContain("CHF");
  });

  it("says card, never bank account, in all four languages and both kinds", () => {
    for (const locale of LOCALES) {
      for (const kind of ["pending", "issued"] as const) {
        const text = renderRefundEmail(locale, kind, { ...data, amountRappen: 5000 }).text;
        expect(text, `${locale} ${kind}`).not.toMatch(/bank account|Bankkonto|compte bancaire|الحساب المصرفي/i);
      }
    }
    expect(renderRefundEmail("de", "issued", data).text).toContain("auf die Karte ausgezahlt");
    expect(renderRefundEmail("fr", "issued", data).text).toContain("sur la carte avec laquelle vous avez payé");
    expect(renderRefundEmail("ar", "issued", data).text).toContain("البطاقة التي دفعت بها");
  });

  it("a blank name thanks without a name in each language: no English 'there', no empty comma", () => {
    for (const locale of LOCALES) {
      for (const name of ["", "   "]) {
        const text = renderRefundEmail(locale, "issued", { name, reference: "VT-26-0042", amountRappen: 5000 }).text;
        expect(text, locale).not.toMatch(/there|, \.|،/);
        expect(text, locale).not.toContain("{");
      }
    }
    expect(renderRefundEmail("de", "issued", { name: "", reference: "VT-26-0042" }).text).toContain("Danke. Die Rückerstattung");
    expect(renderRefundEmail("fr", "issued", { name: "", reference: "VT-26-0042" }).text).toContain("Merci. Le remboursement");
  });

  it("de keeps the Swiss spelling (no sharp s)", () => {
    for (const kind of ["pending", "issued"] as const) {
      expect(renderRefundEmail("de", kind, { ...data, amountRappen: 5000 }).text).not.toContain("\u00df");
    }
  });
});
