// apps/web/lib/ops/asset-gate.test.ts
//
// The dashboard screen files (/app/ops/*) on the dashboard host: served only to a session that passes
// the console rule the dashboard documents use, except the sign-in page's own two files. Runs the real
// @supabase/ssr + supabase-js client on a real `vt-auth` cookie; only Supabase Auth's HTTP answers and
// the assets binding are stand-ins. No network.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardOpsAsset, opsAssetNotFound } from "../dc-mock-urls";
import { OPS_LOGIN_ASSETS, gatedAssetCacheControl, isOpsLoginAsset, serveGatedOpsAsset } from "./asset-gate";
import { CONSOLE_AUTH_TIMEOUT_MS } from "./session";

const SUPABASE_URL = "https://auth.example.test";
const DASH = "https://dashboard.vamostaxi.site";
const SCREEN = "/app/ops/OpsDetail.dc.html";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

type Who = {
  token: string;
  role?: "admin" | "dispatcher";
  aal?: "aal1" | "aal2";
  amr?: string[];
  factors?: Array<{ id: string; status: "verified" | "unverified"; factor_type: string }>;
};

function jwt(who: Who, expSeconds: number): string {
  const payload: Record<string, unknown> = {
    sub: `user-${who.token}`,
    aud: "authenticated",
    role: "authenticated",
    exp: expSeconds,
    aal: who.aal ?? "aal1",
    amr: (who.amr ?? ["password"]).map((method) => ({ method, timestamp: 1 })),
    session_id: `session-${who.token}`,
    app_metadata: who.role ? { provider: "email", vamos_role: who.role } : { provider: "email" },
  };
  // Signature is a stand-in: only the stand-in auth server below judges the token, as Supabase Auth does.
  return `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.${b64url(`sig-${who.token}`)}`;
}

/** Users the stand-in auth server knows, by access token. */
const users = new Map<string, Who>();

function userJson(who: Who) {
  return {
    id: `user-${who.token}`,
    aud: "authenticated",
    role: "authenticated",
    email: `${who.token}@example.test`,
    app_metadata: { provider: "email" },
    user_metadata: {},
    factors: who.factors ?? [],
    created_at: "2026-10-01T00:00:00Z",
  };
}

function session(who: Who, expiresAt: number) {
  const access = jwt(who, expiresAt);
  users.set(access, who);
  return {
    access_token: access,
    token_type: "bearer",
    expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    expires_at: expiresAt,
    refresh_token: `refresh-${who.token}`,
    user: userJson(who),
  };
}

/** The session cookie exactly as @supabase/ssr writes it: `vt-auth` (or chunks), base64url. */
function vtAuthCookie(who: Who, expiresAt = Math.floor(Date.now() / 1000) + 3600): string {
  const value = `base64-${b64url(JSON.stringify(session(who, expiresAt)))}`;
  if (value.length <= 3180) return `vt-auth=${value}`;
  const parts: string[] = [];
  for (let i = 0; i * 3180 < value.length; i++) parts.push(`vt-auth.${i}=${value.slice(i * 3180, (i + 1) * 3180)}`);
  return parts.join("; ");
}

const authCalls: string[] = [];

