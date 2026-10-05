import { afterEach, describe, expect, it, vi } from "vitest";
import { authSetCookieHeader } from "./server";
import { createRequestSupabaseClient } from "./request";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  authCookiesFrom,
  cookieListFromHeader,
  legacyAuthCookieExpiry,
  withLegacyAuthCookiesExpired,
} from "./cookies";

describe("cookieListFromHeader", () => {
  it("returns every chunk from a Cookie header, including values that contain '='", () => {
    expect(
      cookieListFromHeader(
        "vt-auth.0=base64-eyJ; vt-auth.1=abc==; theme=light",
      ),
    ).toEqual([
      { name: "vt-auth.0", value: "base64-eyJ" },
      { name: "vt-auth.1", value: "abc==" },
      { name: "theme", value: "light" },
    ]);
  });

  it("returns an empty list when the header is missing", () => {
    expect(cookieListFromHeader(null)).toEqual([]);
    expect(cookieListFromHeader("")).toEqual([]);
  });
});

describe("authCookiesFrom", () => {
  it("prefers the request Cookie header over next/headers when the header has cookies", () => {
    expect(
      authCookiesFrom([{ name: "theme", value: "dark" }], "vt-auth.0=aaa; vt-auth.1=bbb"),
    ).toEqual([
      { name: "vt-auth.0", value: "aaa" },
      { name: "vt-auth.1", value: "bbb" },
    ]);
  });

  it("falls back to the cookie store when the request header is empty", () => {
    expect(authCookiesFrom([{ name: "theme", value: "dark" }], null)).toEqual([
      { name: "theme", value: "dark" },
    ]);
  });
});

describe("auth cookie name (owner 2026-10-04: no project ref in the browser)", () => {
  it("every auth client is named vt-auth", () => {
    expect(AUTH_COOKIE_NAME).toBe("vt-auth");
    expect(authCookieOptions(true)).toEqual({ name: "vt-auth", path: "/", sameSite: "lax", secure: true, httpOnly: true });
  });
});

describe("S4: the session cookie is HttpOnly (security report 2026-10-05)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("authCookieOptions sets httpOnly on https and on local http alike", () => {
    expect(authCookieOptions(true).httpOnly).toBe(true);
    expect(authCookieOptions(false).httpOnly).toBe(true);
  });

  it("the route handlers' Set-Cookie writer prints HttpOnly for those options", () => {
    const line = authSetCookieHeader({ name: "vt-auth.0", value: "base64-x", options: { ...authCookieOptions(true), maxAge: 60 } });
    expect(line).toContain("; HttpOnly");
    expect(line).toContain("; Secure");
  });

  it("a real @supabase/ssr write (the PKCE verifier of a sign-in link) carries HttpOnly", async () => {
    // No network: the auth server answers 400 at once. The verifier is stored before the call.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: 400, msg: "stub" }), { status: 400, headers: { "content-type": "application/json" } })),
    );
    const request = new Request("https://vamostaxi.site/api/auth", { method: "POST" });
    const client = createRequestSupabaseClient(request, { url: "https://stub.invalid", anonKey: "anon" });
    expect(client).not.toBeNull();
    await client!.supabase.auth.signInWithOtp({ email: "a@example.com" }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 0));
    const verifier = client!.setCookies.filter((c) => c.startsWith("vt-auth-code-verifier="));
    expect(verifier.length).toBeGreaterThan(0);
    for (const line of verifier) expect(line).toMatch(/;\s*HttpOnly/i);
  });
});

describe("old sb-*-auth-token cookies are expired", () => {
  const old =
    "sb-abcdefghijklmnopqrst-auth-token.0=base64-a; sb-abcdefghijklmnopqrst-auth-token.1=b; " +
    "sb-abcdefghijklmnopqrst-auth-token-code-verifier=v; sb-abcdefghijklmnopqrst-auth-token=c; " +
    "vt-auth=new; vamos_qs=q; sb-other=keep";

  it("expires each old name once, Path /, no Domain, Secure on https", () => {
    const lines = legacyAuthCookieExpiry(`${old}; sb-abcdefghijklmnopqrst-auth-token=c`, true);
    expect(lines.map((l) => l.split("=")[0])).toEqual([
      "sb-abcdefghijklmnopqrst-auth-token.0",
      "sb-abcdefghijklmnopqrst-auth-token.1",
      "sb-abcdefghijklmnopqrst-auth-token-code-verifier",
      "sb-abcdefghijklmnopqrst-auth-token",
    ]);
    for (const line of lines) {
      expect(line).toMatch(/=; Path=\/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax$/);
      expect(line).not.toContain("Domain");
    }
  });

  it("leaves vt-auth and every other cookie alone, and drops Secure on http://localhost", () => {
    expect(legacyAuthCookieExpiry("vt-auth=a; vt-auth.0=b; vt-auth-code-verifier=c; sb-other=d", true)).toEqual([]);
    expect(legacyAuthCookieExpiry("sb-x-auth-token=a", false)[0]).not.toContain("Secure");
    expect(legacyAuthCookieExpiry(null, true)).toEqual([]);
  });

  it("the Worker wrapper appends the expiry and turns a public answer private", async () => {
    const request = new Request("https://vamostaxi.site/", { headers: { cookie: old } });
    const original = new Response("<html>", {
      status: 200,
      headers: { "cache-control": "public, s-maxage=300", "set-cookie": "vamos_qs=q; Path=/" },
    });
    const out = withLegacyAuthCookiesExpired(request, original);
    const set = out.headers.getSetCookie();
    expect(set).toContain("vamos_qs=q; Path=/");
    expect(set.filter((c) => c.startsWith("sb-"))).toHaveLength(4);
    expect(out.headers.get("cache-control")).toBe("private, no-store");
    expect(out.status).toBe(200);
    expect(await out.text()).toBe("<html>");
  });

  it("a request without old cookies gets the very same response", () => {
    const request = new Request("https://vamostaxi.site/", { headers: { cookie: "vt-auth=a" } });
    const original = new Response("ok", { headers: { "cache-control": "public, max-age=60" } });
    expect(withLegacyAuthCookiesExpired(request, original)).toBe(original);
  });

  it("keeps a redirect a redirect", () => {
    const request = new Request("https://dashboard.vamostaxi.site/login", { headers: { cookie: "sb-x-auth-token=a" } });
    const out = withLegacyAuthCookiesExpired(request, new Response(null, { status: 302, headers: { location: "/x" } }));
    expect(out.status).toBe(302);
    expect(out.headers.get("location")).toBe("/x");
    expect(out.headers.getSetCookie()[0]).toMatch(/^sb-x-auth-token=; Path=\/; Max-Age=0/);
  });
});
