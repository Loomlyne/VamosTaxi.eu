// apps/web/tests/integration/ops-claims-bridge.spec.ts
//
// Proof that getStaffClaims / requireStaffClaims / requireAdminClaims map a
// session into the VamosClaims object asStaff expects, and refuse aal1 and
// non-staff with distinguishable reasons. Tagged @ops-claims. Runs under
// component-1440 only. Live local-auth cases skip (not fail) when
// http://127.0.0.1:54321/auth/v1/health is down — this spec never starts
// supabase.

import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";
import {
  getStaffClaims,
  requireAdminClaims,
  requireStaffClaims,
  OpsAuthError,
  type StaffAuthClient,
} from "../../lib/ops/session";

const RUN_PROJECT = "component-1440";
const AUTH_HEALTH = "http://127.0.0.1:54321/auth/v1/health";
const AUTH_URL = "http://127.0.0.1:54321";
const MAIN_WEB_PKG = "/Users/koss/Developer/VamosTaxi.eu/apps/web/package.json";

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Claims-bridge proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

function jwtWithSessionId(sessionId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url");
  return `${header}.${payload}.sig`;
}

function mockClient(opts: {
  user: {
    id: string;
    email?: string | null;
    app_metadata?: { vamos_role?: unknown; extra?: unknown };
  } | null;
  aal?: string | null;
  sessionId?: string;
}): StaffAuthClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user }, error: null }),
      getSession: async () => ({
        data: {
          session: opts.sessionId ? { access_token: jwtWithSessionId(opts.sessionId) } : null,
        },
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: opts.aal ?? null },
        }),
      },
    },
  };
}

test.describe("ops claims bridge @ops-claims", () => {
  test("getStaffClaims returns null and requireStaffClaims throws no-session when getUser has no user", async () => {
    const supabase = mockClient({ user: null });
    expect(await getStaffClaims(supabase)).toBeNull();
    await expect(requireStaffClaims(supabase)).rejects.toMatchObject({
      name: "OpsAuthError",
      reason: "no-session",
    });
  });

  test("aal2 staff session enumerates claims field by field, including session_id from the JWT payload", async () => {
    const sub = "11111111-1111-4111-8111-111111111111";
    const supabase = mockClient({
      user: {
        id: sub,
        email: "dispatcher@vamos.test",
        app_metadata: { vamos_role: "dispatcher", extra: "must-not-copy" },
      },
      aal: "aal2",
      sessionId: "sid-dispatcher-1",
    });
    const claims = await getStaffClaims(supabase);
    expect(claims).toEqual({
      sub,
      role: "authenticated",
      aal: "aal2",
      email: "dispatcher@vamos.test",
      session_id: "sid-dispatcher-1",
      app_metadata: { vamos_role: "dispatcher" },
    });
    expect(await requireStaffClaims(supabase)).toEqual(claims);
  });

  // Owner decision 2026-09-27 (26.1 D-16/D-16a): only the admin signs in and a second factor is
  // optional. With no enrolled factor an aal1 admin session is accepted; requiring aal2 once a
  // factor is enrolled lands with Phase 26.1.
  test("aal1 admin session with no enrolled factor is accepted by requireStaffClaims", async () => {
    const supabase = mockClient({
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        email: "aal1@vamos.test",
        app_metadata: { vamos_role: "admin" },
      },
      aal: "aal1",
      sessionId: "sid-aal1",
    });
    const claims = await getStaffClaims(supabase);
    expect(claims?.aal).toBe("aal1");
    expect(claims?.app_metadata?.vamos_role).toBe("admin");
    expect(await requireStaffClaims(supabase)).toEqual(claims);
  });

  test("a session with no vamos_role is not staff", async () => {
    const supabase = mockClient({
      user: {
        id: "33333333-3333-4333-8333-333333333333",
        email: "customer@vamos.test",
        app_metadata: {},
      },
      aal: "aal1",
    });
    const claims = await getStaffClaims(supabase);
    expect(claims).not.toBeNull();
    expect(claims?.app_metadata?.vamos_role).toBeUndefined();
    await expect(requireStaffClaims(supabase)).rejects.toMatchObject({ reason: "not-staff" });
  });

  test("dispatcher at aal2 is refused by requireAdminClaims with not-admin", async () => {
    const supabase = mockClient({
      user: {
        id: "44444444-4444-4444-8444-444444444444",
        email: "disp@vamos.test",
        app_metadata: { vamos_role: "dispatcher" },
      },
      aal: "aal2",
      sessionId: "sid-disp",
    });
    await expect(requireAdminClaims(supabase)).rejects.toMatchObject({ reason: "not-admin" });
    expect(await requireStaffClaims(supabase)).toMatchObject({
      app_metadata: { vamos_role: "dispatcher" },
    });
  });

  test("admin at aal2 is accepted by requireAdminClaims", async () => {
    const supabase = mockClient({
      user: {
        id: "55555555-5555-4555-8555-555555555555",
        email: "admin@vamos.test",
        app_metadata: { vamos_role: "admin" },
      },
      aal: "aal2",
      sessionId: "sid-admin",
    });
    const claims = await requireAdminClaims(supabase);
    expect(claims.app_metadata?.vamos_role).toBe("admin");
    expect(claims.aal).toBe("aal2");
  });

  test("OpsAuthError carries a reason discriminant", () => {
    const err = new OpsAuthError("not-staff");
    expect(err).toBeInstanceOf(Error);
    expect(err.reason).toBe("not-staff");
  });
});

