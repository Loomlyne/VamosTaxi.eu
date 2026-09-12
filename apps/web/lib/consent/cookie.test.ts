// apps/web/lib/consent/cookie.test.ts
//
// Wave 0 (10-01): D-09 consent_subject cookie. Helpers land in 10-02.
// GET must not mint the cookie (cache pitfall). No sk_live_. No invented CHF.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function readCookie(): string {
  return readFileSync(join(here, "cookie.ts"), "utf8");
}

describe("consent_subject cookie (D-09)", () => {
  it("names the cookie consent_subject and exports helpers", () => {
    const src = readCookie();
    expect(src).toMatch(/CONSENT_COOKIE/);
    expect(src).toMatch(/consent_subject/);
    expect(src).toMatch(/export function readConsentSubject/);
    expect(src).toMatch(/export function consentSubjectSetCookie/);
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
  });

  it("is 1 year, HttpOnly, Secure, SameSite=Lax, Path=/, first-party", () => {
    const src = readCookie();
    expect(src).toMatch(/31536000/);
    expect(src).toMatch(/HttpOnly/i);
    expect(src).toMatch(/Secure/i);
    expect(src).toMatch(/SameSite=Lax|sameSite:\s*["']lax["']/i);
    expect(src).toMatch(/Path=\/|path:\s*["']\/["']/i);
  });

  it("treats the subject as a UUID", () => {
    const src = readCookie();
    expect(src).toMatch(/uuid|UUID|randomUUID/i);
  });

  it("does not mint the cookie from a GET helper", () => {
    const src = readCookie();
    expect(src).not.toMatch(/mintConsentOnGet|setCookieOnGet|GET.*consent_subject/i);
    expect(src).not.toMatch(/document\.cookie/);
  });
});
