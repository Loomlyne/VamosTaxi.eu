// apps/web/components/consent/banner-contract.test.ts
//
// Wave 0 (10-01): D-05 two-button banner. CookieBanner.tsx lands in 10-04.
// Accept + Dismiss only. No Functional/Analytics/Marketing switches.
// Do not port CookieBanner.dc.html prefs modal. Dashboard has no banner.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("production cookie banner (D-05)", () => {
  it("is Accept and Dismiss only — no fake toggles", () => {
    const src = readRepo("apps/web/components/consent/CookieBanner.tsx");
    expect(src).toMatch(/Accept/);
    expect(src).toMatch(/Dismiss/);
    expect(src).toMatch(/accept_all/);
    expect(src).toMatch(/reject_all/);
    expect(src).not.toMatch(/save_choices/);
    expect(src).not.toMatch(/toggleFunctional|pFunctional/);
    expect(src).not.toMatch(/toggleAnalytics|pAnalytics/);
    expect(src).not.toMatch(/toggleMarketing|pMarketing/);
    expect(src).not.toMatch(/aria-label=["']Functional cookies["']/);
    expect(src).not.toMatch(/aria-label=["']Analytics cookies["']/);
    expect(src).not.toMatch(/aria-label=["']Marketing cookies["']/);
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
  });

  it("does not port the DC prefs modal Switch grid", () => {
    const src = readRepo("apps/web/components/consent/CookieBanner.tsx");
    expect(src).not.toMatch(/Manage preferences/);
    expect(src).not.toMatch(/from-global-scope.*Switch/);
  });
});

describe("banner hosts (D-07)", () => {
  it("dashboard / ops / dev scaffold skip the banner", () => {
    const src = readRepo("apps/web/components/shell/SiteShell.tsx");
    expect(src).toMatch(/banner/i);
    expect(src).toMatch(/isOps/);
    expect(src).toMatch(/isDevScaffold/);
  });
});
