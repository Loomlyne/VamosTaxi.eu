// apps/web/lib/ops/auth-ui-dc.test.ts
//
// fix/auth-sign-in-sign-up: source pins for the two DC sign-in forms (public
// app/pages/AuthForm.dc.html behind /sign-in and /sign-up, ops app/ops/AuthForm.dc.html behind
// dashboard /login). The server contract lives in POST /api/auth; these tests only pin that the
// forms speak it and that every string they render exists in de/fr/ar.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const FORMS = {
  public: read("app/pages/AuthForm.dc.html"),
  ops: read("app/ops/AuthForm.dc.html"),
} as const;
const forms = Object.entries(FORMS) as [string, string][];

type Entry = { de?: string; fr?: string; ar?: string };
function loadDict(): Record<string, Entry> {
  const sandbox: { window: { VamosI18n?: { strings: Record<string, Entry> } } } = { window: {} };
  runInNewContext(read("app/vamos-i18n-dict.js"), sandbox);
  return sandbox.window.VamosI18n?.strings ?? {};
}
const dict = loadDict();

function expectTranslated(strings: string[]): void {
  for (const key of strings) {
    const entry = dict[key];
    expect(entry, `dict entry for: ${key}`).toBeTruthy();
    for (const lang of ["de", "fr", "ar"] as const) {
      expect(entry?.[lang]?.trim(), `${lang} for: ${key}`).toBeTruthy();
    }
    expect(entry?.de ?? "", `Swiss German never uses the sharp s: ${key}`).not.toContain("ß");
  }
}

const CODE_STRINGS = [
  "Or use the code",
  "It is in the same email as the link.",
  "6-digit code",
  "Sign in",
  "Signing in",
  "Check the code. It is 6 digits and works for one hour.",
  "Too many tries. Wait a minute and try again.",
  "Could not check the code. Try again.",
];

