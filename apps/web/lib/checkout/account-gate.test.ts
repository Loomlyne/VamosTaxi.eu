import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase/service-role", () => ({ serviceRoleConfigured: vi.fn(() => true) }));
vi.mock("../db/identity", () => ({ asCheckout: vi.fn() }));

import { serviceRoleConfigured } from "../supabase/service-role";
import { asCheckout } from "../db/identity";
import {
  ACCOUNT_NOTICE_VERSION,
  accountCreateAvailable,
  accountNoticeReady,
  guestAccountsOn,
  loadGuestAccountsLive,
} from "./account-notice";
import { decideAccount, runAccountGate, type AccountBlock, type AccountGateDeps } from "./account-gate";

const here = dirname(fileURLToPath(import.meta.url));
const env = {} as CloudflareEnv;
const guest: AccountBlock = { choice: "guest", consent: false };
const create = (consent: boolean): AccountBlock => ({ choice: "create", consent });

describe("account-notice", () => {
  it("is version 2026-09-29 and ready with all four languages", () => {
    expect(ACCOUNT_NOTICE_VERSION).toBe("2026-09-29");
    expect(accountNoticeReady()).toBe(true);
  });

  it("is not ready with a null version, a missing language or a blank text", () => {
    const full = (text: string) => ({ checkout: { acctCreateNotice: text, acctGuestNotice: text } });
    const messages = { en: full("a"), de: full("b"), fr: full("c"), ar: full("d") };
    expect(accountNoticeReady({ version: "2026-09-29", messages })).toBe(true);
    expect(accountNoticeReady({ version: null, messages })).toBe(false);
    expect(accountNoticeReady({ version: "2026-09-29", messages: { ...messages, ar: undefined as never } })).toBe(false);
    expect(accountNoticeReady({ version: "2026-09-29", messages: { ...messages, fr: full("  ") } })).toBe(false);
    expect(
      accountNoticeReady({
        version: "2026-09-29",
        messages: { ...messages, de: { checkout: { acctCreateNotice: "x" } } },
      }),
    ).toBe(false);
  });

  it("reads the guest switch fail-closed", async () => {
    vi.mocked(asCheckout).mockRejectedValueOnce(new Error("db down"));
    expect(await loadGuestAccountsLive(env)).toBe(false);
    vi.mocked(asCheckout).mockResolvedValueOnce([{ live: null }] as never);
    expect(await loadGuestAccountsLive(env)).toBe(false);
    vi.mocked(asCheckout).mockResolvedValueOnce([{ live: true }] as never);
    expect(await loadGuestAccountsLive(env)).toBe(true);
  });

  it("is off without the service-role key and returns plain booleans", async () => {
    vi.mocked(serviceRoleConfigured).mockReturnValueOnce(false);
    expect(accountCreateAvailable(env)).toBe(false);
    vi.mocked(serviceRoleConfigured).mockReturnValueOnce(false);
    expect(await guestAccountsOn(env)).toBe(false);
    vi.mocked(asCheckout).mockResolvedValueOnce([{ live: true }] as never);
    expect(await guestAccountsOn(env)).toBe(true);
    expect(accountCreateAvailable(env)).toBe(true);
  });

  it("never names the service-role key", () => {
    expect(readFileSync(join(here, "account-notice.ts"), "utf8")).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("decideAccount", () => {
  const base = { signedIn: false, guestOn: true, createAvailable: true };
  it("ignores a signed-in request and a missing block", () => {
    expect(decideAccount({ ...base, signedIn: true, account: create(false) })).toEqual({ kind: "none" });
    expect(decideAccount({ ...base, account: undefined })).toEqual({ kind: "none" });
  });
  it("guest with the switch off does nothing (D-09)", () => {
    expect(decideAccount({ ...base, guestOn: false, account: guest })).toEqual({ kind: "none" });
  });
  it("guest with the switch on is checked and informed, no tick needed (D-13)", () => {
    const record = { choice: "guest", textVersion: "2026-09-29" };
    expect(decideAccount({ ...base, account: guest })).toEqual({ kind: "check", record });
    expect(decideAccount({ ...base, account: { ...guest, consent: true } })).toEqual({ kind: "check", record });
  });
  it("create is refused when unavailable, then without the tick (D-12)", () => {
    expect(decideAccount({ ...base, createAvailable: false, account: create(true) })).toEqual({
      kind: "refuse",
      code: "account_create_unavailable",
    });
    expect(decideAccount({ ...base, account: create(false) })).toEqual({
      kind: "refuse",
      code: "account_consent_required",
    });
  });
  it("create with the tick is checked as consent", () => {
    expect(decideAccount({ ...base, account: create(true) })).toEqual({
      kind: "check",
      record: { choice: "create", textVersion: "2026-09-29" },
    });
  });
});

function fakes(over: Partial<AccountGateDeps> = {}) {
  const calls: string[] = [];
  const deps: AccountGateDeps = {
    verifyTurnstile: async () => (calls.push("turnstile"), true),
    ipLimit: async () => (calls.push("ip"), true),
    emailLimit: async () => (calls.push("email"), true),
    hasAccount: async () => (calls.push("has"), false),
    sendLink: async () => void calls.push("link"),
    ...over,
  };
  return { deps, calls };
}
const checkDecision = decideAccount({ signedIn: false, guestOn: true, createAvailable: true, account: create(true) });
const run = (deps: AccountGateDeps, decision = checkDecision) =>
  runAccountGate({ decision, email: " Ada@Example.test ", account: create(true) }, deps);

describe("runAccountGate", () => {
  it("none calls nothing", async () => {
    const { deps, calls } = fakes();
    expect(await run(deps, { kind: "none" })).toEqual({ proceed: true, record: null });
    expect(calls).toEqual([]);
  });
  it("refuse answers 400 and calls nothing", async () => {
    const { deps, calls } = fakes();
    expect(await run(deps, { kind: "refuse", code: "account_consent_required" })).toEqual({
      proceed: false,
      status: 400,
      code: "account_consent_required",
    });
    expect(calls).toEqual([]);
  });
  it("Turnstile failure is 403 before any limiter or database", async () => {
    const { deps, calls } = fakes({ verifyTurnstile: async () => false });
    expect(await run(deps)).toEqual({ proceed: false, status: 403, code: "account_check_failed" });
    expect(calls).toEqual([]);
  });
  it("either limiter refusing is 429 and the database is not asked", async () => {
    for (const which of ["ipLimit", "emailLimit"] as const) {
      const { deps, calls } = fakes({ [which]: async () => false });
      expect(await run(deps)).toEqual({ proceed: false, status: 429, code: "rate_limited" });
      expect(calls).not.toContain("has");
    }
  });
  it("runs Turnstile, IP, e-mail, then the known-e-mail check, and proceeds for an unknown address", async () => {
    const { deps, calls } = fakes();
    const out = await run(deps);
    expect(calls).toEqual(["turnstile", "ip", "email", "has"]);
    expect(out).toEqual({ proceed: true, record: { choice: "create", textVersion: "2026-09-29" } });
  });
  it("a known address gets a link and sign_in_first, never a record", async () => {
    const sent: unknown[] = [];
    const { deps } = fakes({ hasAccount: async () => true, sendLink: async (a) => void sent.push(a) });
    expect(await run(deps)).toEqual({ proceed: false, status: 200, code: "sign_in_first" });
    expect(sent).toEqual([{ email: "Ada@Example.test", returnTo: undefined }]);
  });
  it("a failing known-e-mail query fails closed", async () => {
    const { deps } = fakes({ hasAccount: async () => { throw new Error("db"); } });
    expect(await run(deps)).toEqual({ proceed: false, status: 503, code: "account_check_failed" });
  });
  it("does not log the e-mail", () => {
    const src = readFileSync(join(here, "account-gate.ts"), "utf8");
    expect(src).not.toMatch(/console\.log/);
    expect(src).not.toMatch(/log\([^)]*email\s*[,}]/);
  });
});
