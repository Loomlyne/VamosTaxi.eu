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
