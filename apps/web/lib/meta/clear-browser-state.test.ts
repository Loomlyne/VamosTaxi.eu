import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMetaBrowserState, clearMetaUnlessMarketingOn, cookieDomainForms } from "./clear-browser-state";

const here = dirname(fileURLToPath(import.meta.url));
const banner = readFileSync(join(here, "../../components/consent/CookieBanner.tsx"), "utf8");

describe("clearMetaBrowserState (CR-01 a)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists host-only and every parent form", () => {
    expect(cookieDomainForms("vamostaxi.site")).toEqual(["", ".vamostaxi.site"]);
    expect(cookieDomainForms("dashboard.vamostaxi.site")).toEqual(["", ".vamostaxi.site", ".dashboard.vamostaxi.site"]);
  });

  it("ends the three cookies in both domain forms and removes both storage keys, writing no value", () => {
    const writes: string[] = [];
    const removed: string[] = [];
    vi.stubGlobal("document", {
      set cookie(v: string) {
        writes.push(v);
      },
      get cookie() {
        return "";
      },
    });
    vi.stubGlobal("window", {
      location: { hostname: "vamostaxi.site" },
      localStorage: { removeItem: (k: string) => removed.push(k) },
    });
    clearMetaBrowserState();
    for (const n of ["_fbp", "_fbc", "_fbleid"]) {
      expect(writes).toContain(`${n}=; Max-Age=0; path=/`);
      expect(writes).toContain(`${n}=; Max-Age=0; path=/; domain=.vamostaxi.site`);
    }
    expect(writes.every((w) => w.includes("Max-Age=0"))).toBe(true);
    expect(removed.sort()).toEqual(["aemSource", "multiFbc"]);
  });
});

// M1 (adopted 2026-10-16, .planning/decisions/2026-10-16-google-advanced-consent-wording.md): Meta's page view and
// its cookies _fbp / _fbc are for every visitor now, so the React banner no longer deletes them on a refusal; the
// helpers above stay as they are (the mock loader still deletes while the legal gate is closed).
describe("the React banner no longer calls it (M1 replaces CR-01 a)", () => {
  it("not after a successful save with Marketing off", () => {
    const at = banner.indexOf("if (result.ok) {");
    expect(at).toBeGreaterThan(-1);
    const block = banner.slice(at, banner.indexOf("return;", at));
    expect(block).not.toContain("clearMetaBrowserState");
    expect(block).toContain("M1 (2026-10-16)");
  });
  it("and not on load for any server answer (behaviour: components/consent/banner-meta-clear.test.ts)", () => {
    expect(banner).not.toContain("clearMetaUnlessMarketingOn(");
    expect(banner).not.toContain("clearMetaBrowserState(");
    expect(banner).not.toContain("@/lib/meta/clear-browser-state");
  });
});

describe("clearMetaUnlessMarketingOn (review 2 item 1)", () => {
  const cases: [string, Parameters<typeof clearMetaUnlessMarketingOn>[0], boolean][] = [
    ["no choice recorded", { chosen: false }, true],
    ["chosen without a choice body", { chosen: true }, true],
    ["Marketing off", { chosen: true, choice: { marketing: false } }, true],
    ["Marketing missing", { chosen: true, choice: {} }, true],
    ["Marketing on", { chosen: true, choice: { marketing: true } }, false],
    ["a choice body but chosen false", { chosen: false, choice: { marketing: true } }, true],
  ];
  for (const [name, reply, clears] of cases) {
    it(`${name}: ${clears ? "clears" : "keeps"}`, () => {
      const clear = vi.fn();
      clearMetaUnlessMarketingOn(reply, clear);
      expect(clear).toHaveBeenCalledTimes(clears ? 1 : 0);
    });
  }
});
