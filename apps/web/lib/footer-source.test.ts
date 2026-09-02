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
const contactChannelsPath = "apps/web/lib/contact-channels.ts";

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

  it("publishes exactly the four owner-confirmed social destinations", () => {
    const socials = [
      "https://www.facebook.com/VAMOSTAXISWITZERLAND",
      "https://www.instagram.com/vamos.taxi?utm_source=qr",
      "https://www.youtube.com/@vamostaxi",
      "https://www.tiktok.com/@vamos.taxi",
    ];

    for (const path of footers) {
      const source = footerSource(path);
      expect(source).toContain('href="mailto:info@vamostaxi.site"');
      expect(source).toContain(">info@vamostaxi.site<");
      for (const social of socials) expect(source).toContain(social);
      expect(source).not.toContain('href="#"');
    }
  });

  it("uses the confirmed public number as a callable phone destination on every footer surface", () => {
    for (const path of footers) {
      expect(footerSource(path)).toContain('href="tel:+41796267082"');
      expect(footerSource(path)).not.toContain('tel:+417****7082');
    }

    const reactFooter = readFileSync(join(repoRoot, reactFooterPath), "utf8");
    const contactChannels = readFileSync(join(repoRoot, contactChannelsPath), "utf8");
    expect(reactFooter).toContain("PHONE_HREF,");
    expect(contactChannels).toContain('export const PHONE_HREF = "tel:+41796267082";');
    expect(contactChannels).not.toContain("tel:+417****7082");
  });
});