async function localAuthUp(): Promise<boolean> {
  try {
    const res = await fetch(AUTH_HEALTH, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";
  for (const c of cleaned) {
    const val = alphabet.indexOf(c);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string, nowMs = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(nowMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

test.describe("ops claims bridge live local auth @ops-claims", () => {
  test.describe.configure({ mode: "serial" });

  const createdUserIds: string[] = [];
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const url = process.env.SUPABASE_URL ?? AUTH_URL;

  test.beforeAll(async () => {
    const up = await localAuthUp();
    test.skip(!up, "local auth health is down — run pnpm db:start to exercise live aal1/aal2 proofs");
    test.skip(
      anonKey.length === 0 || serviceKey.length === 0,
      "SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY unset — live proofs skipped (keys stay out of the spec)",
    );
  });

  test.afterAll(async () => {
    for (const id of createdUserIds) {
      try {
        await fetch(`${url}/auth/v1/admin/users/${id}`, {
          method: "DELETE",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });
      } catch {
        // Best-effort cleanup.
      }
    }
  });

  function loadCreateClient(): (u: string, k: string, opts?: object) => {
    auth: StaffAuthClient["auth"] & {
      setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<unknown>;
      signInWithPassword: (creds: { email: string; password: string }) => Promise<{
        data: { session: { access_token: string; refresh_token: string } | null };
        error: { message: string } | null;
      }>;
      mfa: StaffAuthClient["auth"]["mfa"] & {
        enroll: (opts: { factorType: "totp" }) => Promise<{
          data: { id: string; totp: { secret: string } } | null;
          error: { message: string } | null;
        }>;
        challenge: (opts: { factorId: string }) => Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
        verify: (opts: { factorId: string; challengeId: string; code: string }) => Promise<{
          data: { access_token?: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  } {
    const req = createRequire(MAIN_WEB_PKG);
    const mod = req("@supabase/supabase-js") as {
      createClient: ReturnType<typeof loadCreateClient>;
    };
    return mod.createClient;
  }

  async function adminCreateUser(email: string, password: string): Promise<string> {
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`admin create user ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { id: string };
    createdUserIds.push(body.id);
    return body.id;
  }

  async function insertStaff(userId: string, role: "dispatcher" | "admin"): Promise<void> {
    const res = await fetch(`${url}/rest/v1/staff`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        role,
        full_name: role,
        accepted_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`insert staff ${res.status}: ${await res.text()}`);
  }

  test("aal1 staff is needs-mfa; after TOTP verify aal is aal2 and vamos_role matches the staff row", async () => {
    const createClient = loadCreateClient();
    const stamp = Date.now();
    const email = `ops-bridge-disp-${stamp}@vamos.test`;
    const password = "Ops-bridge-pass-1";
    const userId = await adminCreateUser(email, password);
    await insertStaff(userId, "dispatcher");

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await supabase.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(`sign-in failed: ${signedIn.error?.message ?? "no session"}`);
    }

    const aal1 = await getStaffClaims(supabase);
    expect(aal1?.app_metadata?.vamos_role).toBe("dispatcher");
    expect(aal1?.aal).toBe("aal1");
    expect(aal1?.sub).toBe(userId);
    await expect(requireStaffClaims(supabase)).rejects.toBeInstanceOf(OpsAuthError);
    await expect(requireStaffClaims(supabase)).rejects.toMatchObject({ reason: "needs-mfa" });

    const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error || !enrolled.data) {
      throw new Error(`mfa enroll failed: ${enrolled.error?.message ?? "no data"}`);
    }
    const challenged = await supabase.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenged.error || !challenged.data) {
      throw new Error(`mfa challenge failed: ${challenged.error?.message ?? "no data"}`);
    }
    const code = totp(enrolled.data.totp.secret);
    const verified = await supabase.auth.mfa.verify({
      factorId: enrolled.data.id,
      challengeId: challenged.data.id,
      code,
    });
    if (verified.error) {
      throw new Error(`mfa verify failed: ${verified.error.message}`);
    }

    const aal2 = await getStaffClaims(supabase);
    expect(aal2?.aal).toBe("aal2");
    expect(aal2?.app_metadata?.vamos_role).toBe("dispatcher");
    expect(aal2?.session_id).toEqual(expect.any(String));
    const required = await requireStaffClaims(supabase);
    expect(required.aal).toBe("aal2");
    await expect(requireAdminClaims(supabase)).rejects.toMatchObject({ reason: "not-admin" });
  });

  test("a local auth user with no staff row has no vamos_role and is not-staff", async () => {
    const createClient = loadCreateClient();
    const stamp = Date.now();
    const email = `ops-bridge-cust-${stamp}@vamos.test`;
    const password = "Ops-bridge-pass-2";
    await adminCreateUser(email, password);

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await supabase.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(`sign-in failed: ${signedIn.error?.message ?? "no session"}`);
    }

    const claims = await getStaffClaims(supabase);
    expect(claims).not.toBeNull();
    expect(claims?.app_metadata?.vamos_role).toBeUndefined();
    await expect(requireStaffClaims(supabase)).rejects.toMatchObject({ reason: "not-staff" });
  });
});
