// The sign-up mock (app/pages/AuthForm.dc.html) shows 26.5's Text 1 (checkout.acctCreateNotice) and its
// error line. The mock keeps its own copy in app/vamos-account-notice.js and app/vamos-i18n-dict.js;
// these tests fail if either drifts from the four Next message files.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const LANGS = ["en", "de", "fr", "ar"] as const;
type Seg = string | { terms: string } | { privacy: string };

const messages = (l: string) => JSON.parse(read(`apps/web/i18n/messages/${l}.json`)).checkout as Record<string, string>;

function loadNotice(): { createNotice: Record<string, Seg[]>; segments: (l: string) => Seg[] } {
  const win: Record<string, unknown> = {};
  vm.runInNewContext(read("app/vamos-account-notice.js"), { window: win });
  return win.VamosAccountNotice as never;
}

const joinSegs = (s: Seg[]) =>
  s
    .map((x) => (typeof x === "string" ? x : "terms" in x ? `<terms>${x.terms}</terms>` : `<privacy>${x.privacy}</privacy>`))
    .join("");

function loadDict(): Record<string, Record<string, string>> {
  const sandbox: { window: { VamosI18n?: { strings: Record<string, Record<string, string>> } } } = { window: {} };
  vm.runInNewContext(read("app/vamos-i18n-dict.js"), sandbox);
  return sandbox.window.VamosI18n?.strings ?? {};
}

describe("sign-up notice in the mock", () => {
  const notice = loadNotice();
  for (const l of LANGS) {
    it(`${l}: segments rejoin to checkout.acctCreateNotice`, () => {
      expect(joinSegs(notice.createNotice[l]!)).toBe(messages(l).acctCreateNotice);
    });
    it(`${l}: exactly one terms and one privacy segment`, () => {
      const s = notice.createNotice[l]!;
      expect(s.filter((x) => typeof x !== "string" && "terms" in x)).toHaveLength(1);
      expect(s.filter((x) => typeof x !== "string" && "privacy" in x)).toHaveLength(1);
    });
    it(`${l}: dictionary carries acctCreateConsentError`, () => {
      const dict = loadDict();
      const en = messages("en").acctCreateConsentError!;
      if (l === "en") return;
      expect(dict[en]?.[l]).toBe(messages(l).acctCreateConsentError);
    });
  }
  it("segments() falls back to English", () => {
    expect(notice.segments("xx")).toBe(notice.createNotice.en);
  });
  it("carries no version string and no other sentence", () => {
    const src = read("app/vamos-account-notice.js");
    expect(src).not.toMatch(/version/i);
    expect(src.match(/2026-/g) ?? []).toHaveLength(1);
  });
});

describe("sign-up form source pins", () => {
  const form = read("app/pages/AuthForm.dc.html");
  const errorEn = messages("en").acctCreateConsentError!;
  const styleStart = form.indexOf("<style>");
  const style = form.slice(styleStart, form.indexOf("</style>", styleStart));
  const consentRules = style.split("\n").filter((l) => l.includes("[data-af-consent]"));

  it("carries the tick row, the pinned table and consent in the payload", () => {
    for (const needle of ["data-af-consent", "VamosAccountNotice", "consent: true", "consent-required", "signup-unavailable"]) {
      expect(form).toContain(needle);
    }
    expect(form.split(`>${errorEn}<`).length - 1).toBe(1);
    expect(form).not.toContain("By creating an account");
    expect(form.split("VamosTaxiDesignSystem_245af1.Checkbox").length - 1).toBe(1);
  });
  it("shows the row in sign-up only, never on the ops surface", () => {
    const m = form.match(/const showConsent = ([^;]+);/);
    expect(m?.[1]).toContain("mode === 'signup'");
    expect(m?.[1]).toContain("!isOps");
  });
  it("the dashboard files stay untouched", () => {
    for (const f of ["app/ops/AuthForm.dc.html", "app/ops/ops-login.dc.html"]) {
      const src = read(f);
      for (const needle of ["data-af-consent", "VamosAccountNotice", "Tick the box"]) expect(src).not.toContain(needle);
    }
  });
  it("style: tokens and logical properties only, no yellow tint, no glow", () => {
    expect(consentRules.length).toBeGreaterThan(0);
    expect(style).not.toContain("--vt-yellow-");
    expect(style.split("--vt-shadow-accent").length - 1).toBe(1);
    for (const rule of consentRules) {
      for (const bad of ["margin-left", "margin-right", "padding-left", "left:", "right:", "box-shadow"]) {
        expect(rule).not.toContain(bad);
      }
    }
  });
  it("loads the notice script in both hosts", () => {
    expect(form).toContain("vamos-account-notice.js");
    expect(read("app/pages/sign-in.dc.html")).toContain("vamos-account-notice.js");
  });
});

