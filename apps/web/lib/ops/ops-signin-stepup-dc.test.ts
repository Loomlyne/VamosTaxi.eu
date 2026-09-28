// apps/web/lib/ops/ops-signin-stepup-dc.test.ts
//
// 26.1-23 (D-16, D-16a; UI-SPEC §7 open item 3): the ops sign-in step-up lives in
// app/ops/AuthForm.dc.html (rendered by ops-login.dc.html) as stage 'mfa'. Source pins
// only — the server gates aal2 on its own (26.1-20); this is the way to reach it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const form = read("app/ops/AuthForm.dc.html");
const script = form.slice(form.indexOf('<script type="text/x-dc"'));

type Entry = { de?: string; fr?: string; ar?: string };
function loadDict(): Record<string, Entry> {
  const sandbox: { window: { VamosI18n?: { strings: Record<string, Entry> } } } = { window: {} };
  runInNewContext(read("app/vamos-i18n-dict.js"), sandbox);
  return sandbox.window.VamosI18n?.strings ?? {};
}

const STRINGS = [
  "Enter the 6-digit code",
  "Open your authenticator app and type the code it shows.",
  "That code didn't match. Try the next one your app shows.",
  "Too many tries. Wait a minute, then try again.",
  "Could not check the code. Try again.",
  "6-digit code",
  "Verify",
  "Use another sign-in",
  "One more step",
  "This account has a passkey. Use it to finish signing in.",
  "Use your passkey",
  "Could not use the passkey. Try again.",
];

describe("26.1-23 ops sign-in step-up (AuthForm stage 'mfa')", () => {
  it("renders the code step: heading, numeric 6-digit field, Verify, danger alert, way back", () => {
    const start = form.indexOf('<sc-if value="{{ isMfa }}">');
    const view = start < 0 ? "" : form.slice(start, form.indexOf('<sc-if value="{{ isReturning }}">', start));
    expect(view).toMatch(/<h1 data-af-h1="1"[^>]*>Enter the 6-digit code<\/h1>/);
    expect(view).toMatch(/label="6-digit code" type="text" size="lg" inputMode="numeric" pattern="\[0-9\]\*" maxLength="\{\{ n6 \}\}" autoComplete="one-time-code"/);
    expect(view).toMatch(/Button" size="lg" block="\{\{ yes \}\}" onClick="\{\{ submitMfa \}\}" disabled="\{\{ mfaDisabled \}\}"[^>]*>Verify<\/x-import>/);
    expect(view).toMatch(/<sc-if value="\{\{ mfaMismatch \}\}">\s*<x-import [^>]*Alert" tone="danger"[^>]*>That code didn't match\. Try the next one your app shows\.<\/x-import>/);
    expect(view).toMatch(/onClick="\{\{ leaveMfa \}\}">Use another sign-in<\/button>/);
    expect(script).toMatch(/isMfa: stage === 'mfa' && isOps/);
    expect(form).toMatch(/&quot;verifying&quot;,&quot;mfa&quot;,&quot;returning&quot;/);
  });

  it("asks for the second step after an ops sign-in only when a factor is enrolled", () => {
    const need = script.match(/async stepUpNeed\(method\) \{[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(need).toMatch(/const status = await this\.liveAuth\(\{ action: 'mfa-status' \}\);/);
    expect(need).toMatch(/if \(status\.totp\) return 'totp';/);
    // 26.1-25: a passkey without the app needs a passkey sign-in, unless this sign-in was one.
    expect(need).toMatch(/if \(status\.passkey && method !== 'passkey'\) return 'passkey';/);
    expect(need).toMatch(/return null;/);
    const ops = script.match(/if \(this\.props\.surface === 'ops'\) \{\s*if \(result\.ok\) \{[\s\S]*?\n {6}\}/)?.[0] ?? "";
    expect(ops).toMatch(/const need = await this\.stepUpNeed\(method\);\s*if \(need\) return this\.openStepUp\(need\);/);
    expect(ops).toMatch(/return this\.enterOps\(\);/);
    // No factor → no extra step, no nag: the only path to 'mfa' is openStepUp.
    expect(script.match(/stage: 'mfa'/g)?.length).toBe(1);
    expect(script).toMatch(/openStepUp\(need\) \{[\s\S]*?this\.go\(\{ stage: 'mfa'/);
    expect(script).toMatch(/json\.code === 'needs-mfa' && this\.state\.stage === 'form'\) \{[\s\S]*?this\.openStepUp\(/);
  });

  it("offers the passkey when that is the enrolled factor, and opens /dashboard only after result.ok (26.1-25)", () => {
    const start = form.indexOf('<sc-if value="{{ isMfa }}">');
    const view = start < 0 ? "" : form.slice(start, form.indexOf('<sc-if value="{{ isReturning }}">', start));
    expect(view).toMatch(/<sc-if value="\{\{ mfaTotp \}\}"/);
    expect(view).toMatch(/<sc-if value="\{\{ mfaPasskey \}\}"/);
    expect(view).toMatch(/<h1 data-af-h1="1"[^>]*>One more step<\/h1>/);
    expect(view).toMatch(/icon="shield-check" onClick="\{\{ stepUpPasskey \}\}" disabled="\{\{ mfaBusy \}\}"[^>]*>Use your passkey<\/x-import>/);
    expect(view).toMatch(/<sc-if value="\{\{ mfaPasskeyFailed \}\}">\s*<x-import [^>]*Alert" tone="danger"[^>]*>Could not use the passkey\. Try again\.<\/x-import>/);
    const step = script.match(/stepUpPasskey = async \(\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? "";
    expect(step).toMatch(/await this\.passkeySignIn\(\)/);
    expect(step).toMatch(/if \(result && result\.ok\) return this\.enterOps\(\);/);
    expect(step).not.toMatch(/location\./);
    // One passkey ceremony, shared by the form option and the step-up.
    expect(script.match(/action: 'passkey-start'/g)?.length).toBe(1);
    expect(script).toMatch(/startPasskey = async \(\) => \{[\s\S]*?await this\.passkeySignIn\(\)/);
  });

  it("steps up with mfa-step-up and opens /dashboard only after result.ok", () => {
    const submit = script.match(/submitMfa = \(\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? "";
    expect(submit).toMatch(/this\.liveAuth\(\{ action: 'mfa-step-up', code: code \}\)/);
    expect(submit).toMatch(/if \(result && result\.ok\) return this\.enterOps\(\);/);
    expect(submit).not.toMatch(/location\./);
    expect(submit).toMatch(/code2 === 'mfa-code-mismatch'/);
    expect(submit).toMatch(/code2 === 'rate_limited'/);
    const enter = script.match(/async enterOps\(\) \{[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(enter).toMatch(/location\.replace\('\/dashboard'\)/);
    expect(script.match(/location\.replace\('\/dashboard'\)/g)?.length).toBe(1);
    // Leaving the step drops the half-signed-in session.
    expect(script).toMatch(/leaveMfa = \(\) => \{[\s\S]*?this\.liveAuth\(\{ action: 'signout' \}\)/);
  });

  it("ships every step-up string in de, fr and ar (Swiss German, no ß)", () => {
    const dict = loadDict();
    for (const en of STRINGS) {
      const entry = dict[en];
      expect(entry, en).toBeDefined();
      for (const lang of ["de", "fr", "ar"] as const) {
        expect(entry?.[lang], `${lang}: ${en}`).toBeTruthy();
      }
      expect(entry?.de ?? "", en).not.toMatch(/ß/);
    }
  });
});
