// apps/web/lib/abuse/visitor-cookie-middleware.test.ts
//
// Quick 261003 (owner decision B): home (a DC mock page served by middleware) and /checkout (Next)
// both hand a new visitor a signed vamos_qs cookie when VAMOS_QS_SECRET is set, so the verified
// rate-limit bucket applies. Without the secret nothing changes: no Set-Cookie, same cache headers.
// The middleware itself runs here; only the DC asset fetch is answered locally, and next-intl's
// router (an ESM import vitest cannot resolve from node_modules) is a pass-through NextResponse.next().

import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/middleware", () => ({ default: () => () => NextResponse.next() }));
import middleware from "../../middleware";
import { mintVamosQs, verifyVamosQs, VAMOS_QS_COOKIE } from "./vamos-qs";

const SECRET = "test-vamos-qs-secret-not-a-real-credential-02";
const HOME_HTML = "<!doctype html><html><head><title>Vamos</title></head><body>home</body></html>";

function qsCookies(res: Response): string[] {
  const all = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie") ?? ""];
  return all.filter((c) => c.startsWith(`${VAMOS_QS_COOKIE}=`));
}

function valueOf(setCookie: string): string {
  return setCookie.slice(VAMOS_QS_COOKIE.length + 1).split(";")[0] ?? "";
}

function get(path: string, cookie?: string): NextRequest {
  const headers = new Headers({ accept: "text/html" });
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(`https://vamostaxi.site${path}`, { headers });
}

const saved = { qs: process.env.VAMOS_QS_SECRET, site: process.env.TURNSTILE_SITE_KEY };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/app/home/home.html") || url.includes("/app/pages/")) {
        return new Response(HOME_HTML, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("not stubbed", { status: 599 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (saved.qs === undefined) delete process.env.VAMOS_QS_SECRET;
  else process.env.VAMOS_QS_SECRET = saved.qs;
  if (saved.site === undefined) delete process.env.TURNSTILE_SITE_KEY;
  else process.env.TURNSTILE_SITE_KEY = saved.site;
});

describe("vamos_qs on the pages customers open first", () => {
  it("home (DC mock): a new visitor gets a signed cookie with the exact attributes, and the page is private", async () => {
    process.env.VAMOS_QS_SECRET = SECRET;
    const res = await middleware(get("/"));
    const set = qsCookies(res);
    expect(set).toHaveLength(1);
    expect(set[0]).toMatch(/; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=86400$/);
    expect(await verifyVamosQs(SECRET, valueOf(set[0]!))).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.text()).toContain("home");
  });

  it("home: a visitor whose cookie verifies gets no new one and the page keeps its public cache", async () => {
    process.env.VAMOS_QS_SECRET = SECRET;
    const token = await mintVamosQs(SECRET, "00000000-0000-4000-8000-0000000000ee");
    const res = await middleware(get("/", `${VAMOS_QS_COOKIE}=${token}`));
    expect(qsCookies(res)).toHaveLength(0);
    expect(res.headers.get("cache-control")).toMatch(/^public, s-maxage=300/);
  });

  it("home: a forged or unsigned cookie is replaced with a signed one", async () => {
    process.env.VAMOS_QS_SECRET = SECRET;
    const res = await middleware(get("/", `${VAMOS_QS_COOKIE}=00000000-0000-4000-8000-0000000000ff`));
    const set = qsCookies(res);
    expect(set).toHaveLength(1);
    expect(await verifyVamosQs(SECRET, valueOf(set[0]!))).not.toBeNull();
  });

  it("home without VAMOS_QS_SECRET: no cookie and the same public cache as today", async () => {
    delete process.env.VAMOS_QS_SECRET;
    const res = await middleware(get("/"));
    expect(qsCookies(res)).toHaveLength(0);
    expect(res.headers.get("cache-control")).toMatch(/^public, s-maxage=300/);
  });

  it("/checkout (Next page): a new visitor gets the signed cookie; without the secret none", async () => {
    process.env.VAMOS_QS_SECRET = SECRET;
    const withSecret = await middleware(get("/checkout?from=ZRH&to=Zug"));
    const set = qsCookies(withSecret);
    expect(set).toHaveLength(1);
    expect(await verifyVamosQs(SECRET, valueOf(set[0]!))).not.toBeNull();
    expect(withSecret.headers.get("cache-control")).toBe("private, no-store");

    delete process.env.VAMOS_QS_SECRET;
    const without = await middleware(get("/checkout?from=ZRH&to=Zug"));
    expect(qsCookies(without)).toHaveLength(0);
  });

  it("the dashboard host never gets one", async () => {
    process.env.VAMOS_QS_SECRET = SECRET;
    const req = new NextRequest("https://dashboard.vamostaxi.site/sign-in", { headers: { accept: "text/html" } });
    const res = await middleware(req).catch(() => null);
    if (res) expect(qsCookies(res)).toHaveLength(0);
  });
});
