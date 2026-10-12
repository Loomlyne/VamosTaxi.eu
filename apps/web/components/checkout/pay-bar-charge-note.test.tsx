// J8 (W3-07): next to Total and PAY the page says what the card is charged, when the figure shown is converted.
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@/components/shell/ContactButton", () => ({
  ContactButton: () => <span data-contact-mock="docked" />,
}));

import { PayBar } from "./PayBar";

const base = { totalLabel: "Total", total: "EUR 92.00", payLabel: "Pay", payAmount: "EUR 92.00", loadingLabel: "Opening payment" } as const;

describe("PayBar charge note", () => {
  for (const variant of ["rail", "bar"] as const) {
    it(`${variant}: shown right after the Total and PAY row, before the reassurance line`, () => {
      const html = renderToString(
        <PayBar {...base} variant={variant} chargeNote="You are charged in Swiss francs (CHF)." reassurance="No charge until the Stripe page." />,
      );
      expect(html).toContain("data-co-charge-note");
      expect(html).toContain("You are charged in Swiss francs (CHF).");
      expect(html.indexOf("data-co-pay")).toBeLessThan(html.indexOf("data-co-charge-note"));
      expect(html.indexOf("data-co-charge-note")).toBeLessThan(html.indexOf("No charge until the Stripe page."));
    });

    it(`${variant}: absent when no note is passed (a CHF total needs none)`, () => {
      const html = renderToString(<PayBar {...base} total="CHF 000" payAmount="CHF 000" variant={variant} />);
      expect(html).not.toContain("data-co-charge-note");
    });
  }

  it("reuses the existing reassurance style: no new colour, no glow", () => {
    const html = renderToString(<PayBar {...base} variant="rail" chargeNote="x" />);
    expect(html).toContain('class="vt-copay__reassure" data-co-charge-note');
  });
});
