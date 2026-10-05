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

// Security S13: the staff row's own active flag, asked on every staff call. True unless a test says.
const rowActive = vi.fn(async (_claims: unknown): Promise<boolean> => true);
vi.mock("./staff-active", () => ({ staffRowActive: (claims: unknown) => rowActive(claims) }));

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

  it("maps needs-mfa to its own 403 code so the sign-in shows the code step (26.1-23)", () => {
    expect(staffStatus("needs-mfa")).toEqual({ code: "needs-mfa", status: 403 });
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

  it("404s a browser document navigation so staff JSON never paints as a page", async () => {
    const handler = vi.fn(async () => jsonOk({ leaked: true }));
    const doc = new Request("http://vamos.test/api/staff/chauffeurs", {
      headers: { "sec-fetch-dest": "document", accept: "text/html" },
    });
    const response = await withStaff(handler)(doc);
    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await response.text()).toBe("Not Found");
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

describe("S13: active staff row and admin-only writes", () => {
  const admin = {
    id: "66666666-6666-4666-8666-666666666666",
    email: "admin@vamos.test",
    app_metadata: { vamos_role: "admin" as const },
  };
  const dispatcher = {
    id: "77777777-7777-4777-8777-777777777777",
    email: "disp@vamos.test",
    app_metadata: { vamos_role: "dispatcher" as const },
  };
  const write = (method: string) =>
    new Request("https://dashboard.vamostaxi.site/api/staff/vehicles", {
      method,
      headers: { origin: "https://dashboard.vamostaxi.site" },
    });

  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    rowActive.mockReset();
    rowActive.mockResolvedValue(true);
  });

  it("an active admin row reaches the handler; the check gets the session's claims", async () => {
    createSupabaseServerClient.mockResolvedValue(mockClient({ user: admin }));
    const handler = vi.fn(async () => jsonOk({ ok: 1 }));
    const res = await withStaff(handler)(new Request("http://vamos.test/api/staff/me"));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((rowActive.mock.calls[0]?.[0] as { sub?: string }).sub).toBe(admin.id);
  });

  it("a staff row switched off (active = false) is refused 403 not-staff, reads and writes, before the handler", async () => {
    rowActive.mockResolvedValue(false);
    createSupabaseServerClient.mockResolvedValue(mockClient({ user: admin }));
    const handler = vi.fn(async () => jsonOk({ leaked: true }));
    for (const req of [new Request("http://vamos.test/api/staff/me"), write("POST")]) {
      const result = await readJson(await withStaff(handler)(req));
      expect(result.status).toBe(403);
      expect(result.body).toEqual({ ok: false, code: "not-staff" });
    }
    const viaAdmin = await readJson(await withAdmin(handler)(write("PATCH")));
    expect(viaAdmin.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("a database that cannot answer the check is a 503, never the handler", async () => {
    rowActive.mockRejectedValue(new Error("down"));
    createSupabaseServerClient.mockResolvedValue(mockClient({ user: admin }));
    const handler = vi.fn(async () => jsonOk({}));
    const result = await readJson(await withStaff(handler)(new Request("http://vamos.test/api/staff/me")));
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ ok: false, code: "staff-check-failed" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("every write through withStaff needs the admin, the same as withAdmin", async () => {
    createSupabaseServerClient.mockResolvedValue(mockClient({ user: dispatcher }));
    const handler = vi.fn(async () => jsonOk({}));
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const result = await readJson(await withStaff(handler)(write(method)));
      expect(result.status, method).toBe(403);
      expect(result.body, method).toEqual({ ok: false, code: "not-admin" });
    }
    expect(handler).not.toHaveBeenCalled();
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
