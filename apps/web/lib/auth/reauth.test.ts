import { describe, expect, it, vi } from "vitest";
import {
  REAUTH_COOKIE,
  REAUTH_TTL_SECONDS,
  clearReauthCookie,
  hasFreshReauth,
  mintReauthCookie,
  reauthGate,
  reauthSecret,
  recentRecovery,
  sendReauthCode,
  sensitiveProfileChange,
  verifyOwnPassword,
  verifyReauthCode,
  type CredentialClient,
} from "./reauth";

// Test-only key material. Never a real secret.
const KEY = "test-only-reauth-key-0123456789abcdef";
const OTHER_KEY = "test-only-other-key-0123456789abcdef";
const NOW = 1_790_000_000_000;

function cookieValue(setCookie: string): string {
  const first = setCookie.split(";")[0] ?? "";
  return first.slice(first.indexOf("=") + 1);
}

async function minted(now = NOW): Promise<string> {
  const header = await mintReauthCookie({ secret: KEY, userId: "u1", sessionId: "s1", now });
  if (!header) throw new Error("mint failed");
  return header;
}

function header(setCookie: string): string {
  return `sb-x=1; ${REAUTH_COOKIE}=${cookieValue(setCookie)}; other=2`;
}

describe("reauthSecret", () => {
  it("reads STAFF_REAUTH_SECRET", () => {
    expect(reauthSecret({ STAFF_REAUTH_SECRET: KEY })).toBe(KEY);
  });
  it("missing or short → null, never a default key", () => {
    expect(reauthSecret({})).toBeNull();
    expect(reauthSecret({ STAFF_REAUTH_SECRET: "" })).toBeNull();
    expect(reauthSecret({ STAFF_REAUTH_SECRET: "short" })).toBeNull();
  });
});

describe("mintReauthCookie", () => {
  it("is HttpOnly, Secure, SameSite=Strict, 5 minutes", async () => {
    const setCookie = await minted();
    expect(setCookie.startsWith(`${REAUTH_COOKIE}=`)).toBe(true);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain(`Max-Age=${REAUTH_TTL_SECONDS}`);
    expect(REAUTH_TTL_SECONDS).toBe(300);
    expect(setCookie).toContain("Path=/");
  });

  it("does not put the user id or session id in the cookie", async () => {
    const setCookie = await minted();
    expect(setCookie).not.toContain("u1");
    expect(setCookie).not.toContain("s1");
  });

  it("no key → no cookie", async () => {
    expect(await mintReauthCookie({ secret: null, userId: "u1", sessionId: "s1", now: NOW })).toBeNull();
  });

  it("no session id → no cookie", async () => {
    expect(await mintReauthCookie({ secret: KEY, userId: "u1", sessionId: "", now: NOW })).toBeNull();
  });
});

describe("hasFreshReauth", () => {
  it("true for the same user and session inside 5 minutes", async () => {
    const cookie = header(await minted());
    expect(
      await hasFreshReauth({ secret: KEY, cookieHeader: cookie, userId: "u1", sessionId: "s1", now: NOW + 60_000 }),
    ).toBe(true);
  });

  it("false for another session_id (S2: a hijacked second session cannot reuse it)", async () => {
    const cookie = header(await minted());
    expect(
      await hasFreshReauth({ secret: KEY, cookieHeader: cookie, userId: "u1", sessionId: "s2", now: NOW }),
    ).toBe(false);
  });

  it("false for another user", async () => {
    const cookie = header(await minted());
    expect(
      await hasFreshReauth({ secret: KEY, cookieHeader: cookie, userId: "u2", sessionId: "s1", now: NOW }),
    ).toBe(false);
  });

  it("false after 5 minutes", async () => {
    const cookie = header(await minted());
    expect(
      await hasFreshReauth({
        secret: KEY,
        cookieHeader: cookie,
        userId: "u1",
        sessionId: "s1",
        now: NOW + (REAUTH_TTL_SECONDS + 1) * 1000,
      }),
    ).toBe(false);
  });

  it("false under another key", async () => {
    const cookie = header(await minted());
    expect(
      await hasFreshReauth({ secret: OTHER_KEY, cookieHeader: cookie, userId: "u1", sessionId: "s1", now: NOW }),
    ).toBe(false);
  });

  it("false when tampered, malformed or absent", async () => {
    const value = cookieValue(await minted());
    const [v, exp, mac] = value.split(".");
    const later = `${v}.${Number(exp) + 3600}.${mac}`;
    for (const bad of [later, `${value}x`, "v1.abc.def", "garbage", ""]) {
      expect(
        await hasFreshReauth({
          secret: KEY,
          cookieHeader: `${REAUTH_COOKIE}=${bad}`,
          userId: "u1",
          sessionId: "s1",
          now: NOW,
        }),
      ).toBe(false);
    }
    expect(
      await hasFreshReauth({ secret: KEY, cookieHeader: null, userId: "u1", sessionId: "s1", now: NOW }),
    ).toBe(false);
  });

  it("false without a session id or key", async () => {
    const cookie = header(await minted());
    expect(
      await hasFreshReauth({ secret: KEY, cookieHeader: cookie, userId: "u1", sessionId: undefined, now: NOW }),
    ).toBe(false);
    expect(
      await hasFreshReauth({ secret: null, cookieHeader: cookie, userId: "u1", sessionId: "s1", now: NOW }),
    ).toBe(false);
  });
});

