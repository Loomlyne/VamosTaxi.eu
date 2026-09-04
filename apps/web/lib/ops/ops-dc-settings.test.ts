// apps/web/lib/ops/ops-dc-settings.test.ts
//
// File proofs for 06-09 DC wiring + D-12. No Hyperdrive.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("06-09 settings/roster/profile JSON", () => {
  it("settings PATCH SQL does not write settings_versions", () => {
    const src = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/settings/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/update public\.settings set/);
    expect(src).not.toMatch(/update\s+public\.settings_versions/i);
    expect(src).not.toMatch(/insert\s+into\s+public\.settings_versions/i);
    expect(src).toMatch(/loadCurrentPolicyVersion/);
  });

  it("roster PATCH uses withAdmin", () => {
    const src = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/roster/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/export const PATCH = withAdmin/);
    expect(src).toMatch(/access !== "ok"/);
  });

  it("profile PATCH is self-scoped", () => {
    const src = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/profile/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/updateOwnProfile/);
    expect(src).toMatch(/staff_update_self/);
  });

  it("dual-mounts re-export locale handlers", () => {
    expect(readFileSync(join(webRoot, "app/api/staff/settings/route.ts"), "utf8")).toMatch(
      /export\s*\{\s*GET,\s*PATCH\s*\}/,
    );
    expect(readFileSync(join(webRoot, "app/api/staff/roster/route.ts"), "utf8")).toMatch(
      /export\s*\{\s*GET,\s*PATCH\s*\}/,
    );
    expect(readFileSync(join(webRoot, "app/api/staff/profile/route.ts"), "utf8")).toMatch(
      /export\s*\{\s*PATCH\s*\}/,
    );
  });
});

