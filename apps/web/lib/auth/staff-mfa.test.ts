import { describe, expect, it, vi } from "vitest";
import {
  challengeTotp,
  checkCodeAttemptLimit,
  enrolTotp,
  listFactors,
  normalizeTotpCode,
  passwordSignInRefused,
  staffMfaAccess,
  stepUpTotp,
  unenrolFactor,
  verifyTotpChallenge,
  verifyTotpEnrolment,
  type MfaClient,
  type MfaFactor,
} from "./staff-mfa";

const FACTOR_ID = "0b9f2a4e-6d1c-4f3a-9a52-3c8e1f7d2b10";
const CHALLENGE_ID = "5a1c9e2f-7b3d-4c6e-8f0a-1d2e3f4a5b6c";
const SECRET = "JBSWY3DPEHPK3PXP";

function client(
  factors: MfaFactor[] = [],
  overrides: Partial<MfaClient["auth"]["mfa"]> = {},
  passkeys: unknown[] = [],
): MfaClient {
  return {
    auth: {
      mfa: {
        enroll: vi.fn(async () => ({
          data: {
            id: FACTOR_ID,
            totp: { qr_code: "data:image/svg+xml;utf-8,<svg></svg>", secret: SECRET, uri: "otpauth://totp/x" },
          },
          error: null,
        })),
        challenge: vi.fn(async () => ({ data: { id: CHALLENGE_ID }, error: null })),
        verify: vi.fn(async () => ({ data: {}, error: null })),
        unenroll: vi.fn(async () => ({ data: {}, error: null })),
        listFactors: vi.fn(async () => ({ data: { all: factors }, error: null })),
        ...overrides,
      },
      passkey: { list: vi.fn(async () => ({ data: passkeys, error: null })) },
    },
  };
}

const verifiedTotp: MfaFactor = { id: FACTOR_ID, factor_type: "totp", status: "verified" };
const unverifiedTotp: MfaFactor = { id: "stale-1", factor_type: "totp", status: "unverified" };

describe("staffMfaAccess", () => {
  it("lets a signed-in admin through", () => {
    const out = staffMfaAccess({
      sub: "u1",
      role: "authenticated",
      session_id: "s1",
      app_metadata: { vamos_role: "admin" },
    });
    expect(out.ok).toBe(true);
  });

  it("refuses no session with 401", () => {
    expect(staffMfaAccess(null)).toEqual({ ok: false, status: 401, code: "no-session" });
  });

  it("refuses a customer and a dispatcher with 403 (D-16 admin only)", () => {
    expect(staffMfaAccess({ sub: "u1", role: "authenticated", session_id: "s1" })).toEqual({
      ok: false,
      status: 403,
      code: "not-staff",
    });
    expect(
      staffMfaAccess({
        sub: "u1",
        role: "authenticated",
        session_id: "s1",
        app_metadata: { vamos_role: "dispatcher" },
      }),
    ).toEqual({ ok: false, status: 403, code: "not-staff" });
  });

  it("refuses a session without a session_id (re-auth cannot bind)", () => {
    expect(
      staffMfaAccess({ sub: "u1", role: "authenticated", app_metadata: { vamos_role: "admin" } }),
    ).toEqual({ ok: false, status: 401, code: "no-session" });
  });
});

describe("normalizeTotpCode", () => {
  it("accepts six digits with spaces stripped", () => {
    expect(normalizeTotpCode("123 456")).toBe("123456");
  });
  it("rejects anything else", () => {
    expect(normalizeTotpCode("12345")).toBeNull();
    expect(normalizeTotpCode("abcdef")).toBeNull();
    expect(normalizeTotpCode(123456)).toBeNull();
  });
});

const FRESH = { reauth: { ok: true } } as const;

