// apps/web/components/consent/banner-contract.test.ts
//
// Phase 27: the Next banner is the mock banner (three controls + four-row sheet).
// Dashboard / ops have no banner.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

function block(src: string, start: string): string {
  const i = src.indexOf(start);
  expect(i, start).toBeGreaterThan(-1);
  return src.slice(i, i + 1200);
}

describe("production cookie banner (27 contract, D-04 D-09)", () => {
  const src = readRepo("apps/web/components/consent/CookieBanner.tsx");

  it("has three controls and a four-row sheet with Save choices", () => {
    expect(src).toContain('t("accept-all")');
    expect(src).toContain('t("necessary-only")');
    expect(src).toContain('t("manage-preferences")');
    expect(src).toContain('t("save-choices")');
    expect(src).toContain("<Switch");
    for (const key of ["necessary", "functional", "analytics", "marketing"]) {
      expect(src, key).toContain(`key: "${key}"`);
    }
    expect(src).toContain('t.rich("meta-row"');
    expect(src).not.toContain("PendingSlot");
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
  });

  it("reads state from the server and never paints before the answer", () => {
    expect(src).toContain("/api/consent/state");
    expect(src).toContain('cache: "no-store"');
    expect(src).toMatch(/mode === "unknown"\) return null/);
  });

  it("Turnstile is only rendered for a choice with Meta on", () => {
    expect(src.match(/<TurnstileWidget/g)).toHaveLength(1);
    expect(src).toMatch(/if \(!chosen\.marketing\)/);
    const refuse = block(src, "const necessaryOnly");
    expect(refuse).not.toContain("Turnstile");
    expect(refuse).toContain('"reject_all"');
  });

  it("the footer event only opens the sheet: no write", () => {
    const handler = block(src, "function onPrefs()");
    const end = handler.indexOf("function onRecorded");
    const onPrefs = handler.slice(0, end);
    expect(onPrefs).toContain("setSheetOpen(true)");
    expect(onPrefs).not.toMatch(/fetch\(|postConsentRecord\(/);
    const button = block(src, "export function CookieSettingsChangeButton");
    const btnEnd = button.indexOf("function writeCache");
    const btn = button.slice(0, btnEnd > 0 ? btnEnd : undefined);
    expect(btn).toContain("PREFS_EVENT");
    expect(src).toContain('const PREFS_EVENT = "vamos:cookie-prefs"');
    expect(btn).not.toMatch(/fetch\(|postConsentRecord\(/);
    expect(src).not.toContain("export function CookiePrefsListener");
  });

  it("writes the three categories to /api/consent", () => {
    expect(src).toMatch(/functional: input\.functional/);
    expect(src).toMatch(/analytics: input\.analytics/);
    expect(src).toMatch(/marketing: input\.marketing/);
    expect(src).not.toContain("rate_limited");
  });
});

describe("banner hosts (D-07)", () => {
  it("dashboard / ops / dev scaffold skip the banner", () => {
    const src = readRepo("apps/web/components/shell/SiteShell.tsx");
    expect(src).toMatch(/banner/i);
    expect(src).toMatch(/isOps/);
    expect(src).toMatch(/isDevScaffold/);
  });

  it("renders the banner wherever the footer renders", () => {
    const src = readRepo("apps/web/components/shell/SiteShell.tsx");
    expect(src).not.toMatch(/isHome \? banner/);
    expect(src).toMatch(/\{banner\}/);
  });
});
