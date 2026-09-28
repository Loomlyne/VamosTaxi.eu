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

  it("D-12: dispatcher omits #pricing from the painted nav and Staff is deleted", () => {
    const sidebar = read("app/ops/OpsSidebar.dc.html");
    expect(sidebar).toMatch(/const NAV_ADMIN = \[/);
    // 08-01 (482072b): sidebar hrefs are paths, not hashes.
    const admin = sidebar.match(/const NAV_ADMIN = \[[\s\S]*?\];/);
    expect(admin?.[0] ?? "").toMatch(/href:'\/pricing'/);
    expect(sidebar).not.toMatch(/key:'staff'/);
    expect(sidebar).not.toMatch(/href:'[#/]staff'/);
    expect(sidebar).not.toMatch(/key:'staff-roster'/);
    const bottom = sidebar.match(/const NAV_BOTTOM = \[[\s\S]*?\];/);
    expect(bottom?.[0] ?? "").not.toMatch(/[#/]pricing|[#/]staff/);
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
      // No otpauth URI or hand-built QR anywhere: Supabase's own QR SVG is the only source.
      expect(src).not.toMatch(/otpauth:\/\/|qrcode/i);
    }
    // 26.1-23 (D-16a): the authenticator app now lives in Security settings only.
    for (const src of [profile, sidebar]) expect(src).not.toMatch(/TOTP/i);
    expect(settings).toMatch(/data-af-eye/);
  });

  it("keeps dashboard hash navigation local and uses the narrow ops UI conventions", () => {
    const transition = read("app/vamos-page-transition.js");
    const ops = read("app/ops/ops.dc.html");
    const sidebar = read("app/ops/OpsSidebar.dc.html");
    const settings = read("app/ops/OpsSettings.dc.html");
    const profile = read("app/ops/OpsProfile.dc.html");

    // 08-01 (b228e3e): console navigation is path URLs in one document — pushState + popstate, not hashes.
    expect(ops).toMatch(/window\.addEventListener\('popstate', this\._onPop\)/);
    expect(ops).toMatch(/Object\.assign\(\{ navOpen: false, menuOpen: false \}, readPath\(location\.pathname\)\)/);
    expect(transition).toMatch(/p === '\/app\/ops' \|\| p === '\/app\/ops\/ops'/);
    // 05154ca retired the page transition: on the dashboard host and /app/ops it only
    // drops the boot cover and returns; nowhere does it intercept clicks.
    expect(transition).toMatch(
      /host\.indexOf\('dashboard\.'\) === 0[^\n]*path\.indexOf\('\/app\/ops'\) === 0\) \{\s*dropBoot\(\);\s*return;/,
    );
    expect(transition).not.toMatch(/addEventListener\('click'/);
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

// 26.1-23 — admin sign-in options in Security settings (D-16, D-16a, D-17, D-17b; UI-SPEC §7).
describe("26.1-23 Security: authenticator app, magic link switch, re-auth dialog", () => {
  const settings = read("app/ops/OpsSettings.dc.html");
  const script = settings.slice(settings.indexOf('<script type="text/x-dc"'));

  const KEYS = [
    "secTotpLabel", "secTotpSub", "secTotpEmpty", "secTotpAdd", "secTotpQrIntro", "secTotpQrAlt",
    "secTotpSecretLabel", "secTotpCodeLabel", "secTotpVerify", "secTotpRegistered", "secTotpRemove",
    "secTotpRemoved", "secTotpFailed", "secTotpError", "secTotpRemoveFailed",
    "secMagicLinkLabel", "secMagicLinkSwitch", "secMagicLinkCurrent", "secMagicLinkUseInstead", "secMethodFailed",
    "secReauthTitle", "secReauthPwSub", "secReauthCodeSub", "secReauthPwLabel", "secReauthSend", "secReauthSent",
    "secReauthConfirm", "secReauthWrong", "secReauthUnavailable", "secTooMany", "secCancel", "secSaveFailed",
  ];

  it("ships every new key in en, de, fr and ar", () => {
    for (const key of KEYS) {
      const hits = script.match(new RegExp(`\\b${key}:'`, "g")) ?? [];
      expect(hits.length, key).toBe(4);
    }
    for (const lang of ["de", "fr", "ar"]) {
      const block = script.match(new RegExp(`\\n  ${lang}: \\{[\\s\\S]*?\\n  \\},`))?.[0] ?? "";
      for (const key of KEYS) expect(block, `${lang}.${key}`).toMatch(new RegExp(`\\b${key}:'`));
    }
    expect(settings).not.toMatch(/ß/);
  });

  it("uses the approved UI-SPEC copy in English", () => {
    expect(script).toMatch(/secTotpAdd:'Add an authenticator app'/);
    expect(script).toMatch(/secTotpVerify:'Verify and turn on'/);
    expect(script).toMatch(/secTotpRegistered:'Authenticator app turned on\.'/);
    expect(script).toMatch(/secTotpRemove:'Remove authenticator app'/);
    expect(script).toMatch(/secTotpFailed:'That code didn’t match\. Try the next one your app shows\.'/);
    expect(script).toMatch(/secMagicLinkSwitch:'Sign in with a magic link instead'/);
    expect(script).toMatch(/secMagicLinkCurrent:'You sign in with a magic link sent to \{email\}\.'/);
    expect(script).toMatch(/secMagicLinkUseInstead:'Use a password instead'/);
    expect(script).toMatch(/secReauthConfirm:'Confirm and continue'/);
    expect(script).toMatch(/secReauthSend:'Send a code'/);
  });

  it("renders the TOTP card: add, QR + setup key + 6-digit code, turned on, remove, mismatch alert", () => {
    expect(settings).toMatch(/icon="shield-check" onClick="\{\{ addTotp \}\}"[^>]*>\{\{ tSecTotpAdd \}\}/);
    expect(settings).toMatch(/<div data-totp-qr="1"><img src="\{\{ totpQr \}\}" alt="\{\{ tSecTotpQrAlt \}\}"/);
    expect(settings).toMatch(/\[data-totp-qr\]\{[^}]*border:1px solid var\(--vt-grey-200\);border-radius:var\(--vt-radius-lg\)/);
    expect(settings).toMatch(/data-totp-secret="1" class="vt-dir-keep" data-i18n-skip="1"/);
    expect(settings).toMatch(/\[data-totp-secret\]\{font-family:var\(--vt-font-mono\)/);
    expect(settings.match(/inputMode="numeric" pattern="\[0-9\]\*" maxLength="\{\{ n6 \}\}"/g)?.length).toBe(2);
    expect(settings).toMatch(/onClick="\{\{ verifyTotp \}\}"[^>]*>\{\{ tSecTotpVerify \}\}/);
    expect(settings).toMatch(/Alert" tone="danger"[^>]*>\{\{ tSecTotpFailed \}\}/);
    expect(settings).toMatch(/variant="secondary" size="md" onClick="\{\{ removeTotp \}\}"[^>]*>\{\{ tSecTotpRemove \}\}/);
    // The QR is Supabase's data: SVG shown as an <img>, never injected as markup.
    expect(script).toMatch(/json\.qrSvg\.indexOf\('data:image\/svg\+xml'\) === 0/);
    expect(settings).not.toMatch(/innerHTML|dangerouslySetInnerHTML/);
  });

  it("calls the 26.1-22 actions: status, enrol, verify, remove, method switch", () => {
    for (const action of [
      "mfa-status", "mfa-totp-enroll", "mfa-totp-verify", "mfa-unenroll", "set-sign-in-method",
      "reauth-password", "reauth-code-send", "reauth-code-verify",
    ]) {
      expect(script, action).toMatch(new RegExp(`action: '${action}'`));
    }
  });

  it("puts adding and removing the app, the method switch, and email/password change behind re-auth (D-17, D-17b)", () => {
    const guarded = (name: string, call: RegExp) => {
      const body = script.match(new RegExp(`\\n  ${name} = [\\s\\S]*?\\n  \\};`))?.[0] ?? "";
      expect(body, name).toMatch(/this\.withReauth\(/);
      expect(body, name).toMatch(call);
    };
    guarded("addTotp", /action: 'mfa-totp-enroll'/);
    guarded("removeTotp", /action: 'mfa-unenroll'/);
    guarded("setMethod", /action: 'set-sign-in-method'/);
    guarded("saveEmail", /api\('PATCH', '\/api\/staff\/profile', \{ email:/);
    guarded("changePassword", /api\('PATCH', '\/api\/staff\/profile', \{ password:/);
    // A 403 reauth-required opens the dialog and retries once.
    expect(script).toMatch(/json\.code === 'reauth-required' && !retried/);
    expect(script).toMatch(/this\.openReauth\(\(\) => attempt\(true\)\)/);
  });

  it("re-auth dialog: Dialog sm, password with the right-side eye, or a code for magic-link admins", () => {
    expect(settings).toMatch(/245af1\.Dialog" open="\{\{ yes \}\}" size="sm" title="\{\{ tSecReauthTitle \}\}"/);
    expect(settings).toMatch(
      /<div data-af-pw="1">\s*<x-import [^>]*type="\{\{ reauthPwType \}\}"[^>]*autoComplete="current-password"[^>]*><\/x-import>\s*<button type="button" data-af-eye="1" aria-label="\{\{ eyeReauthLabel \}\}" aria-pressed="\{\{ showReauthPw \}\}" onClick="\{\{ toggleReauthPw \}\}">/,
    );
    expect(settings).toMatch(/\[data-af-eye\]\{[^}]*inset-inline-end:6px/);
    expect(script).toMatch(/reauthPwType: this\.state\.showReauthPw \? 'text' : 'password'/);
    expect(script).toMatch(/eyeReauthLabel: this\.state\.showReauthPw \? t\.eyeHide : t\.eyeShow/);
    expect(settings).toMatch(/onClick="\{\{ sendReauthCode \}\}"[^>]*>\{\{ tSecReauthSend \}\}/);
    expect(settings).toMatch(/onClick="\{\{ confirmReauth \}\}" disabled="\{\{ reauthConfirmDisabled \}\}"[^>]*>\{\{ tSecReauthConfirm \}\}/);
    expect(script).toMatch(/reauthConfirmDisabled: this\.state\.reauthBusy \|\| !this\.reauthReady\(\)/);
  });

  it("switches password and magic link, and hides the password fields for a magic-link admin", () => {
    expect(settings).toMatch(/<sc-if value="\{\{ isPasswordMethod \}\}"[\s\S]*?\{\{ tSecPasswordBtn \}\}[\s\S]*?onClick="\{\{ useMagicLink \}\}"[^>]*>\{\{ tSecMagicLinkSwitch \}\}/);
    expect(settings).toMatch(/<sc-if value="\{\{ isMagicMethod \}\}"[\s\S]*?\{\{ magicPre \}\}<span class="vt-dir-keep" data-i18n-skip="1"[^>]*>\{\{ secEmail \}\}<\/span>\{\{ magicPost \}\}[\s\S]*?onClick="\{\{ usePassword \}\}"[^>]*>\{\{ tSecMagicLinkUseInstead \}\}/);
    expect(settings.match(/variant="ghost" size="md" sentenceCase="\{\{ yes \}\}" onClick="\{\{ use(MagicLink|Password) \}\}"/g)?.length).toBe(2);
    expect(settings.match(/display:\{\{ methodSavedShow \}\}[^>]*>\{\{ tSecUpdated \}\}/g)?.length).toBe(2);
  });

  it("keeps the laws: no nag banner, no tinted yellow, no glow, stacks at 390", () => {
    expect(settings).not.toMatch(/tone="(accent|warning)"/);
    expect(settings).not.toMatch(/--vt-yellow-(50|100|200|300|600|700)\b/);
    expect(settings).not.toMatch(/--vt-shadow-accent\)/);
    expect(settings).toMatch(/@media \(max-width:680px\)\{\[data-totp-enrol\]\{grid-template-columns:minmax\(0,1fr\)\}/);
    expect(settings).not.toMatch(/margin-left|margin-right|padding-left|padding-right|text-align:left|text-align:right/);
  });
});
