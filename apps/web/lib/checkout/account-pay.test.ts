import { describe, expect, it } from "vitest";
import { accountIntentBlock, mapAccountCode, returnToPath, type AccountIntentInput } from "./account-pay";

const base: AccountIntentInput = {
  signedIn: false,
  choice: "guest",
  guestAccountsOn: true,
  createAvailable: true,
  createConsent: false,
  turnstileToken: "tok",
  idempotencyKey: "idem-1",
  returnTo: "/en/checkout?from=a&to=b",
};

describe("accountIntentBlock", () => {
  it("signed in: no block (D-01)", () => {
    expect(accountIntentBlock({ ...base, signedIn: true })).toBeUndefined();
    expect(accountIntentBlock({ ...base, signedIn: true, choice: "create", createConsent: true })).toBeUndefined();
  });

  it("sign in chosen: no block", () => {
    expect(accountIntentBlock({ ...base, choice: "signin" })).toBeUndefined();
  });

  it("guest with the switch off: no block (D-09)", () => {
    expect(accountIntentBlock({ ...base, guestAccountsOn: false })).toBeUndefined();
  });

  it("guest with the switch on: informed block, consent false even if a stale tick is set (D-13)", () => {
    expect(accountIntentBlock(base)).toEqual({
      choice: "guest",
      consent: false,
      turnstile_token: "tok",
      idempotency_key: "idem-1",
      return_to: "/en/checkout?from=a&to=b",
    });
    expect(accountIntentBlock({ ...base, createConsent: true })?.consent).toBe(false);
  });

  it("create when available: carries the Text 1 tick (D-12)", () => {
    expect(accountIntentBlock({ ...base, choice: "create", createConsent: true })).toMatchObject({
      choice: "create",
      consent: true,
    });
    expect(accountIntentBlock({ ...base, choice: "create" })).toMatchObject({ choice: "create", consent: false });
  });

  it("create when not available: no block", () => {
    expect(accountIntentBlock({ ...base, choice: "create", createAvailable: false, createConsent: true })).toBeUndefined();
  });

  it("omits optional fields that are not given", () => {
    const block = accountIntentBlock({ ...base, turnstileToken: undefined, idempotencyKey: undefined, returnTo: undefined });
    expect(block).toEqual({ choice: "guest", consent: false });
  });

  it("return_to is only pathname + search", () => {
    const block = accountIntentBlock({ ...base, returnTo: "https://evil.example/en/checkout?x=1#frag" });
    expect(block?.return_to).toBe("/en/checkout?x=1");
    expect(returnToPath("//evil.example/en/checkout?x=1")).toBe("/en/checkout?x=1");
    expect(returnToPath("")).toBeUndefined();
    expect(returnToPath(undefined)).toBeUndefined();
  });
});

describe("mapAccountCode", () => {
  it("sign_in_first shows the same sent stage as the Sign in option (D-04)", () => {
    expect(mapAccountCode("sign_in_first")).toEqual({ stage: "sent" });
  });

  it("account_consent_required points at the tick", () => {
    expect(mapAccountCode("account_consent_required")).toEqual({ createConsentError: "acctCreateConsentError" });
  });

  it("account_check_failed: pay did not start, widget reset", () => {
    expect(mapAccountCode("account_check_failed")).toEqual({ payError: "payStartFailed", resetTurnstile: true });
  });

  it("account_create_unavailable: hide Create, back to guest", () => {
    expect(mapAccountCode("account_create_unavailable")).toEqual({
      payError: "payStartFailed",
      hideCreate: true,
      choice: "guest",
    });
  });

  it("rate_limited and pay_limit map to the two D-20 messages", () => {
    expect(mapAccountCode("rate_limited")).toEqual({ payError: "payRateLimited" });
    expect(mapAccountCode("pay_limit")).toEqual({ payError: "payLimit" });
  });

  it("anything else falls through to existing handling", () => {
    for (const c of ["price_changed", "engine_changed", "", undefined, null]) {
      expect(mapAccountCode(c as string | undefined | null)).toBeNull();
    }
  });
});