describe("06-09 DC mocks", () => {
  it("OpsSettings/OpsProfile/OpsSidebar fetch absolute staff APIs", () => {
    const settings = read("app/ops/OpsSettings.dc.html");
    const profile = read("app/ops/OpsProfile.dc.html");
    const sidebar = read("app/ops/OpsSidebar.dc.html");
    expect(settings).toMatch(/\/api\/staff\/settings/);
    expect(settings).toMatch(/\/api\/staff\/profile/);
    expect(settings).toMatch(/\/api\/staff\/invite/);
    expect(settings).toMatch(/\/api\/staff\/me/);
    expect(profile).toMatch(/\/api\/staff\/profile/);
    expect(profile).toMatch(/\/api\/staff\/me/);
    expect(sidebar).toMatch(/\/api\/staff\/me/);
    expect(settings).toMatch(/\/api\/auth/);
    expect(profile).toMatch(/\/api\/auth/);
    expect(sidebar).toMatch(/\/api\/auth/);
  });

  it("D-12: dispatcher omits #pricing and #staff from the painted nav", () => {
    const sidebar = read("app/ops/OpsSidebar.dc.html");
    expect(sidebar).toMatch(/const NAV_ADMIN = \[/);
    expect(sidebar).toMatch(/href:'#pricing'/);
    expect(sidebar).toMatch(/key:'staff'/);
    expect(sidebar).toMatch(/href:'#staff'/);
    expect(sidebar).not.toMatch(/key:'staff-roster'/);
    const bottom = sidebar.match(/const NAV_BOTTOM = \[[\s\S]*?\];/);
    expect(bottom?.[0] ?? "").not.toMatch(/#pricing|#staff/);
    expect(sidebar).toMatch(/role === 'admin'/);
    expect(sidebar).toMatch(/navBottomSrc\.map\(paint\)/);
    expect(sidebar).not.toMatch(/aria-disabled/);
  });

  it("sign out lands on /login and clears vamosOpsAuth", () => {
    const settings = read("app/ops/OpsSettings.dc.html");
    const profile = read("app/ops/OpsProfile.dc.html");
    const sidebar = read("app/ops/OpsSidebar.dc.html");
    for (const src of [settings, profile, sidebar]) {
      expect(src).toMatch(/removeItem\('vamosOpsAuth'\)/);
      expect(src).toMatch(/location\.replace\('\/login'\)/);
    }
  });

  it("enrols a passkey with Supabase's create and verify ceremony without promising removal", () => {
    const settings = read("app/ops/OpsSettings.dc.html");
    expect(settings).toMatch(/action:\s*'passkey-register-start'/);
    expect(settings).toMatch(/navigator\.credentials\.create\(\{ publicKey: decodeCreate\(start\.options\) \}\)/);
    expect(settings).toMatch(/action:\s*'passkey-register-verify'/);
    expect(settings).toMatch(/credential:\s*serializeCreate\(credential\)/);
    expect(settings).toMatch(/function serializeCreate\(cred\)/);
    expect(settings).toMatch(/attestationObject:\s*bufToB64url\(r\.attestationObject\)/);
    expect(settings).toMatch(/passkeyAdded:\s*this\.state\.passkeyAdded/);
    expect(settings).toMatch(/passkeyMsg/);
    expect(settings).toMatch(/PublicKeyCredential/);
    expect(settings).not.toMatch(/removePasskey\s*=/);
    expect(settings).not.toMatch(/tSecPasskeyRemove/);
  });

  it("does not hard-code GmbH / Bleicherstrasse or dispatch@ fallbacks, and has no TOTP QR", () => {
    const settings = read("app/ops/OpsSettings.dc.html");
    const profile = read("app/ops/OpsProfile.dc.html");
    const sidebar = read("app/ops/OpsSidebar.dc.html");
    for (const src of [settings, profile, sidebar]) {
      expect(src).not.toMatch(/GmbH/);
      expect(src).not.toMatch(/Bleicherstrasse/);
      expect(src).not.toMatch(/dispatch@vamostaxi/);
      expect(src).not.toMatch(/TOTP|otpauth:\/\/|qrcode/i);
    }
    expect(settings).toMatch(/data-af-eye/);
  });

  it("keeps dashboard hash navigation local and uses the narrow ops UI conventions", () => {
    const transition = read("app/vamos-page-transition.js");
    const ops = read("app/ops/ops.dc.html");
    const sidebar = read("app/ops/OpsSidebar.dc.html");
    const settings = read("app/ops/OpsSettings.dc.html");
    const profile = read("app/ops/OpsProfile.dc.html");

    expect(ops).toMatch(/window\.addEventListener\('hashchange', this\._onHash\)/);
    expect(ops).toMatch(/Object\.assign\(\{ navOpen: false \}, readHash\(\)\)/);
    expect(transition).toMatch(/p === '\/app\/ops' \|\| p === '\/app\/ops\/ops'/);
    expect(transition).toMatch(/function eligible\(a\) \{/);
    expect(transition).toMatch(/if \(hrefAttr\.charAt\(0\) === '#'\) return false;/);
    expect(transition).toMatch(/if \(samePage\(u\) && u\.search === location\.search && u\.hash\) return false;/);
    expect(transition).toMatch(/document\.addEventListener\('click', function \(e\) \{/);
    expect(transition).not.toMatch(/function isDashboardPage\(/);
    expect(transition).not.toMatch(/function runDashboardHashTransition\(/);
    expect(transition).not.toMatch(/addEventListener\('hashchange', runDashboardHashTransition\)/);
    expect(transition).not.toMatch(/vt-ops-hash-switch/);
    expect(transition).not.toMatch(/vtOpsHashSwitch/);
    expect(transition).not.toMatch(/play\(\[\[lead.*hashchange/s);
    expect(sidebar).toMatch(/border-inline-start:1px solid var\(--vt-border-inverse\)/);
    expect(sidebar).not.toMatch(/<svg aria-hidden="true" viewBox="0 0 42 100"/);
    expect(sidebar).not.toMatch(/Q21 94 39 94/);
    expect(settings).toMatch(/publishedLangs: \[/);
    expect(settings).toMatch(/<dc-import name="BrandSelect" size="field" icon="banknote"[^>]*style="width:100%;min-width:0"/);
    const locale = read("app/vamos-locale.js");
    expect(locale).toMatch(/function isDashboardHost\(\)/);
    expect(locale).toMatch(/isDashboardHost\(\) \? 'CHF'/);
    expect(settings).toMatch(/Stripe-hosted online checkout/);
    expect(settings).not.toMatch(/Cash to the chauffeur|TWINT|Corporate accounts only/);
    expect(`${settings}\n${profile}`).not.toMatch(/delete-profile|delete profile|account deletion|suppression du compte|حذف الحساب/i);
    expect(profile).toMatch(/body\.append\('kind', 'staff'\)/);
    expect(profile).toMatch(/fetch\('\/api\/photos\/upload', \{ method:'POST', credentials:'include', body \}\)/);
    expect(profile).toMatch(/this\.persist\(\{ avatar:json\.key \}\)/);
    expect(profile).toMatch(/this\.applyPersisted\(json\.data\)/);
    expect(profile).not.toMatch(/readAsDataURL|FileReader/);
    expect(profile).toMatch(/profile\.apply/);
    expect(profile).not.toMatch(/profile\.update\(/);
    expect(profile).not.toMatch(/readOnly=/);
  });
});
