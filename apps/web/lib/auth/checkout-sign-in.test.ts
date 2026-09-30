import { describe, expect, it, vi } from "vitest";
import { CHECKOUT_SEND_FLOOR_MS, sendCheckoutSignInLink } from "./checkout-sign-in";
import type { AuthClient } from "./run";
import { decodeNextParam } from "./redirect-target";

// The callback target travels as `nextb` (base64url) when it carries a query (26.5-07).
const targetOf = (redirect: string): string | null => decodeNextParam(new URL(redirect).searchParams.get("nextb")) ?? new URL(redirect).searchParams.get("next");

function client(signInWithOtp: AuthClient["auth"]["signInWithOtp"]): AuthClient {
  return { auth: { signInWithOtp } } as unknown as AuthClient;
}

const base = { email: "a@b.ch", locale: "en", origin: "https://vamostaxi.site", home: "/en", startedAt: 1000 };

describe("sendCheckoutSignInLink", () => {
  it("never creates a user and returns to the validated checkout URL", async () => {
    const otp = vi.fn(async () => ({ error: null }));
    const sleep = vi.fn(async () => {});
    await sendCheckoutSignInLink(client(otp), {
      ...base, returnTo: "/en/checkout?class=economy&extras=a", sleep, jitter: () => 0, now: () => 1000,
    });
    const arg = (otp.mock.calls[0] as unknown[])[0] as { options: { shouldCreateUser: boolean; emailRedirectTo: string } };
    expect(arg.options.shouldCreateUser).toBe(false);
    expect(targetOf(arg.options.emailRedirectTo)).toBe("/en/checkout?class=economy&extras=a");
  });

  it("falls back to home for a foreign returnTo", async () => {
    const otp = vi.fn(async () => ({ error: null }));
    await sendCheckoutSignInLink(client(otp), {
      ...base, returnTo: "https://evil.example/x", sleep: async () => {}, jitter: () => 0, now: () => 5000,
    });
    const arg = (otp.mock.calls[0] as unknown[])[0] as { options: { emailRedirectTo: string } };
    expect(arg.options.emailRedirectTo).not.toContain("evil");
    expect(targetOf(arg.options.emailRedirectTo)).toBe("/en");
  });

  it("gives the same answer for an unknown and a known address", async () => {
    const opts = { ...base, returnTo: null, sleep: async () => {}, jitter: () => 0, now: () => 5000 };
    const unknown = await sendCheckoutSignInLink(
      client(vi.fn(async () => ({ error: { code: "otp_disabled", message: "Signups not allowed for otp" } }))), opts);
    const known = await sendCheckoutSignInLink(client(vi.fn(async () => ({ error: null }))), opts);
    expect(unknown).toEqual({ result: { stage: "sent" }, reason: null });
    expect(known).toEqual(unknown);
  });

  it("reports other Supabase codes and swallows a throw", async () => {
    const opts = { ...base, returnTo: null, sleep: async () => {}, jitter: () => 0, now: () => 5000 };
    const coded = await sendCheckoutSignInLink(
      client(vi.fn(async () => ({ error: { code: "over_email_send_rate_limit" } }))), opts);
    expect(coded).toEqual({ result: { stage: "sent" }, reason: "over_email_send_rate_limit" });
    const thrown = await sendCheckoutSignInLink(client(vi.fn(async () => { throw new Error("x"); })), opts);
    expect(thrown).toEqual({ result: { stage: "sent" }, reason: "send-failed" });
  });

  it("waits until the floor plus jitter, never negative, skipped when already past", async () => {
    const sleep = vi.fn(async () => {});
    const otp = vi.fn(async () => ({ error: null }));
    await sendCheckoutSignInLink(client(otp), { ...base, returnTo: null, sleep, jitter: () => 100, now: () => 1300 });
    expect(sleep).toHaveBeenCalledWith(1000 + CHECKOUT_SEND_FLOOR_MS + 100 - 1300);
    const slow = vi.fn(async () => {});
    await sendCheckoutSignInLink(client(otp), { ...base, returnTo: null, sleep: slow, jitter: () => 100, now: () => 9000 });
    expect(slow).not.toHaveBeenCalled();
    const thrownSleep = vi.fn(async () => {});
    await sendCheckoutSignInLink(client(vi.fn(async () => { throw new Error("x"); })),
      { ...base, returnTo: null, sleep: thrownSleep, jitter: () => 0, now: () => 1000 });
    expect(thrownSleep).toHaveBeenCalledWith(CHECKOUT_SEND_FLOOR_MS);
  });
});
