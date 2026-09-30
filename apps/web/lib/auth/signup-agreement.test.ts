// 27 D-03a: the sign-up agreement helper and the source pin that every sign-up caller records.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ calls: [] as unknown[][], sqlTexts: [] as string[], fail: null as unknown }));

vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (tx: unknown) => Promise<void>) => {
    if (db.fail) throw db.fail;
    const tx = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      db.sqlTexts.push(strings.join("?"));
      db.calls.push(values);
      return [];
    };
    await fn(tx);
  },
}));

const { recordSignupAgreement, signupConsentGiven, CONSENT_REQUIRED, SIGNUP_UNAVAILABLE } = await import(
  "./signup-agreement"
);
const { ACCOUNT_NOTICE_VERSION } = await import("@/lib/checkout/account-notice");

beforeEach(() => {
  db.calls = [];
  db.sqlTexts = [];
  db.fail = null;
  vi.restoreAllMocks();
});

describe("signupConsentGiven", () => {
  it("is true only for boolean true", () => {
    expect(signupConsentGiven({ consent: true })).toBe(true);
    for (const v of ["true", 1, null, undefined, false, "on"]) {
      expect(signupConsentGiven({ consent: v })).toBe(false);
    }
    expect(signupConsentGiven({})).toBe(false);
  });
});

describe("answers", () => {
  it("carry the reasons", () => {
    expect(CONSENT_REQUIRED).toEqual({ ok: false, reason: "consent-required" });
    expect(SIGNUP_UNAVAILABLE).toEqual({ ok: false, reason: "signup-unavailable" });
  });
});

describe("recordSignupAgreement", () => {
  const headers = new Headers({ "user-agent": "U".repeat(400), "cf-connecting-ip": "203.0.113.9" });

  it("writes one sign-up / create row with server-set values", async () => {
    const ok = await recordSignupAgreement({} as CloudflareEnv, { email: "a@b.co", locale: "de", headers });
    expect(ok).toBe(true);
    expect(db.calls).toHaveLength(1);
    expect(db.sqlTexts[0]).toContain("record_account_agreement");
    expect(db.sqlTexts[0]).toContain("'sign-up'");
    expect(db.sqlTexts[0]).toContain("'create'");
    expect(db.calls[0]).toEqual(["a@b.co", ACCOUNT_NOTICE_VERSION, "de", "U".repeat(300), "203.0.113.0"]);
  });

  it("stores a null user agent when the header is empty", async () => {
    await recordSignupAgreement({} as CloudflareEnv, { email: "a@b.co", locale: "en", headers: new Headers() });
    expect(db.calls[0]?.[3]).toBeNull();
    expect(db.calls[0]?.[4]).toBeNull();
  });

  it("returns false and logs the SQLSTATE only", async () => {
    db.fail = Object.assign(new Error("secret a@b.co"), { code: "42501" });
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ok = await recordSignupAgreement({} as CloudflareEnv, { email: "a@b.co", locale: "en", headers });
    expect(ok).toBe(false);
    const logged = JSON.stringify(err.mock.calls);
    expect(logged).toContain("signup_agreement_record_failed");
    expect(logged).toContain("42501");
    expect(logged).not.toContain("a@b.co");
  });

  it("logs no-sqlstate when the error has no code", async () => {
    db.fail = new Error("boom");
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await recordSignupAgreement({} as CloudflareEnv, { email: "a@b.co", locale: "en", headers })).toBe(false);
    expect(JSON.stringify(err.mock.calls)).toContain("no-sqlstate");
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === ".next" || name === "public") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("source pin", () => {
  it("every sign-up caller also records the agreement", () => {
    const root = process.cwd();
    const files = [...walk(join(root, "app")), ...walk(join(root, "lib"))];
    const callers = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /runSignUpPassword\(/.test(src) || /mode:\s*"signup"[\s\S]{0,300}/.test(src) && /runOtp\(/.test(src);
    });
    const own = callers.filter((f) => !f.endsWith(join("lib", "auth", "run.ts")));
    expect(own.length).toBeGreaterThanOrEqual(2);
    for (const f of own) expect(readFileSync(f, "utf8"), f).toContain("recordSignupAgreement(");
  });

  it("the helper touches no consent writer and never retypes the version", () => {
    const src = readFileSync(join(process.cwd(), "lib/auth/signup-agreement.ts"), "utf8");
    expect(src).not.toMatch(/recordConsent|record_consent|consent_log/);
    expect(src).not.toContain("2026-09-29");
    expect(src).not.toMatch(/from "@\/lib\/consent\/(?!ip)/);
  });
});
