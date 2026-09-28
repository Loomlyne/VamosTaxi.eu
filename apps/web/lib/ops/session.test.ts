// apps/web/lib/ops/session.test.ts
//
// INT-09 / D-16 / D-16a / D-16b: requireStaffClaims applies staffGateDecision on every call.
// nextLevel is stored on the claims and is aal2 when the server-verified user (getUser) holds a
// verified factor, even if the cookie-derived AAL report says otherwise.

import { describe, expect, it } from "vitest";
import {
  getStaffClaims,
  requireAdminClaims,
  requireStaffClaims,
  type StaffAuthClient,
} from "./session";

function jwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

function client(opts: {
  role?: "admin" | "dispatcher";
  currentLevel: string | null;
  nextLevel?: string | null;
  factors?: Array<{ status: string }>;
}): StaffAuthClient {
  const token = jwt({
    session_id: "sid-1",
    ...(opts.role ? { app_metadata: { vamos_role: opts.role } } : {}),
  });
  return {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "26120000-0000-4000-a000-000000000001",
            email: "admin@vamos.test",
            app_metadata: {},
            ...(opts.factors ? { factors: opts.factors } : {}),
          },
        },
        error: null,
      }),
      getSession: async () => ({ data: { session: { access_token: token } } }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: opts.currentLevel, nextLevel: opts.nextLevel ?? null },
        }),
      },
    },
  };
}

describe("getStaffClaims stores nextLevel", () => {
  it("records nextLevel aal1 when no factor is enrolled", async () => {
    const claims = await getStaffClaims(client({ role: "admin", currentLevel: "aal1", nextLevel: "aal1" }));
    expect(claims?.nextLevel).toBe("aal1");
    expect(claims?.aal).toBe("aal1");
  });

  it("records nextLevel aal2 from a verified factor on the server-verified user", async () => {
    const claims = await getStaffClaims(
      client({ role: "admin", currentLevel: "aal1", nextLevel: "aal1", factors: [{ status: "verified" }] }),
    );
    expect(claims?.nextLevel).toBe("aal2");
  });
});

describe("requireStaffClaims applies the gate on every call", () => {
  it("admin, no factor, aal1 → allowed (D-16)", async () => {
    const claims = await requireStaffClaims(client({ role: "admin", currentLevel: "aal1", nextLevel: "aal1" }));
    expect(claims.app_metadata?.vamos_role).toBe("admin");
  });

  it("admin, enrolled factor, aal1 → needs-mfa (D-16a)", async () => {
    await expect(
      requireStaffClaims(client({ role: "admin", currentLevel: "aal1", nextLevel: "aal2" })),
    ).rejects.toMatchObject({ name: "OpsAuthError", reason: "needs-mfa" });
  });

  it("admin, verified factor only visible on getUser, aal1 → needs-mfa", async () => {
    await expect(
      requireStaffClaims(
        client({ role: "admin", currentLevel: "aal1", nextLevel: "aal1", factors: [{ status: "verified" }] }),
      ),
    ).rejects.toMatchObject({ reason: "needs-mfa" });
  });

  it("admin, unverified factor, aal1 → allowed (no lockout)", async () => {
    const claims = await requireStaffClaims(
      client({ role: "admin", currentLevel: "aal1", nextLevel: "aal1", factors: [{ status: "unverified" }] }),
    );
    expect(claims.aal).toBe("aal1");
  });

  it("admin, enrolled factor, aal2 → allowed", async () => {
    const claims = await requireStaffClaims(client({ role: "admin", currentLevel: "aal2", nextLevel: "aal2" }));
    expect(claims.aal).toBe("aal2");
  });

  it("dispatcher at aal2 → not-staff (D-16b)", async () => {
    await expect(
      requireStaffClaims(client({ role: "dispatcher", currentLevel: "aal2", nextLevel: "aal2" })),
    ).rejects.toMatchObject({ reason: "not-staff" });
  });

  it("no role → not-staff", async () => {
    await expect(requireStaffClaims(client({ currentLevel: "aal1" }))).rejects.toMatchObject({
      reason: "not-staff",
    });
  });
});

describe("requireAdminClaims", () => {
  it("dispatcher → not-admin", async () => {
    await expect(
      requireAdminClaims(client({ role: "dispatcher", currentLevel: "aal2", nextLevel: "aal2" })),
    ).rejects.toMatchObject({ reason: "not-admin" });
  });

  it("admin with an enrolled factor at aal1 → needs-mfa", async () => {
    await expect(
      requireAdminClaims(client({ role: "admin", currentLevel: "aal1", nextLevel: "aal2" })),
    ).rejects.toMatchObject({ reason: "needs-mfa" });
  });

  it("admin at aal2 → allowed", async () => {
    const claims = await requireAdminClaims(client({ role: "admin", currentLevel: "aal2", nextLevel: "aal2" }));
    expect(claims.app_metadata?.vamos_role).toBe("admin");
  });
});

