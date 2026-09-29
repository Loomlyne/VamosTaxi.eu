// apps/web/tests/unit/locale-cookie.test.ts
//
// D-47 / G5: cookie validation and the middleware wiring, without a browser.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveCookieLocale } from "../../lib/locale-cookie";

const here = dirname(fileURLToPath(import.meta.url));
const middleware = readFileSync(join(here, "../../middleware.ts"), "utf8");
const shim = readFileSync(join(here, "../../lib/locale-shim.ts"), "utf8");
const dcRuntime = readFileSync(join(here, "../../../../app/vamos-locale.js"), "utf8");

describe("resolveCookieLocale", () => {
  it("accepts exactly en, de, fr, ar", () => {
    for (const l of ["en", "de", "fr", "ar"] as const) expect(resolveCookieLocale(l)).toBe(l);
  });
  it("falls back to en for anything else", () => {
    for (const bad of [undefined, null, "", "EN", "de-CH", "xx", "de/../x", "../de", " de", "de\n", "__proto__"]) {
      expect(resolveCookieLocale(bad as string | undefined)).toBe("en");
    }
  });
});

describe("middleware locale wiring", () => {
  it("rewrites from the validated cookie only on the public host, unprefixed, non-en", () => {
    expect(middleware).toMatch(/resolveCookieLocale\(request\.cookies\.get\(LOCALE_COOKIE\)\?\.value\)/);
    expect(middleware).toMatch(/!isDashboardHost\(request\)\s*&&\s*cookieLocale !== routing\.defaultLocale/);
    expect(middleware).toMatch(/localeRewriteResponse\(request, cookieLocale\)/);
  });
  it("keeps the 308 for prefixed URLs and the DC/api guards", () => {
    expect(middleware).toMatch(/NextResponse\.redirect\(url, 308\)/);
    expect(middleware).toContain("const mock = dcMockPath(pathname)");
    expect(middleware).toContain('matcher: ["/((?!api|_next|_vercel|.*\\\\..*).*)"]');
  });
  it("marks language-dependent responses", () => {
    expect(middleware).toMatch(/response\.headers\.append\("Vary", "Cookie"\)/);
    expect(middleware).toMatch(/languageVaries && resolveCookieLocale/);
  });
});

describe("writers", () => {
  it("shim sets the cookie and refreshes instead of requesting a prefixed URL", () => {
    expect(shim).toMatch(/writeLocaleCookie\(next\);\s*\n\s*router\.refresh\(\)/);
    expect(shim).toMatch(/writeLocaleCookie\(next\);\s*\n\s*activeRouter\.refresh\(\)/);
    expect(shim).not.toMatch(/\.replace\([^)]*locale:/);
  });
  it("home runtime mirrors the language into NEXT_LOCALE", () => {
    expect(dcRuntime).toMatch(/document\.cookie = 'NEXT_LOCALE=' \+ state\.lang/);
  });
});