describe("reauthGate", () => {
  it("ok with a fresh cookie", async () => {
    const cookie = header(await minted());
    expect(
      await reauthGate({ secret: KEY, cookieHeader: cookie, userId: "u1", sessionId: "s1", now: NOW }),
    ).toEqual({ ok: true });
  });

  it("reauth-required without one", async () => {
    expect(
      await reauthGate({ secret: KEY, cookieHeader: null, userId: "u1", sessionId: "s1", now: NOW }),
    ).toEqual({ ok: false, code: "reauth-required" });
  });

  it("reauth-unavailable when the key is missing, even with a cookie", async () => {
    const cookie = header(await minted());
    expect(
      await reauthGate({ secret: null, cookieHeader: cookie, userId: "u1", sessionId: "s1", now: NOW }),
    ).toEqual({ ok: false, code: "reauth-unavailable" });
  });
});

describe("clearReauthCookie", () => {
  it("expires the cookie", () => {
    const c = clearReauthCookie();
    expect(c.startsWith(`${REAUTH_COOKIE}=;`)).toBe(true);
    expect(c).toContain("Max-Age=0");
    expect(c).toContain("HttpOnly");
  });
});

describe("recentRecovery", () => {
  const nowSec = Math.floor(NOW / 1000);
  it("true for a recovery sign-in inside 5 minutes", () => {
    expect(recentRecovery([{ method: "recovery", timestamp: nowSec - 60 }], NOW)).toBe(true);
  });
  it("false when old, missing a timestamp, or another method", () => {
    expect(recentRecovery([{ method: "recovery", timestamp: nowSec - 600 }], NOW)).toBe(false);
    expect(recentRecovery(["recovery"], NOW)).toBe(false);
    expect(recentRecovery([{ method: "password", timestamp: nowSec }], NOW)).toBe(false);
    expect(recentRecovery(null, NOW)).toBe(false);
  });
});

describe("sensitiveProfileChange", () => {
  it("a new password is sensitive", () => {
    expect(sensitiveProfileChange({ password: "longenough1" }, "a@b.co")).toBe(true);
  });
  it("a different email is sensitive, the same one (any case) is not", () => {
    expect(sensitiveProfileChange({ email: "new@b.co" }, "a@b.co")).toBe(true);
    expect(sensitiveProfileChange({ email: " A@B.co " }, "a@b.co")).toBe(false);
  });
  it("name / phone only is not", () => {
    expect(sensitiveProfileChange({ fullName: "Koss", password: "" }, "a@b.co")).toBe(false);
  });
});

function credClient(overrides: Partial<CredentialClient["auth"]> = {}): CredentialClient {
  return {
    auth: {
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      ...overrides,
    },
  };
}

describe("verifyOwnPassword", () => {
  it("checks the admin's own email and drops the throwaway session locally", async () => {
    const sb = credClient();
    expect(await verifyOwnPassword(sb, "a@b.co", "correct-horse")).toBe(true);
    expect(sb.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: "correct-horse" });
    expect(sb.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("wrong password → false, nothing to sign out", async () => {
    const sb = credClient({
      signInWithPassword: vi.fn(async () => ({ error: { code: "invalid_credentials" } })),
    });
    expect(await verifyOwnPassword(sb, "a@b.co", "nope")).toBe(false);
    expect(sb.auth.signOut).not.toHaveBeenCalled();
  });
  it("no email or no password never calls Supabase", async () => {
    const sb = credClient();
    expect(await verifyOwnPassword(sb, undefined, "x")).toBe(false);
    expect(await verifyOwnPassword(sb, "a@b.co", "")).toBe(false);
    expect(sb.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("sendReauthCode / verifyReauthCode", () => {
  it("sends a code without creating a user", async () => {
    const sb = credClient();
    expect(await sendReauthCode(sb, "a@b.co")).toBe(true);
    expect(sb.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "a@b.co",
      options: { shouldCreateUser: false },
    });
  });
  it("verifies a 6-digit code and drops the throwaway session", async () => {
    const sb = credClient();
    expect(await verifyReauthCode(sb, "a@b.co", "123 456")).toBe(true);
    expect(sb.auth.verifyOtp).toHaveBeenCalledWith({ email: "a@b.co", token: "123456", type: "email" });
    expect(sb.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("wrong or malformed code → false", async () => {
    const bad = credClient({ verifyOtp: vi.fn(async () => ({ error: { code: "otp_expired" } })) });
    expect(await verifyReauthCode(bad, "a@b.co", "123456")).toBe(false);
    const sb = credClient();
    expect(await verifyReauthCode(sb, "a@b.co", "12ab56")).toBe(false);
    expect(sb.auth.verifyOtp).not.toHaveBeenCalled();
  });
});
