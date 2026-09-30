// apps/web/components/consent/reserve-and-footer.test.ts
//
// Phase 27 (D-10, D-33, UI-SPEC reserve rules): the footer link only opens the sheet, and
// the sticky PAY bar and the contact button ride above the banner.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

describe("footer cookie preferences link", () => {
  const footer = read("apps/web/components/shell/SiteFooter.tsx");

  it("has no listener mount and no write path", () => {
    expect(footer).not.toContain("CookiePrefsListener");
    expect(footer).not.toContain("postConsentRecord");
    expect(footer).not.toContain("fetch(");
  });

  it("still dispatches the open event", () => {
    expect(footer).toContain('new Event("vamos:cookie-prefs")');
  });

  it("CookieBanner no longer exports the inert listener", () => {
    expect(read("apps/web/components/consent/CookieBanner.tsx")).not.toContain(
      "export function CookiePrefsListener",
    );
  });
});

describe("reserve above the banner", () => {
  it("the PAY bar offsets by --vt-ck-reserve", () => {
    const css = read("apps/web/app/[locale]/checkout/checkout.css");
    const start = css.indexOf(".vt-co__bar {");
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).toContain("inset-block-end: var(--vt-ck-reserve, 0px)");
  });

  it("the contact button offsets by --vt-ck-reserve", () => {
    expect(read("apps/web/components/shell/ContactFab.css")).toContain(
      "calc(24px + var(--vt-ck-reserve, 0px))",
    );
  });

  it("the banner pads the body by the reserve", () => {
    expect(read("apps/web/components/consent/CookieBanner.css")).toContain(
      "padding-block-end: var(--vt-ck-reserve",
    );
  });
});