// 26.1-25 (D-16a): a registered passkey is an enrolled factor for the app gate. GoTrue keeps
// passkeys in auth.webauthn_credentials (not auth.mfa_factors) and a passkey sign-in is aal1 with
// amr "passkey" (verified on local GoTrue v2.195.0), so the gate lists them from the server and
// reads the amr from the verified access token.
function passkeyClient(opts: {
  role?: "admin" | "dispatcher";
  currentLevel: string;
  nextLevel?: string;
  amr?: ReadonlyArray<{ method: string; timestamp?: number }>;
  passkeys: unknown[] | "error" | "throw";
}): { client: StaffAuthClient; listCalls: () => number } {
  let calls = 0;
  const base = client({ role: opts.role, currentLevel: opts.currentLevel, nextLevel: opts.nextLevel ?? "aal1" });
  const token = jwt({
    session_id: "sid-1",
    ...(opts.role ? { app_metadata: { vamos_role: opts.role } } : {}),
    ...(opts.amr ? { amr: opts.amr } : {}),
  });
  const out: StaffAuthClient = {
    auth: {
      ...base.auth,
      getSession: async () => ({ data: { session: { access_token: token } } }),
      passkey: {
        list: async () => {
          calls += 1;
          if (opts.passkeys === "throw") throw new Error("network");
          if (opts.passkeys === "error") return { data: null, error: { code: "unexpected_failure" } };
          return { data: opts.passkeys, error: null };
        },
      },
    },
  };
  return { client: out, listCalls: () => calls };
}

const PASSKEY = { id: "3f0e8a52-1c4b-4d6e-9a7f-2b3c4d5e6f70", created_at: "2026-09-28T10:00:00Z" };

describe("getStaffClaims and requireStaffClaims know passkeys (26.1-25)", () => {
  it("admin with a passkey on a password session → needs-mfa", async () => {
    const { client: sb } = passkeyClient({
      role: "admin",
      currentLevel: "aal1",
      amr: [{ method: "password", timestamp: 1 }],
      passkeys: [PASSKEY],
    });
    const claims = await getStaffClaims(sb);
    expect(claims?.hasPasskey).toBe(true);
    expect(claims?.amrMethods).toEqual(["password"]);
    await expect(requireStaffClaims(sb)).rejects.toMatchObject({ reason: "needs-mfa" });
    await expect(requireAdminClaims(sb)).rejects.toMatchObject({ reason: "needs-mfa" });
  });

  it("admin on a passkey sign-in session → allowed, without listing passkeys", async () => {
    const { client: sb, listCalls } = passkeyClient({
      role: "admin",
      currentLevel: "aal1",
      amr: [{ method: "passkey", timestamp: 1 }],
      passkeys: [PASSKEY],
    });
    const claims = await requireStaffClaims(sb);
    expect(claims.amrMethods).toEqual(["passkey"]);
    expect(listCalls()).toBe(0);
  });

  it("admin with no passkey on a password session → allowed (D-16)", async () => {
    const { client: sb } = passkeyClient({
      role: "admin",
      currentLevel: "aal1",
      amr: [{ method: "password" }],
      passkeys: [],
    });
    const claims = await requireStaffClaims(sb);
    expect(claims.hasPasskey).toBe(false);
  });

  it("a passkey list error or throw is treated as no passkey (documented fail-open; SQL never counted passkeys)", async () => {
    for (const passkeys of ["error", "throw"] as const) {
      const { client: sb } = passkeyClient({ role: "admin", currentLevel: "aal1", amr: [{ method: "password" }], passkeys });
      const claims = await requireStaffClaims(sb);
      expect(claims.hasPasskey).toBe(false);
    }
  });

  it("does not list passkeys for a customer or a dispatcher", async () => {
    const customer = passkeyClient({ currentLevel: "aal1", amr: [{ method: "password" }], passkeys: [PASSKEY] });
    await getStaffClaims(customer.client);
    expect(customer.listCalls()).toBe(0);
    const dispatcher = passkeyClient({ role: "dispatcher", currentLevel: "aal1", passkeys: [PASSKEY] });
    await expect(requireStaffClaims(dispatcher.client)).rejects.toMatchObject({ reason: "not-staff" });
    expect(dispatcher.listCalls()).toBe(0);
  });

  it("does not list passkeys once aal2 is required or reached", async () => {
    const enrolled = passkeyClient({ role: "admin", currentLevel: "aal2", nextLevel: "aal2", passkeys: [PASSKEY] });
    await requireStaffClaims(enrolled.client);
    expect(enrolled.listCalls()).toBe(0);
  });
});