function authServer() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    authCalls.push(url.replace(SUPABASE_URL, ""));
    if (!url.startsWith(SUPABASE_URL)) return new Response("unexpected fetch", { status: 599 });
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) {
      const token = (headers.get("authorization") ?? "").replace(/^Bearer /, "");
      const who = users.get(token);
      if (!who) return Response.json({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" }, { status: 401 });
      return Response.json(userJson(who));
    }
    if (url.startsWith(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`)) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { refresh_token?: string };
      const name = (body.refresh_token ?? "").replace(/^refresh-/, "");
      const who = [...users.values()].find((w) => w.token === name);
      if (!who) return Response.json({ code: 400, error_code: "refresh_token_not_found", msg: "no" }, { status: 400 });
      return Response.json(session({ ...who }, Math.floor(Date.now() / 1000) + 3600));
    }
    return new Response("not stubbed", { status: 599 });
  });
}

const FILES: Record<string, string> = {
  "/app/ops/support.js": "/* runtime */",
  "/app/ops/AuthForm.dc.html": "<x-dc>auth form</x-dc>",
  "/app/ops/ops.dc.html": "<x-dc>shell</x-dc>",
  "/app/ops/ops-login.dc.html": "<x-dc>login</x-dc>",
  "/app/ops/OpsDetail.dc.html": "<x-dc>booking detail</x-dc>",
  "/app/ops/OpsSettings.dc.html": "<x-dc>settings</x-dc>",
};

const ETAG = '"x"';

function assets() {
  return {
    fetch: vi.fn(async (request: Request) => {
      const body = FILES[new URL(request.url).pathname];
      if (body === undefined) return new Response("Not Found", { status: 404 });
      const headers = { "content-type": "text/html", "cache-control": "public, max-age=0, must-revalidate", etag: ETAG };
      // The assets binding answers a conditional request itself.
      if (request.headers.get("if-none-match") === ETAG) return new Response(null, { status: 304, headers });
      return new Response(body, { status: 200, headers });
    }),
  };
}

function env(a = assets()) {
  return { ASSETS: a, SUPABASE_URL, SUPABASE_ANON_KEY: "anon-test-key" };
}

function get(path: string, cookie?: string, extra?: Record<string, string>, host = DASH): Request {
  const headers = new Headers(extra);
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${host}${path}`, { headers });
}

const ADMIN: Who = { token: "admin", role: "admin" };
const CUSTOMER: Who = { token: "customer" };
const DISPATCHER: Who = { token: "dispatcher", role: "dispatcher" };
const TOTP = [{ id: "f1", status: "verified" as const, factor_type: "totp" }];
const ADMIN_MFA_AAL1: Who = { token: "admin-mfa-aal1", role: "admin", aal: "aal1", factors: TOTP };
const ADMIN_MFA_AAL2: Who = { token: "admin-mfa-aal2", role: "admin", aal: "aal2", amr: ["password", "totp"], factors: TOTP };

async function expectPrivate404(res: Response) {
  const reference = opsAssetNotFound();
  expect(res.status).toBe(404);
  expect(await res.text()).toBe("");
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  for (const name of ["content-security-policy", "x-frame-options", "x-content-type-options", "strict-transport-security"]) {
    expect(res.headers.get(name), name).toBe(reference.headers.get(name));
  }
}

beforeEach(() => {
  users.clear();
  authCalls.length = 0;
  vi.stubGlobal("fetch", authServer());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dashboard screen files: staff only (lib/ops/asset-gate.ts)", () => {
  it("the allow-list is exactly the sign-in page's two files", () => {
    expect([...OPS_LOGIN_ASSETS].sort()).toEqual(["/app/ops/AuthForm.dc.html", "/app/ops/support.js"]);
    expect(Object.isFrozen(OPS_LOGIN_ASSETS)).toBe(true);
    // exact paths: no prefix, case, trailing-slash or dot-segment variant
    for (const near of [
      "/app/ops/AuthForm.dc.html/",
      "/app/ops/authform.dc.html",
      "/app/ops/support.js.map",
      "/app/ops/AuthForm.dc",
      "/app/ops/%41uthForm.dc.html",
      "/app/ops",
    ]) {
      expect(isOpsLoginAsset(new URL(`${DASH}${near}`).pathname), near).toBe(false);
    }
    expect(isOpsLoginAsset(new URL(`${DASH}/app/ops/x/../support.js`).pathname)).toBe(true);
  });

  it("signed out: a screen file is the same private 404 the public host gives; nothing is read", async () => {
    for (const path of [SCREEN, "/app/ops/OpsSettings.dc.html", "/app/ops/ops.dc.html", "/app/ops/ops-login.dc.html", "/app/ops/missing.js", "/app/ops"]) {
      const a = assets();
      const res = await serveGatedOpsAsset(get(path), env(a));
      await expectPrivate404(res);
      expect(a.fetch, path).not.toHaveBeenCalled();
    }
    expect(authCalls).toEqual([]); // no cookie: no call to Supabase Auth at all
    const pub = guardOpsAsset(get(SCREEN, undefined, undefined, "https://vamostaxi.site"));
    expect(pub?.status).toBe(404);
  });

  it("signed out: each allow-listed sign-in file is served (200), with no session check", async () => {
    for (const path of OPS_LOGIN_ASSETS) {
      const a = assets();
      const res = await serveGatedOpsAsset(get(path), env(a));
      expect(res.status, path).toBe(200);
      expect(await res.text()).toBe(FILES[path]);
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
      expect(a.fetch).toHaveBeenCalledTimes(1);
    }
    expect(authCalls).toEqual([]);
  });

  it("admin session (no second factor): the screen file is served, private, no-cache, with the asset's ETag", async () => {
    const a = assets();
    const res = await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(ADMIN)), env(a));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(FILES[SCREEN]);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(res.headers.get("etag")).toBe(ETAG);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(authCalls).toEqual(["/auth/v1/user"]); // one Auth call per gated file, no database
  });

  it("admin session, file missing: a private 404", async () => {
    const res = await serveGatedOpsAsset(get("/app/ops/none.dc.html", vtAuthCookie(ADMIN)), env());
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("a chunked vt-auth.0/.1 admin cookie works the same", async () => {
    const big: Who = { ...ADMIN, token: `admin-${"x".repeat(3000)}` };
    const cookie = vtAuthCookie(big);
    expect(cookie).toContain("vt-auth.0=");
    expect(cookie).toContain("vt-auth.1=");
    const res = await serveGatedOpsAsset(get(SCREEN, cookie), env());
    expect(res.status).toBe(200);
  });

  it("customer session (vt-auth of a non-staff user): 404", async () => {
    await expectPrivate404(await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(CUSTOMER)), env()));
  });

  it("dispatcher session: 404 (the console is admin only, D-16b)", async () => {
    await expectPrivate404(await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(DISPATCHER)), env()));
  });

  it("admin with an authenticator app at aal1: 404, as the dashboard pages send that session to /login for the code", async () => {
    await expectPrivate404(await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(ADMIN_MFA_AAL1)), env()));
    const res = await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(ADMIN_MFA_AAL2)), env());
    expect(res.status).toBe(200);
  });

  it("a cookie the auth server does not accept (forged token, edited role): 404", async () => {
    const cookie = vtAuthCookie(ADMIN);
    users.clear(); // Supabase Auth now answers 401 for that token
    await expectPrivate404(await serveGatedOpsAsset(get(SCREEN, cookie), env()));
    expect(authCalls).toEqual(["/auth/v1/user"]);
  });

  it("a forged x-vamos-dc-asset header gets nothing: signed out 404, admin unchanged", async () => {
    const forged = { "x-vamos-dc-asset": "1" };
    for (const path of [SCREEN, "/app/ops/ops.dc.html", "/app/ops/ops-login.dc.html"]) {
      await expectPrivate404(await serveGatedOpsAsset(get(path, undefined, forged), env()));
      const pub = guardOpsAsset(get(path, undefined, forged, "https://vamostaxi.site"));
      expect(pub?.status).toBe(404);
    }
    await expectPrivate404(await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(CUSTOMER), forged), env()));
  });

  it("expired admin token: refreshed like a dashboard page, and the new cookie rides on the answer", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const res = await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(ADMIN, past)), env());
    expect(res.status).toBe(200);
    expect(authCalls).toEqual(["/auth/v1/token?grant_type=refresh_token", "/auth/v1/user"]);
    const set = res.headers.getSetCookie();
    expect(set.some((c) => /^vt-auth(\.0)?=base64-/.test(c))).toBe(true);
    expect(set.every((c) => /Path=\//.test(c) && /SameSite=Lax/i.test(c) && /Secure/.test(c) && !/Domain=/i.test(c))).toBe(true);
  });

  it("expired customer token: still 404, and the refreshed cookie still rides on the answer", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const res = await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(CUSTOMER, past)), env());
    expect(res.status).toBe(404);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("vt-auth"))).toBe(true);
  });

  it("no Supabase credentials: fail closed (404) without any call", async () => {
    const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    try {
      const res = await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(ADMIN)), {
        ASSETS: assets(),
        SUPABASE_URL: undefined,
        SUPABASE_ANON_KEY: undefined,
      });
      await expectPrivate404(res);
      expect(authCalls).toEqual([]);
    } finally {
      if (saved.url !== undefined) process.env.SUPABASE_URL = saved.url;
      if (saved.key !== undefined) process.env.SUPABASE_ANON_KEY = saved.key;
    }
  });

  it("Supabase Auth unreachable: fail closed (404)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    await expectPrivate404(await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(ADMIN)), env()));
  });
});

