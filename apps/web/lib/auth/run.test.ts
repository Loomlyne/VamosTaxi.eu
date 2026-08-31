import { describe, expect, it, vi } from "vitest";
import {
  callbackUrl,
  FORM_CREDENTIALS,
  fullName,
  runOtp,
  runPasswordReset,
  runSignInPassword,
  runSignOut,
  runSignUpPassword,
  runUpdatePassword,
  SENT,
  type AuthClient,
} from "./run";

function client(overrides: Partial<AuthClient["auth"]> = {}): AuthClient {
  return {
    auth: {
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({ error: null })),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      getUser: vi.fn(async () => ({ data: { user: { id: "u" } }, error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      ...overrides,
    },
  };
}

describe("callbackUrl", () => {
  it("points at /api/auth/callback with next", () => {
    expect(callbackUrl("https://vamos-web-staging.koussayzayeni.workers.dev", "/")).toBe(
      "https://vamos-web-staging.koussayzayeni.workers.dev/api/auth/callback?next=%2F",
    );
  });
});

describe("fullName", () => {
  it("joins first and last", () => {
    expect(fullName("Anna", "Keller")).toBe("Anna Keller");
  });
});

describe("runSignInPassword", () => {
  it("returns ok when supabase accepts", async () => {
    const sb = client();
    const out = await runSignInPassword(sb, { email: "a@b.co", password: "password1" });
    expect(out).toEqual({ result: { ok: true }, reason: null });
  });

  it("maps every failure to credentials (no enumeration)", async () => {
    const sb = client({
      signInWithPassword: vi.fn(async () => ({ error: { code: "invalid_credentials" } })),
    });
    const out = await runSignInPassword(sb, { email: "a@b.co", password: "nope-nope" });
    expect(out.result).toEqual(FORM_CREDENTIALS);
    expect(out.reason).toBe("invalid_credentials");
  });
});

describe("runSignUpPassword", () => {
  it("always returns sent, even when supabase errors", async () => {
    const sb = client({
      signUp: vi.fn(async () => ({ error: { code: "user_already_exists" } })),
    });
    const out = await runSignUpPassword(
      sb,
      { email: "a@b.co", password: "password1", firstName: "A", lastName: "B", locale: "en" },
      "https://example.test",
      "/",
    );
    expect(out.result).toEqual(SENT);
    expect(out.reason).toBe("user_already_exists");
  });

  it("passes emailRedirectTo and locale metadata", async () => {
    const signUp = vi.fn(async () => ({ error: null }));
    const sb = client({ signUp });
    await runSignUpPassword(
      sb,
      { email: "a@b.co", password: "password1", firstName: "A", lastName: "B", locale: "de" },
      "https://example.test",
      "/",
    );
    expect(signUp).toHaveBeenCalledWith({
      email: "a@b.co",
      password: "password1",
      options: {
        emailRedirectTo: "https://example.test/api/auth/callback?next=%2F",
        data: { full_name: "A B", locale: "de" },
      },
    });
  });
});

describe("runOtp", () => {
  it("creates a user on magic sign-in so the mail actually leaves", async () => {
    const signInWithOtp = vi.fn(async () => ({ error: null }));
    const sb = client({ signInWithOtp });
    await runOtp(
      sb,
      { mode: "signin", email: "a@b.co", locale: "fr" },
      "https://example.test",
      "/",
    );
    const first = signInWithOtp.mock.calls[0] as
      | [{ options?: { shouldCreateUser?: boolean } }]
      | undefined;
    expect(first?.[0]?.options?.shouldCreateUser).toBe(true);
    await runOtp(
      sb,
      { mode: "signup", email: "a@b.co", locale: "fr", firstName: "A", lastName: "B" },
      "https://example.test",
      "/",
    );
    const second = signInWithOtp.mock.calls[1] as
      | [{ options?: { shouldCreateUser?: boolean } }]
      | undefined;
    expect(second?.[0]?.options?.shouldCreateUser).toBe(true);
  });
});

describe("runPasswordReset", () => {
  it("returns sent on error", async () => {
    const sb = client({
      resetPasswordForEmail: vi.fn(async () => ({ error: { code: "over_email_send_rate_limit" } })),
    });
    const out = await runPasswordReset(sb, "a@b.co", "https://example.test", "/reset-password");
    expect(out.result).toEqual(SENT);
  });
});

describe("runSignOut", () => {
  it("reads the user then signs out", async () => {
    const getUser = vi.fn(async () => ({ data: { user: { id: "u" } }, error: null }));
    const signOut = vi.fn(async () => ({ error: null }));
    const out = await runSignOut(client({ getUser, signOut }));
    expect(getUser).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledOnce();
    expect(out).toEqual({ ok: true });
  });
});

describe("runUpdatePassword", () => {
  it("returns credentials when there is no session", async () => {
    const sb = client({
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    });
    const out = await runUpdatePassword(sb, "password1");
    expect(out.result).toEqual(FORM_CREDENTIALS);
    expect(out.reason).toBe("no-user");
  });

  it("returns ok when supabase accepts", async () => {
    const out = await runUpdatePassword(client(), "password1");
    expect(out).toEqual({ result: { ok: true }, reason: null });
  });
});
