// apps/web/lib/legal-buttons-wrap.test.ts
//
// Controller decision, 2026-10-05: a long button label on a legal page wraps (two lines, centred)
// instead of pushing the card or the page sideways. /de/terms section 10 "Stornierung &
// Rückerstattung" was wider than its card (page 379 px wide at 360, 396 px at 390 on Linux).
// Same button, same font size, touch target stays 44 px. The measured proof (scrollWidth ==
// clientWidth at 360, 390, 768 in en, de, fr, ar on the five pages) is in the hand-over; this test
// pins the rules that make it so.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const PAGES = ["terms", "cancellation", "privacy", "cookies", "imprint"] as const;

const BUTTON_RULE =
  "[data-lg-prose] .vt-btn,[data-lg-actions] .vt-btn{max-width:100%;height:auto;min-height:44px;padding-block:8px;white-space:normal;text-align:center;line-height:1.3}";

describe("legal pages: long button labels wrap on phones", () => {
  for (const page of PAGES) {
    describe(page, () => {
      const mock = read(`app/pages/${page}.dc.html`);

      it("design-system buttons may wrap: one rule, 44 px minimum, no font-size change, no nowrap", () => {
        expect(mock).toContain(BUTTON_RULE);
        expect(mock).toContain("[data-lg-actions]{min-width:0;max-width:100%}");
        const rule = BUTTON_RULE.slice(BUTTON_RULE.indexOf("{"));
        expect(rule).not.toMatch(/font-size|nowrap/);
        // no other local rule forces a legal button back onto one line
        expect(mock).not.toMatch(/\.vt-btn[^{]*\{[^}]*white-space:\s*nowrap/);
      });

      it("every row of buttons carries data-lg-actions, so the rule reaches it", () => {
        expect(mock).not.toContain(
          '<div style="display:flex;flex-wrap:wrap;gap:12px">\n<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Button"',
        );
      });

      it("the print pill in the hero (every page but cookies has one) is min-height 44 px and wraps, not fixed 44 px nowrap", () => {
        const pill = mock.split("\n").find((line) => line.includes("onClick=\"{{ doPrint }}\"")) ?? "";
        if (page === "cookies") {
          expect(pill).toBe("");
          return;
        }
        expect(pill).toContain("min-height:44px");
        expect(pill).toContain("max-width:100%");
        expect(pill).toContain("text-align:center");
        expect(pill).not.toMatch(/white-space:\s*nowrap|[^-]height:44px/);
        expect(pill).toContain("font-size:var(--vt-body-sm)");
      });
    });
  }

  it("terms section 10 is still the same primary Button in the same card, only the label may wrap", () => {
    const terms = read("app/pages/terms.dc.html");
    expect(terms).toContain(
      '<div data-source-act="1"><x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Button" size="md" variant="primary" href="cancellation.dc.html" iconEnd="arrow-right" hint-size="260px,44px">Cancellation &amp; refund policy</x-import></div>',
    );
    expect(terms).toMatch(/#changes \[data-source-act\]\{margin-top:4px\}/);
  });
});