describe("screen file caching (U8b): private, no-cache, ETag; the gate still decides every time", () => {
  it("a conditional request from an admin session gets 304 from the assets binding, still private, no-cache", async () => {
    const a = assets();
    const res = await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(ADMIN), { "if-none-match": ETAG }), env(a));
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(res.headers.get("etag")).toBe(ETAG);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(authCalls).toEqual(["/auth/v1/user"]); // the session was checked before the 304
  });

  it("a stored copy never opens the door: signed out, the same conditional request is the private no-store 404", async () => {
    for (const cookie of [undefined, vtAuthCookie(CUSTOMER), vtAuthCookie(DISPATCHER), vtAuthCookie(ADMIN_MFA_AAL1)]) {
      const a = assets();
      const res = await serveGatedOpsAsset(get(SCREEN, cookie, { "if-none-match": ETAG }), env(a));
      await expectPrivate404(res);
      expect(a.fetch).not.toHaveBeenCalled();
    }
  });

  it("only a served file or a 304 may be stored; every 404 stays no-store", async () => {
    expect(gatedAssetCacheControl(200)).toBe("private, no-cache");
    expect(gatedAssetCacheControl(304)).toBe("private, no-cache");
    for (const status of [401, 403, 404, 500]) expect(gatedAssetCacheControl(status), String(status)).toBe("private, no-store");
    const missing = await serveGatedOpsAsset(get("/app/ops/none.dc.html", vtAuthCookie(ADMIN)), env());
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("Supabase Auth that does not answer (U8b): fail closed after the timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a stalled Auth call is the private 404 after CONSOLE_AUTH_TIMEOUT_MS, and nothing is read from the assets binding", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const a = assets();
    const pending = serveGatedOpsAsset(get(SCREEN, vtAuthCookie(ADMIN)), env(a));
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(CONSOLE_AUTH_TIMEOUT_MS - 1);
    expect(settled).toBe(false); // still waiting inside the limit
    await vi.advanceTimersByTimeAsync(1);
    await expectPrivate404(await pending);
    expect(a.fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an Auth answer inside the limit is used as before, and the timer is cleared", async () => {
    vi.useFakeTimers();
    const res = await serveGatedOpsAsset(get(SCREEN, vtAuthCookie(ADMIN)), env());
    expect(res.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });
});