describe("enrolTotp", () => {
  it("refuses without a fresh re-auth and never asks Supabase (D-17b)", async () => {
    const sb = client();
    expect(await enrolTotp(sb, { reauth: { ok: false, code: "reauth-required" } })).toEqual({
      ok: false,
      code: "reauth-required",
    });
    expect(
      await enrolTotp(sb, { reauth: { ok: false, code: "reauth-unavailable" } }),
    ).toEqual({ ok: false, code: "reauth-unavailable" });
    expect(sb.auth.mfa.listFactors).not.toHaveBeenCalled();
    expect(sb.auth.mfa.unenroll).not.toHaveBeenCalled();
    expect(sb.auth.mfa.enroll).not.toHaveBeenCalled();
  });

  it("returns factorId, qrSvg and secret once", async () => {
    const sb = client();
    const out = await enrolTotp(sb, FRESH);
    expect(out).toEqual({
      ok: true,
      factorId: FACTOR_ID,
      qrSvg: "data:image/svg+xml;utf-8,<svg></svg>",
      secret: SECRET,
    });
    expect(sb.auth.mfa.enroll).toHaveBeenCalledWith({ factorType: "totp" });
  });

  it("clears stale unverified TOTP factors before enrolling", async () => {
    const sb = client([unverifiedTotp]);
    await enrolTotp(sb, FRESH);
    expect(sb.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "stale-1" });
  });

  it("refuses a second TOTP when one is verified", async () => {
    const sb = client([verifiedTotp]);
    expect(await enrolTotp(sb, FRESH)).toEqual({ ok: false, code: "mfa-already-enrolled" });
    expect(sb.auth.mfa.enroll).not.toHaveBeenCalled();
  });

  it("maps a Supabase failure without leaking it", async () => {
    const sb = client([], {
      enroll: vi.fn(async () => ({ data: null, error: { code: "mfa_enroll_disabled", message: "x" } })),
    });
    expect(await enrolTotp(sb, FRESH)).toEqual({ ok: false, code: "mfa-enroll-failed" });
  });
});

describe("verifyTotpEnrolment", () => {
  it("challenges then verifies the new factor", async () => {
    const sb = client();
    const out = await verifyTotpEnrolment(sb, { factorId: FACTOR_ID, code: "123456" });
    expect(out).toEqual({ ok: true, factorId: FACTOR_ID });
    expect(sb.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: FACTOR_ID });
    expect(sb.auth.mfa.verify).toHaveBeenCalledWith({
      factorId: FACTOR_ID,
      challengeId: CHALLENGE_ID,
      code: "123456",
    });
  });

  it("wrong code → mfa-code-mismatch", async () => {
    const sb = client([], {
      verify: vi.fn(async () => ({ data: null, error: { code: "mfa_verification_failed" } })),
    });
    expect(await verifyTotpEnrolment(sb, { factorId: FACTOR_ID, code: "000000" })).toEqual({
      ok: false,
      code: "mfa-code-mismatch",
    });
  });

  it("malformed input never reaches Supabase", async () => {
    const sb = client();
    expect(await verifyTotpEnrolment(sb, { factorId: "", code: "123456" })).toEqual({
      ok: false,
      code: "mfa-invalid-input",
    });
    expect(await verifyTotpEnrolment(sb, { factorId: FACTOR_ID, code: "12" })).toEqual({
      ok: false,
      code: "mfa-invalid-input",
    });
    expect(sb.auth.mfa.challenge).not.toHaveBeenCalled();
  });
});

describe("challengeTotp / verifyTotpChallenge", () => {
  it("returns the challenge id", async () => {
    expect(await challengeTotp(client(), FACTOR_ID)).toEqual({ ok: true, challengeId: CHALLENGE_ID });
  });

  it("challenge failure is mfa-challenge-failed", async () => {
    const sb = client([], { challenge: vi.fn(async () => ({ data: null, error: { code: "x" } })) });
    expect(await challengeTotp(sb, FACTOR_ID)).toEqual({ ok: false, code: "mfa-challenge-failed" });
  });

  it("verify maps a wrong code", async () => {
    const sb = client([], { verify: vi.fn(async () => ({ data: null, error: { code: "invalid" } })) });
    expect(
      await verifyTotpChallenge(sb, { factorId: FACTOR_ID, challengeId: CHALLENGE_ID, code: "111111" }),
    ).toEqual({ ok: false, code: "mfa-code-mismatch" });
  });
});

describe("stepUpTotp", () => {
  it("challenges and verifies the verified TOTP factor", async () => {
    const sb = client([unverifiedTotp, verifiedTotp]);
    expect(await stepUpTotp(sb, "654321")).toEqual({ ok: true, factorId: FACTOR_ID });
    expect(sb.auth.mfa.verify).toHaveBeenCalledWith({
      factorId: FACTOR_ID,
      challengeId: CHALLENGE_ID,
      code: "654321",
    });
  });

  it("no verified factor → mfa-no-factor", async () => {
    expect(await stepUpTotp(client([unverifiedTotp]), "654321")).toEqual({
      ok: false,
      code: "mfa-no-factor",
    });
  });

  it("wrong code → mfa-code-mismatch", async () => {
    const sb = client([verifiedTotp], {
      verify: vi.fn(async () => ({ data: null, error: { code: "mfa_verification_failed" } })),
    });
    expect(await stepUpTotp(sb, "654321")).toEqual({ ok: false, code: "mfa-code-mismatch" });
  });
});

