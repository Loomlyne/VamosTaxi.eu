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
const reactFooterPath = "apps/web/components/shell/SiteFooter.tsx";

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

  it("uses the confirmed public number as a callable phone destination on every footer surface", () => {
    for (const path of footers) {
      expect(footerSource(path)).toContain('href="tel:+41796267082"');
      expect(footerSource(path)).not.toContain('tel:+417****7082');
    }

    const reactFooter = readFileSync(join(repoRoot, reactFooterPath), "utf8");
    expect(reactFooter).toContain('const PHONE_HREF = "tel:+41796267082";');
    expect(reactFooter).not.toContain("tel:+417****7082");
  });
});
