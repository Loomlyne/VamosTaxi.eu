// Tag Manager is off since 2026-10-15 (.planning/decisions/2026-10-15-gtm-off.md): its adopted texts are kept
// unchanged but rendered only while the flag is on. One value in three files, pinned together.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { GTM_OPEN } from "./flag";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
const GTM_KEYS = ["gtmBanner", "gtmRow", "gtmPrivacyLine", "gtmProcessor"];

type Mock = Record<string, unknown> & { segments: (k: string, l: string) => unknown[]; gtmShown: boolean };
function loadTexts(shown: boolean): Mock {
  const win: { VamosMetaTexts?: Mock } = {};
  const src = read("app/vamos-meta-texts.js").replace(/var GTM_SHOWN = (true|false);/, `var GTM_SHOWN = ${shown};`);
  vm.runInNewContext(src, { window: win });
  return win.VamosMetaTexts!;
}

describe("Tag Manager texts follow the flag", () => {
  it("GTM_SHOWN, GTM_ON and GTM_OPEN are one value, and it is off", () => {
    const shown = /var GTM_SHOWN = (true|false);/.exec(read("app/vamos-meta-texts.js"))?.[1];
    const on = /var GTM_ON = (true|false);/.exec(read("app/vamos-google.js"))?.[1];
    expect(shown).toBe(String(GTM_OPEN));
    expect(on).toBe(String(GTM_OPEN));
    expect(GTM_OPEN).toBe(false);
  });

  it("mock, flag off: no Tag Manager text comes out; the adopted wording is still in the file", () => {
    const m = loadTexts(false);
    expect(m.gtmShown).toBe(false);
    for (const k of GTM_KEYS) {
      for (const l of ["en", "de", "fr", "ar"]) expect(m.segments(k, l), `${k} ${l}`).toEqual([]);
      expect((m[k] as Record<string, unknown[]>).en!.length, k).toBeGreaterThan(0);
    }
    expect(m.segments("banner", "en").length).toBeGreaterThan(0);
  });

  it("mock, flag on: the four texts come out", () => {
    const m = loadTexts(true);
    expect(m.gtmShown).toBe(true);
    for (const k of GTM_KEYS) expect(m.segments(k, "en"), k).toEqual((m[k] as Record<string, unknown[]>).en);
  });

  it("mock pages render the Tag Manager row, line, processor and banner sentence only on gtmShown", () => {
    const cookies = read("app/pages/cookies.dc.html");
    expect(cookies).toMatch(/<sc-if value="\{\{ gtmShown \}\}"[^>]*><tr data-cookies-row="1" data-cookies-gtm="1">[\s\S]*?<\/tr><\/sc-if>/);
    const privacy = read("app/pages/privacy.dc.html");
    expect(privacy).toMatch(/<sc-if value="\{\{ gtmShown \}\}"[^>]*><br>\{\{ gtmProcessor \}\}<\/sc-if>/);
    expect(privacy).toMatch(/<sc-if value="\{\{ gtmShown \}\}"[^>]*><p [^>]*data-privacy-gtm="1">[\s\S]*?<\/p><\/sc-if>/);
    for (const rel of ["app/pages/CookieBanner.dc.html", "app/home/CookieBanner.dc.html"]) {
      expect(read(rel), rel).toContain("window.VamosMetaTexts.gtmShown ? ' ' + this.segs('gtmBanner')");
    }
  });

  it("Next pages and banner render the Tag Manager texts only on GTM_OPEN", () => {
    const banner = read("apps/web/components/consent/CookieBanner.tsx").replace(/\s+/g, " ");
    expect(banner).toContain('{GTM_OPEN ? <> {t.rich("gtm-banner", {})}</> : null}');
    const cookies = read("apps/web/app/[locale]/cookies/page.tsx").replace(/\s+/g, " ");
    expect(cookies).toContain('{GTM_OPEN ? ( <p> {tCookies.rich("gtm-row"');
    const privacy = read("apps/web/app/[locale]/privacy/page.tsx").replace(/\s+/g, " ");
    expect(privacy).toContain('{GTM_OPEN ? ( <p> {t.rich("gtm-privacy-line"');
    expect(privacy).toContain('{GTM_OPEN ? ( <> <br /> {t("gtm-processor")} </>');
  });
});
