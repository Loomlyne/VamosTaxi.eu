import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const footers = [
  "app/pages/SiteFooter.dc.html",
  "app/home/SiteFooter.dc.html",
] as const;

function footerSource(path: (typeof footers)[number]): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("DC footer source", () => {
  it("forces link and social-glyph hover colours above inline declarations", () => {
    for (const path of footers) {
      const source = footerSource(path);

      expect(source).toContain('style="color:rgb(255 255 255 / .84);');
      expect(source).toContain('style="display:block;width:26px;height:26px;background:var(--vt-text-inverse-muted);');
      expect(source).toContain(
        "[data-ft-link]:not([data-split]):hover{color:var(--vt-accent)!important}",
      );
      expect(source).toContain(
        "[data-ft-soc]:hover [data-ft-glyph]{background:var(--vt-accent)!important}",
      );
    }
  });
});
