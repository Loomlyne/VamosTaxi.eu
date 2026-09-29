import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const LINK_FILES = [
  "app/home/Services.dc.html",
  "app/home/SiteHeader.dc.html",
  "app/pages/SiteHeader.dc.html",
  "app/home/SiteFooter.dc.html",
  "app/pages/SiteFooter.dc.html",
  "apps/web/components/shell/SiteHeader.tsx",
  "apps/web/components/shell/SiteFooter.tsx",
  "apps/web/components/home/Services.tsx",
  "app/home/HowItWorks.dc.html",
];

describe("26.4 D-13/D-14 service links", () => {
  it.each(LINK_FILES)("%s has no service= query", (f) => {
    expect(read(f)).not.toContain("service=");
  });

  it("header and footer keep the service labels", () => {
    for (const f of ["app/home/SiteHeader.dc.html", "app/pages/SiteHeader.dc.html"]) {
      expect(read(f)).toMatch(/t\.airport/);
      expect(read(f)).toMatch(/t\.city/);
    }
    for (const f of ["app/home/SiteFooter.dc.html", "app/pages/SiteFooter.dc.html"]) {
      expect(read(f)).toContain("Airport transfers");
      expect(read(f)).toContain("City to city");
    }
    for (const f of ["apps/web/components/shell/SiteHeader.tsx", "apps/web/components/shell/SiteFooter.tsx"]) {
      expect(read(f)).toContain("airport-transfers");
      expect(read(f)).toContain("city-to-city");
    }
  });

  it("HowItWorks sends the destination only", () => {
    const s = read("app/home/HowItWorks.dc.html");
    expect(s).not.toContain("replaceState");
    const m = s.match(/const detail = (\{[^}]*\});\s*try \{\s*window\.dispatchEvent\(new CustomEvent\('vamos:dest-pick'/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/mode/);
    expect(m![1]).toContain("handled");
  });
});
