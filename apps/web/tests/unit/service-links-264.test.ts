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

  // Quick 261003: the destination rows moved from HowItWorks to WhereWeDrive, which also sends the
  // airport (From) so the booking card fills both ends. Still no mode switch and no URL rewrite.
  it("WhereWeDrive sends the airport and the destination, no mode", () => {
    expect(read("app/home/HowItWorks.dc.html")).not.toContain("vamos:dest-pick");
    const s = read("app/home/WhereWeDrive.dc.html");
    expect(s).not.toContain("replaceState");
    const m = s.match(/const detail = (\{[^}]*\});/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/mode/);
    expect(m![1]).toContain("handled");
    expect(m![1]).toContain("from:");
    expect(s).toContain("window.dispatchEvent(new CustomEvent('vamos:dest-pick'");
  });
});
