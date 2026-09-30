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
