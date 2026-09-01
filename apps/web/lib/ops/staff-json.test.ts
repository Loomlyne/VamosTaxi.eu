// apps/web/lib/ops/staff-json.test.ts
//
// Status mapping for the staff JSON envelope. No Hyperdrive.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpsAuthError, type StaffAuthClient } from "./session";

const createSupabaseServerClient = vi.fn();

vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: (...args: unknown[]) => createSupabaseServerClient(...args),
  createServerSupabaseClient: (...args: unknown[]) => createSupabaseServerClient(...args),
}));

import { jsonErr, jsonOk, staffStatus, withAdmin, withStaff } from "./staff-json";

function jwtWithRole(role?: "dispatcher" | "admin"): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify(role ? { app_metadata: { vamos_role: role } } : {}),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

function mockClient(opts: {
  user: { id: string; email?: string | null; app_metadata?: { vamos_role?: unknown } } | null;
}): StaffAuthClient {
  const accessToken = jwtWithRole(
    opts.user?.app_metadata?.vamos_role === "dispatcher" || opts.user?.app_metadata?.vamos_role === "admin"
      ? opts.user.app_metadata.vamos_role
      : undefined,
  );
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user }, error: null }),
      getSession: async () => ({
        data: { session: opts.user ? { access_token: accessToken } : null },
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1" } }),
      },
    },
  };
}

async function readJson(response: Response): Promise<{ status: number; type: string; body: unknown }> {
  return {
    status: response.status,
    type: response.headers.get("content-type") ?? "",
    body: await response.json(),
  };
}

describe("staffStatus", () => {
  it("maps no-session to 401", () => {
    expect(staffStatus("no-session")).toEqual({ code: "no-session", status: 401 });
  });

  it("maps not-staff to 403", () => {
    expect(staffStatus("not-staff")).toEqual({ code: "not-staff", status: 403 });
  });

  it("maps not-admin to 403", () => {
    expect(staffStatus("not-admin")).toEqual({ code: "not-admin", status: 403 });
  });
});

describe("jsonOk / jsonErr", () => {
  it("wraps data in { ok: true, data }", async () => {
    const result = await readJson(jsonOk({ email: "a@b.c" }));
    expect(result.status).toBe(200);
    expect(result.type).toMatch(/application\/json/);
    expect(result.body).toEqual({ ok: true, data: { email: "a@b.c" } });
  });

  it("wraps errors in { ok: false, code }", async () => {
    const result = await readJson(jsonErr("no-session", 401));
    expect(result.status).toBe(401);
    expect(result.type).toMatch(/application\/json/);
    expect(result.body).toEqual({ ok: false, code: "no-session" });
  });
});

describe("withStaff / withAdmin", () => {
  const request = new Request("http://vamos.test/api/staff/me");

  beforeEach(() => {
    createSupabaseServerClient.mockReset();
  });

  it("returns JSON 401 no-session when there is no user", async () => {
    createSupabaseServerClient.mockResolvedValue(mockClient({ user: null }));
    const result = await readJson(await withStaff(async () => jsonOk({}))(request));
    expect(result.status).toBe(401);
    expect(result.type).toMatch(/application\/json/);
    expect(result.body).toEqual({ ok: false, code: "no-session" });
  });

  it("returns JSON 403 not-staff when the session has no vamos_role", async () => {
    createSupabaseServerClient.mockResolvedValue(
      mockClient({
        user: { id: "33333333-3333-4333-8333-333333333333", email: "cust@vamos.test", app_metadata: {} },
      }),
    );
    const result = await readJson(await withStaff(async () => jsonOk({}))(request));
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ ok: false, code: "not-staff" });
  });

  it("returns JSON 403 not-admin when a dispatcher hits withAdmin", async () => {
    createSupabaseServerClient.mockResolvedValue(
      mockClient({
        user: {
          id: "44444444-4444-4444-8444-444444444444",
          email: "disp@vamos.test",
          app_metadata: { vamos_role: "dispatcher" },
        },
      }),
    );
    const result = await readJson(await withAdmin(async () => jsonOk({}))(request));
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ ok: false, code: "not-admin" });
  });

  it("rethrows non-auth errors", async () => {
    createSupabaseServerClient.mockRejectedValue(new Error("boom"));
    await expect(withStaff(async () => jsonOk({}))(request)).rejects.toThrow("boom");
  });

  it("does not treat OpsAuthError from the handler as a mapped envelope", async () => {
    createSupabaseServerClient.mockResolvedValue(
      mockClient({
        user: {
          id: "55555555-5555-4555-8555-555555555555",
          email: "admin@vamos.test",
          app_metadata: { vamos_role: "admin" },
        },
      }),
    );
    await expect(
      withStaff(async () => {
        throw new OpsAuthError("not-staff");
      })(request),
    ).rejects.toBeInstanceOf(OpsAuthError);
  });
});

describe("GET /api/staff/me (withStaff door)", () => {
  const request = new Request("http://vamos.test/api/staff/me");

  it("returns JSON 401 { ok: false, code: no-session } without cookies", async () => {
    createSupabaseServerClient.mockResolvedValue(mockClient({ user: null }));
    const result = await readJson(
      await withStaff(async (claims) =>
        jsonOk({
          userId: claims.sub,
          email: claims.email ?? "",
          role: claims.app_metadata?.vamos_role ?? "",
          fullName: "",
          lang: "",
        }),
      )(request),
    );
    expect(result.status).toBe(401);
    expect(result.type).toMatch(/application\/json/);
    expect(result.body).toEqual({ ok: false, code: "no-session" });
  });
});