describe("27.1 finish your account and the optional phone (27 D-37)", () => {
  const form = read("app/pages/AuthForm.dc.html");
  const dict = loadDict();

  it("the finish view carries the same tick and refuses to submit without it", () => {
    expect(form.match(/const showConsent = ([^;]+);/)?.[1]).toContain("isFinish");
    expect(form).toContain("const needName = mode === 'signup' || mode === 'finish';");
    expect(form).toContain("if (needName && this.props.surface !== 'ops' && !(this.state.consent && window.VamosAccountNotice)) errors.consent = true;");
  });
  it("posts finish-account with no e-mail; the address comes from the session", () => {
    const payload = form.slice(form.indexOf("  payload() {"), form.indexOf("  resend = () =>"));
    const finish = payload.split("\n").find((l) => l.includes("mode === 'finish'")) ?? "";
    expect(finish).toContain("action: 'finish-account'");
    expect(finish).not.toContain("email");
    expect(form).toContain("fetch('/api/auth/session?finish=1'");
  });
  it("asks the optional mobile number on both sign-up forms and the finish step", () => {
    expect(form).toContain('label="Mobile number (optional)"');
    expect(form).toMatch(/needPhone: isForm && \(mode === 'signup' \|\| isFinish\) && !isOps/);
    expect(form).toMatch(/needName: isForm && \(mode === 'signup' \|\| isFinish\)/);
  });
  it("the account page sends an unfinished account to the finish step", () => {
    const account = read("app/pages/account.dc.html");
    expect(account).toContain("fetch('/api/auth/session?finish=1'");
    expect(account).toContain("snap.finishRequired === true");
    expect(account).toContain("/sign-up?state=finish");
  });
  it("every new string has de, fr and ar (Swiss German, no ß)", () => {
    for (const en of [
      "Finish your account",
      "Your email is confirmed. Add your name to finish your account.",
      "Your email",
      "Mobile number (optional)",
      "So your driver can reach you on the day.",
      "Check the mobile number, including the country code",
      "Finish account",
      "Not you? Sign out",
    ]) {
      expect(form, en).toContain(en);
      for (const l of ["de", "fr", "ar"]) expect(dict[en]?.[l], `${en} ${l}`).toBeTruthy();
      expect(dict[en]?.de ?? "").not.toContain("ß");
    }
  });
});

describe("27.1 finish step failures and the /bookings gate", () => {
  const form = read("app/pages/AuthForm.dc.html");
  it("a failed or lost finish never shows the 'check your email' screen", () => {
    expect(form).toContain("if (mode === 'finish') return this.go({ stage: 'form', banner: 'save-failed' });");
    expect(form).toContain("result.reason === 'no-user') return this.go({ mode: 'signin'");
    expect(form).toContain(">Could not save. Try again.<");
    expect(loadDict()["Could not save. Try again."]?.de).toBeTruthy();
  });
  it("names are capped at the server's 80 characters", () => {
    expect(form.split('maxLength="{{ n80 }}"').length - 1).toBe(2);
  });
  it("/bookings sends an unfinished account to the finish step too", () => {
    const list = read("app/pages/bookings.dc.html");
    expect(list).toContain("fetch('/api/auth/session?finish=1'");
    expect(list).toContain("s.finishRequired === true");
  });
});

describe("27.1 finish step bugs found by the browser run", () => {
  const form = read("app/pages/AuthForm.dc.html");
  it("the finish step never asks for a password it does not show", () => {
    expect(form).toContain("if (mode !== 'forgot' && mode !== 'finish' && method === 'password' && !password)");
  });
  it("reading the session never overwrites a mobile number already typed", () => {
    expect(form).toContain("phone: s.phone || snap.phone || ''");
  });
});