describe("email code box on the sent step", () => {
  for (const [name, html] of forms) {
    it(`${name}: shows a one-time-code field with a Sign in button after the link is sent`, () => {
      const start = html.indexOf('<sc-if value="{{ showCode }}">');
      expect(start, "code block exists").toBeGreaterThan(-1);
      const block = html.slice(start, html.indexOf("</sc-if>\n\n<div style", start));
      expect(block).toMatch(/<p data-af-kick="1">Or use the code<\/p>/);
      expect(block).toMatch(/label="6-digit code" type="text" size="lg" inputMode="numeric"/);
      expect(block).toMatch(/autoComplete="one-time-code"/);
      expect(block).toMatch(/error="\{\{ codeErrText \}\}"/);
      expect(block).toMatch(/onClick="\{\{ submitCode \}\}" disabled="\{\{ codeDisabled \}\}"[^>]*>Sign in<\/x-import>/);
      expect(block).toMatch(/aria-busy="true"[^>]*>Signing in<\/x-import>/);
      // The code box sits inside the sent step, before the resend buttons.
      const sent = html.indexOf('<sc-if value="{{ isSent }}">');
      expect(start).toBeGreaterThan(sent);
      expect(start).toBeLessThan(html.indexOf('onClick="{{ resend }}"'));
    });

    it(`${name}: posts verify-code with the same email and handles every answer`, () => {
      const script = html.slice(html.indexOf('<script type="text/x-dc"'));
      const submit = script.match(/submitCode = \(\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? "";
      expect(submit).toMatch(/liveAuth\(\{ mode: 'verify-code', email: this\.state\.email\.trim\(\), code: code \}\)/);
      expect(submit).toMatch(/\/\^\\d\{6\}\$\//);
      expect(submit).toMatch(/result && result\.ok\) return this\.applyLive\(result, 'signin', 'code'\)/);
      expect(submit).toMatch(/reason === 'not-staff'\) return this\.applyLive/);
      expect(submit).toMatch(/'code-invalid' \? 'invalid' : reason === 'rate-limited' \? 'limited' : 'failed'/);
      expect(submit).toMatch(/codeBusy: true/);
      // Spaces from a paste are dropped, non-digits never reach the field.
      expect(script).toMatch(/replace\(\/\\D\/g, ''\)\.slice\(0, 6\)/);
      expect(script).toMatch(/Check the code\. It is 6 digits and works for one hour\./);
      expect(script).toMatch(/Too many tries\. Wait a minute and try again\./);
      // The link path stays.
      expect(html).toMatch(/Send another link<\/x-import>/);
      expect(script).toMatch(/resend = \(\) => \{/);
    });
  }

  it("the code strings exist in de, fr and ar", () => {
    expectTranslated(CODE_STRINGS);
  });
});

describe("dashboard sign-in offers the email link without a wrong password", () => {
  const html = FORMS.ops;
  const script = html.slice(html.indexOf('<script type="text/x-dc"'));

  it("shows 'Email me a link instead' on the ops password form", () => {
    expect(html).toMatch(/<sc-if value="\{\{ linkSignInMagic \}\}"><button [^>]*onClick="\{\{ useMagic \}\}">Email me a link instead<\/button>/);
    expect(script).toMatch(/linkSignInMagic: isForm && mode === 'signin' && !isMagic,/);
    // The old flag hid the option in ops mode; it now only guards 'Forgot password?'.
    expect(script).toMatch(/linkSignInPw: isForm && mode === 'signin' && !isMagic && !isOps,/);
    expect(html).toMatch(/<sc-if value="\{\{ linkSignInPw \}\}"[^>]*><button [^>]*onClick="\{\{ goForgot \}\}">Forgot password\?/);
  });

  it("keeps the passkey option and the way back to the password on the same form", () => {
    expect(script).toMatch(/showPasskey: isForm && mode === 'signin',/);
    expect(html).toMatch(/onClick="\{\{ usePassword \}\}">Use a password instead/);
  });
});

describe("expired or used email link (?error=1)", () => {
  const EXPIRED = "That link has expired or was already used. Ask for a new one below.";
  for (const [name, html] of forms) {
    it(`${name}: reads ?error=1 and shows the banner`, () => {
      const script = html.slice(html.indexOf('<script type="text/x-dc"'));
      expect(script).toMatch(/URLSearchParams\(location\.search\)\.get\('error'\) === '1'\) this\.setState\(\{ banner: 'expired' \}\)/);
      expect(html).toMatch(/<sc-if value="\{\{ bannerExpired \}\}">\s*<x-import [^>]*Alert" tone="danger" role="alert"[^>]*>That link has expired or was already used\. Ask for a new one below\.<\/x-import>/);
      expect(script).toMatch(/bannerExpired: isForm && banner === 'expired',/);
    });
  }

  it("public sign-in lists the state for review and the dashboard host keeps ?error=1", () => {
    expect(read("app/pages/sign-in.dc.html")).toMatch(/key: 'm', label: 'Sign in · link expired'.*banner: 'expired'/);
    expect(read("apps/web/middleware.ts")).toMatch(/loginUrl\.searchParams\.set\("error", "1"\)/);
    expect(read("apps/web/app/api/auth/callback/route.ts")).toMatch(/\?error=1/);
  });

  it("the banner text exists in de, fr and ar", () => {
    expectTranslated([EXPIRED]);
  });
});

describe("sign-in answers from POST /api/auth", () => {
  const REASON_STRINGS = [
    "Too many tries. Wait a minute and try again.",
    "This account can't open the dashboard. Use your staff sign-in.",
    "Confirm your email first",
    "We sent you a link when you signed up.",
    "Send the link again",
    "Check your inbox. We sent a new link.",
    "Could not send the link. Try again.",
  ];

  for (const [name, html] of forms) {
    const script = html.slice(html.indexOf('<script type="text/x-dc"'));

    it(`${name}: maps rate-limited, not-staff and email-not-confirmed to their own banner`, () => {
      expect(script).toMatch(/reason === 'rate-limited' \? 'rate-limited'\s*: reason === 'not-staff' \? 'not-staff'\s*: reason === 'email-not-confirmed' \? 'unconfirmed' : null/);
      // Reasons are read before the generic credentials handling.
      const apply = script.slice(script.search(/\n {2}(async )?applyLive\(result, mode, method/));
      expect(apply.indexOf("this.reasonBanner(result.reason)")).toBeGreaterThan(-1);
      expect(apply.indexOf("this.reasonBanner(result.reason)")).toBeLessThan(apply.indexOf("result.banner === 'credentials'"));
      expect(html).toMatch(/<sc-if value="\{\{ bannerRate \}\}">[\s\S]*?Too many tries\. Wait a minute and try again\./);
      expect(html).toMatch(/<sc-if value="\{\{ bannerNotStaff \}\}">[\s\S]*?This account can't open the dashboard\. Use your staff sign-in\./);
      expect(html).toMatch(/<sc-if value="\{\{ bannerUnconfirmed \}\}">[\s\S]*?title="Confirm your email first"[^>]*>We sent you a link when you signed up\. <button [^>]*onClick="\{\{ resendConfirm \}\}">Send the link again<\/button>/);
      expect(html).toMatch(/Check your inbox\. We sent a new link\./);
    });

    it(`${name}: resend-confirmation posts the address and answers 200 and 429`, () => {
      const resend = script.match(/resendConfirm = \(\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? "";
      expect(resend).toMatch(/liveAuth\(\{ mode: 'resend-confirmation', email: this\.state\.email\.trim\(\) \}\)/);
      expect(resend).toMatch(/result\.reason === 'rate-limited'\) return this\.go\(\{ banner: 'rate-limited' \}\)/);
      expect(resend).toMatch(/result\.stage === 'sent'\) return this\.setState\(\{ confirmSent: true \}\)/);
    });

    it(`${name}: the resend button and the passkey start report a rate limit`, () => {
      expect(script).toMatch(/result\.reason === 'rate-limited'\) this\.setState\(\{ resent: false, resendLimited: true \}\)/);
      expect(script).toMatch(/start && start\.reason/);
      expect(html).toMatch(/<sc-if value="\{\{ resendLimited \}\}">/);
    });
  }

  it("dashboard: a non-staff answer never enters the console", () => {
    const script = FORMS.ops.slice(FORMS.ops.indexOf('<script type="text/x-dc"'));
    // not-staff is handled before the ops branch that calls enterOps / openStepUp.
    const apply = script.slice(script.indexOf("async applyLive("));
    expect(apply.indexOf("this.reasonBanner")).toBeLessThan(apply.indexOf("this.enterOps()"));
    expect(script).toMatch(/if \(result && result\.ok\) return this\.applyLive\(result, 'signin', 'code'\)/);
  });

  it("every reason string exists in de, fr and ar", () => {
    expectTranslated(REASON_STRINGS);
  });
});

describe("previously untranslated auth strings", () => {
  it("exist in de, fr and ar", () => {
    expectTranslated([
      "Use at least 8 characters",
      "Choose a password",
      "Enter your password",
      "The two entries are different",
      "Type the password again",
      "Choose a new password",
      "At least 8 characters.",
      "Hide password",
      "Show password",
      "The link works once and expires after 1 hour. Nothing there? Check spam, then send another.",
      "Link expired",
      "Reset links work once, and expire after 1 hour. Ask for a new one and it arrives in the same inbox.",
      "A Vamos Taxi V-Class waiting at the curb",
    ]);
  });

  it("every visible literal in the auth forms resolves (placeholders excepted)", () => {
    const files = ["app/pages/AuthForm.dc.html", "app/ops/AuthForm.dc.html", "app/pages/ResetForm.dc.html"];
    const missing: string[] = [];
    for (const file of files) {
      const src = read(file);
      const tmpl = src.slice(src.indexOf("</helmet>"), src.indexOf('<script type="text/x-dc"'));
      const found = new Set<string>();
      for (const m of tmpl.matchAll(/>([^<>{}]+)</g)) found.add((m[1] ?? "").replace(/\s+/g, " ").trim());
      for (const m of tmpl.matchAll(/\s(?:label|title|hint|aria-label|alt)="([^"{}]+)"/g)) found.add(m[1] ?? "");
      for (const text of found) {
        if (!/[A-Za-z]/.test(text) || text === "Anna" || text === "Keller") continue;
        if (!dict[text]) missing.push(`${file}: ${text}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
