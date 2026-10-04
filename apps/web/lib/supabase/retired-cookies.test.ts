// Rollback of the 2026-10-04 auth cookie rename: the vt-auth* cookies the renamed build wrote are
// expired, the Supabase default sb-*-auth-token cookies are left alone, and both Worker doors apply it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { authCookieOptions, retiredAuthCookieExpiry, withRetiredAuthCookiesExpired } from "./cookies";

describe("retired vt-auth cookies are expired", () => {
  const jar =
    "vt-auth=a; vt-auth.0=b; vt-auth.1=c; vt-auth-code-verifier=d; vt-auth-flows-code-verifier=e; " +
    "sb-abcdefghijklmnopqrst-auth-token=keep; vt_manage=keep; vamos_qs=keep";

  it("the client is back on the Supabase default name (no name option)", () => {
    expect(authCookieOptions(true)).toEqual({ path: "/", sameSite: "lax", secure: true });
  });

  it("expires every vt-auth name once, Path /, Secure on https, and nothing else", () => {
    const lines = retiredAuthCookieExpiry(`${jar}; vt-auth=a`, true);
    expect(lines.map((l) => l.split("=")[0])).toEqual([
      "vt-auth",
      "vt-auth.0",
      "vt-auth.1",
      "vt-auth-code-verifier",
      "vt-auth-flows-code-verifier",
    ]);
    for (const line of lines) {
      expect(line).toMatch(/=; Path=\/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax$/);
    }
    expect(retiredAuthCookieExpiry("sb-x-auth-token=a; vt_manage=b", true)).toEqual([]);
    expect(retiredAuthCookieExpiry("vt-auth=a", false)[0]).not.toContain("Secure");
  });

  it("the wrapper appends the expiry, keeps the answer, and leaves a clean request untouched", async () => {
    const out = withRetiredAuthCookiesExpired(
      new Request("https://vamostaxi.site/", { headers: { cookie: jar } }),
      new Response("<html>", { headers: { "cache-control": "public, s-maxage=300" } }),
    );
    expect(out.headers.getSetCookie().filter((c) => c.startsWith("vt-auth"))).toHaveLength(5);
    expect(out.headers.get("cache-control")).toBe("private, no-store");
    expect(await out.text()).toBe("<html>");
    const clean = new Response("ok");
    expect(withRetiredAuthCookiesExpired(new Request("https://vamostaxi.site/", { headers: { cookie: "sb-x-auth-token=a" } }), clean)).toBe(clean);
  });
});

describe("worker.ts: both doors go through handleFetch", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../worker.ts"), "utf8");
  it("handleFetch wraps routeFetch; Dashboard.fetch and default.fetch call handleFetch", () => {
    expect(src).toMatch(/return withRetiredAuthCookiesExpired\(request, await routeFetch\(request, env, ctx, surface\)\);/);
    expect(src).toMatch(/return handleFetch\(request, this\.env, this\.ctx, "dashboard"\);/);
    expect(src).toMatch(/return handleFetch\(request, env, ctx, surfaceFromEnv\(env\)\);/);
    expect(src.match(/routeFetch\(/g)).toHaveLength(2);
  });
});
