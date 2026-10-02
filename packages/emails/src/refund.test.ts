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

  it("en/de/fr text is byte for byte what it was", () => {
    expect(renderRefundEmail("en", "pending", data).text).toBe(
      "Vamos Taxi\n\nA refund is on the way\n\nThank you, Ada. A refund for VT-26-0042 will be issued to the bank account used for this booking.\n\n+41 79 626 70 82",
    );
    for (const locale of ["de", "fr"] as const) {
      const text = renderRefundEmail(locale, "issued", data).text;
      expect(text.endsWith(`\n\n${PHONE}`)).toBe(true);
      expect(text).not.toMatch(/[‎‏‪-‮⁦-⁩]/);
    }
  });
});
