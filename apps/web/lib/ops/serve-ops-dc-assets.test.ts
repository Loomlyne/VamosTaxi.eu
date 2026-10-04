// apps/web/lib/ops/serve-ops-dc-assets.test.ts
//
// The dashboard documents (/login, /dashboard, /bookings/…) are built from ops-login.dc.html and
// ops.dc.html read straight from the assets binding. Before, middleware fetched them over HTTP
// from its own host with an `x-vamos-dc-asset: 1` header; that self-fetch carried no session (so the
// staff-only /app/ops/* gate would refuse it) and the header was one any client could send.
// The middleware runs for real here; next-intl's router is a pass-through and Supabase Auth's HTTP
// answers are stand-ins.

import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const assetCalls: string[] = [];
const ASSETS = {
  fetch: vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    assetCalls.push(path);
    const body: Record<string, string> = {
      "/app/ops/ops-login.dc.html": "<!doctype html><html><head><title>login</title></head><body>LOGIN-DC</body></html>",
      "/app/ops/ops.dc.html": "<!doctype html><html><head><title>shell</title></head><body>SHELL-DC</body></html>",
    };
    return body[path]
      ? new Response(body[path], { status: 200, headers: { "content-type": "text/html" } })
      : new Response("Not Found", { status: 404 });
  }),
};

vi.mock("next-intl/middleware", () => ({ default: () => () => NextResponse.next() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { ASSETS } }) }));
import middleware from "../../middleware";
import { serveGatedOpsAsset } from "./asset-gate";

const SUPABASE_URL = "https://auth.example.test";
const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const exp = () => Math.floor(Date.now() / 1000) + 3600;
type Person = { name: string; role?: string; aal: "aal1" | "aal2"; totp: boolean };
const tokens = new Map<string, ReturnType<typeof userOf>>();
function userOf(p: Person) {
  const factors = p.totp ? [{ id: "f1", status: "verified", factor_type: "totp" }] : [];
  return { id: `u-${p.name}`, aud: "authenticated", role: "authenticated", email: `${p.name}@example.test`, app_metadata: {}, user_metadata: {}, factors, created_at: "2026-10-01T00:00:00Z" };
}
/** A real-format `vt-auth` cookie for this person; the stand-in auth server accepts its token. */
function cookieOf(p: Person): string {
  const token = [
    b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    b64url(JSON.stringify({ sub: `u-${p.name}`, aud: "authenticated", role: "authenticated", exp: exp(), aal: p.aal, amr: [{ method: "password", timestamp: 1 }], app_metadata: p.role ? { vamos_role: p.role } : {} })),
    b64url(`signature-${p.name}`),
  ].join(".");
  tokens.set(token, userOf(p));
  return `vt-auth=base64-${b64url(JSON.stringify({ access_token: token, token_type: "bearer", expires_in: 3600, expires_at: exp(), refresh_token: `r-${p.name}`, user: userOf(p) }))}`;
}
const ADMIN: Person = { name: "admin", role: "admin", aal: "aal1", totp: false };
const adminCookie = cookieOf(ADMIN);

const httpCalls: string[] = [];
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };

beforeEach(() => {
  assetCalls.length = 0;
  httpCalls.length = 0;
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      httpCalls.push(url);
      if (url === `${SUPABASE_URL}/auth/v1/user`) {
        const auth = (new Headers(init?.headers).get("authorization") ?? "").replace(/^Bearer /, "");
        const user = tokens.get(auth);
        return user ? Response.json(user) : Response.json({ code: 401, msg: "invalid JWT" }, { status: 401 });
      }
      return new Response("unexpected HTTP fetch", { status: 599 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (saved.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = saved.url;
  if (saved.key === undefined) delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = saved.key;
});

function dash(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://dashboard.vamostaxi.site${path}`, { headers: { accept: "text/html", ...headers } });
}

describe("dashboard documents read their DC file from the assets binding", () => {
  it("signed out /login: ops-login.dc.html from ASSETS, no HTTP self-fetch of /app/ops", async () => {
    const res = await middleware(dash("/login"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("LOGIN-DC");
    expect(html).toContain('<base href="/app/ops/">');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(assetCalls).toEqual(["/app/ops/ops-login.dc.html"]);
    expect(httpCalls.filter((u) => u.includes("/app/ops"))).toEqual([]);
    expect(httpCalls).toEqual([]); // signed out: no Supabase call either
  });

  it("admin /dashboard: ops.dc.html from ASSETS; the only HTTP calls are to Supabase Auth", async () => {
    const res = await middleware(dash("/dashboard", { cookie: adminCookie }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("SHELL-DC");
    expect(assetCalls).toEqual(["/app/ops/ops.dc.html"]);
    expect(httpCalls.length).toBeGreaterThan(0);
    expect(httpCalls.every((u) => u.startsWith(`${SUPABASE_URL}/auth/v1/`))).toBe(true);
  });

  it("signed out /dashboard: redirect to /login, the shell is never read", async () => {
    const res = await middleware(dash("/dashboard"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/login");
    expect(assetCalls).toEqual([]);
  });

  it("a forged x-vamos-dc-asset header changes nothing on the documents", async () => {
    const res = await middleware(dash("/dashboard", { "x-vamos-dc-asset": "1" }));
    expect(res.status).toBe(307);
    expect(assetCalls).toEqual([]);
  });

  it("documents and screen files give the same verdict for the same session (one rule)", async () => {
    const people: Array<[string, Person | null, boolean]> = [
      ["signed out", null, false],
      ["admin", ADMIN, true],
      ["customer", { name: "customer", aal: "aal1", totp: false }, false],
      ["dispatcher", { name: "dispatcher", role: "dispatcher", aal: "aal1", totp: false }, false],
      ["admin with app, aal1", { name: "admin-app-1", role: "admin", aal: "aal1", totp: true }, false],
      ["admin with app, aal2", { name: "admin-app-2", role: "admin", aal: "aal2", totp: true }, true],
    ];
    const screen = { fetch: async () => new Response("SCREEN", { status: 200 }) };
    for (const [label, person, inConsole] of people) {
      const cookie: Record<string, string> = person ? { cookie: cookieOf(person) } : {};
      const doc = await middleware(dash("/bookings/VT-1", cookie));
      const file = await serveGatedOpsAsset(
        new Request("https://dashboard.vamostaxi.site/app/ops/OpsDetail.dc.html", { headers: cookie }),
        { ASSETS: screen, SUPABASE_URL, SUPABASE_ANON_KEY: "anon-test-key" },
      );
      expect(doc.status, `${label}: document`).toBe(inConsole ? 200 : 307);
      expect(file.status, `${label}: screen file`).toBe(inConsole ? 200 : 404);
    }
  });

  it("middleware no longer fetches /app/ops over HTTP or sends the old header (source)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../middleware.ts"), "utf8");
    expect(src).not.toContain("x-vamos-dc-asset");
    expect(src).not.toContain("INTERNAL_ASSET_HEADER");
    const serveOpsDc = src.slice(src.indexOf("async function serveOpsDc("), src.indexOf("async function serveDashboardConfirm("));
    expect(serveOpsDc).toContain("env.ASSETS.fetch(");
    expect(serveOpsDc).not.toMatch(/(^|[^.])fetch\(asset/);
  });
});