describe("unenrolFactor", () => {
  it("needs aal2", async () => {
    const sb = client([verifiedTotp]);
    expect(
      await unenrolFactor(sb, { factorId: FACTOR_ID, aal: "aal1", reauth: { ok: true } }),
    ).toEqual({ ok: false, code: "mfa-aal2-required" });
    expect(sb.auth.mfa.unenroll).not.toHaveBeenCalled();
  });

  it("needs a fresh re-auth", async () => {
    const sb = client([verifiedTotp]);
    expect(
      await unenrolFactor(sb, {
        factorId: FACTOR_ID,
        aal: "aal2",
        reauth: { ok: false, code: "reauth-required" },
      }),
    ).toEqual({ ok: false, code: "reauth-required" });
    expect(
      await unenrolFactor(sb, {
        factorId: FACTOR_ID,
        aal: "aal2",
        reauth: { ok: false, code: "reauth-unavailable" },
      }),
    ).toEqual({ ok: false, code: "reauth-unavailable" });
    expect(sb.auth.mfa.unenroll).not.toHaveBeenCalled();
  });

  it("only removes a factor the caller owns", async () => {
    const sb = client([verifiedTotp]);
    expect(
      await unenrolFactor(sb, { factorId: "someone-else", aal: "aal2", reauth: { ok: true } }),
    ).toEqual({ ok: false, code: "mfa-invalid-input" });
    expect(sb.auth.mfa.unenroll).not.toHaveBeenCalled();
  });

  it("removes with aal2 and fresh re-auth", async () => {
    const sb = client([verifiedTotp]);
    expect(
      await unenrolFactor(sb, { factorId: FACTOR_ID, aal: "aal2", reauth: { ok: true } }),
    ).toEqual({ ok: true });
    expect(sb.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: FACTOR_ID });
  });
});

describe("listFactors", () => {
  it("reports TOTP and passkey state", async () => {
    expect(await listFactors(client([verifiedTotp], {}, [{ id: "pk" }]))).toEqual({
      ok: true,
      totp: true,
      totpFactorId: FACTOR_ID,
      passkey: true,
    });
  });

  it("unverified TOTP is not on", async () => {
    expect(await listFactors(client([unverifiedTotp]))).toEqual({
      ok: true,
      totp: false,
      totpFactorId: null,
      passkey: false,
    });
  });

  it("a verified webauthn factor counts as a passkey", async () => {
    const out = await listFactors(
      client([{ id: "w1", factor_type: "webauthn", status: "verified" }]),
    );
    expect(out).toMatchObject({ ok: true, passkey: true });
  });
});

describe("passwordSignInRefused", () => {
  it("refuses a password session for a magic_link account", () => {
    expect(passwordSignInRefused("magic_link", [{ method: "password", timestamp: 1 }])).toBe(true);
    expect(passwordSignInRefused("magic_link", ["password"])).toBe(true);
  });
  it("lets a magic-link session through", () => {
    expect(passwordSignInRefused("magic_link", [{ method: "otp", timestamp: 1 }])).toBe(false);
  });
  it("password accounts are never refused here", () => {
    expect(passwordSignInRefused("password", [{ method: "password", timestamp: 1 }])).toBe(false);
    expect(passwordSignInRefused(null, [{ method: "password", timestamp: 1 }])).toBe(false);
  });
});

describe("checkCodeAttemptLimit", () => {
  it("keys on the account, not only the IP", async () => {
    const limit = vi.fn(async () => ({ success: true }));
    expect(await checkCodeAttemptLimit({ limit }, "u1")).toBe(true);
    expect(limit).toHaveBeenCalledWith({ key: "auth-code:u1" });
  });
  it("fails closed when the limiter rejects or throws", async () => {
    expect(await checkCodeAttemptLimit({ limit: vi.fn(async () => ({ success: false })) }, "u1")).toBe(false);
    expect(
      await checkCodeAttemptLimit(
        {
          limit: vi.fn(async () => {
            throw new Error("down");
          }),
        },
        "u1",
      ),
    ).toBe(false);
  });
});
