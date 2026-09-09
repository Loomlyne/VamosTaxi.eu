import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";

describe("confirmation unmock (D-40)", () => {
  it("does not map /confirmation to a DC mock", () => {
    const src = readFileSync(join(WEB_ROOT, "middleware.ts"), "utf8");
    const pages = src.match(/const DC_PAGES[\s\S]*?\n\};/);
    expect(pages?.[0]).toBeTruthy();
    expect(pages?.[0]).not.toMatch(/["']\/confirmation["']/);
    expect(pages?.[0]).not.toContain("confirmation.html");
  });

  it("does not invent a fake VT-5xxx on the confirmation page", () => {
    const page = readFileSync(
      join(WEB_ROOT, "app/[locale]/confirmation/[ref]/page.tsx"),
      "utf8",
    );
    const index = readFileSync(join(WEB_ROOT, "app/[locale]/confirmation/page.tsx"), "utf8");
    const client = readFileSync(
      join(WEB_ROOT, "app/[locale]/confirmation/[ref]/ConfirmationClient.tsx"),
      "utf8",
    );
    for (const src of [page, index, client]) {
      expect(src).not.toMatch(/VT-5\d{3}/);
      expect(src).not.toContain("confirmation.dc.html");
    }
    expect(index).toContain("notVisibleTitle");
  });
});
