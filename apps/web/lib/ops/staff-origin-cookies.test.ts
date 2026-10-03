// Quick 261003 review item 2: the staff check behind the dashboard quote exemption can refresh
// the session, and Supabase rotates the refresh token. The rotated cookies must reach the
// quote response (OpenNext: cookies().set does not attach to a hand-built Response).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const gate = vi.fn();
vi.mock("./session", () => ({ requireStaffClaims: (...a: unknown[]) => gate(...a) }));
vi.mock("../supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../supabase/server")>()),
  createSupabaseServerClient: async () => {
    throw new Error("no request scope in this test");
  },
}));

import { copyAuthCookies, requestHasStaffSession, type AuthCookieSink } from "./staff-origin";

const request = new Request("https://dashboard.vamostaxi.site/api/quote", { method: "POST" });

describe("staff check cookie sink", () => {
  it("hands the sink to the client factory, so a refresh lands in it", async () => {
    gate.mockResolvedValue({ sub: "u" });
    const sink: AuthCookieSink = { cookies: [] };
    const factory = vi.fn(async (_r: Request, s?: AuthCookieSink) => {
      s?.cookies.push({ name: "sb-x-auth-token", value: "rotated", options: { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 400 } });
      return {} as never;
    });
    expect(await requestHasStaffSession(request, factory, sink)).toBe(true);
    expect(factory).toHaveBeenCalledWith(request, sink);
    expect(sink.cookies).toHaveLength(1);
  });

  it("copyAuthCookies appends one Set-Cookie per rotated cookie to the quote response", () => {
    const sink: AuthCookieSink = {
      cookies: [
        { name: "sb-x-auth-token.0", value: "a b", options: { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 400 } },
        { name: "sb-x-auth-token.1", value: "c", options: { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 400 } },
      ],
    };
    const res = copyAuthCookies(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }), sink);
    const set = res.headers.getSetCookie();
    expect(set).toEqual([
      "sb-x-auth-token.0=a%20b; Path=/; Max-Age=400; HttpOnly; Secure; SameSite=Lax",
      "sb-x-auth-token.1=c; Path=/; Max-Age=400; HttpOnly; Secure; SameSite=Lax",
    ]);
  });

  it("an empty sink leaves the response without Set-Cookie", () => {
    const res = copyAuthCookies(new Response("{}"), { cookies: [] });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("the quote route passes a sink and copies it onto every answer it builds", () => {
    const src = readFileSync(join(__dirname, "..", "..", "app/api/quote/route.ts"), "utf8");
    expect(src).toMatch(/requestHasStaffSession\(request, undefined, authCookies\)/);
    expect(src).toMatch(/copyAuthCookies\(refuse\(result\), authCookies\)/);
    expect(src).toMatch(/copyAuthCookies\(quoteResponse\(result\), authCookies\)/);
    expect(src).toMatch(/copyAuthCookies\(errorResponse\("temporarily_unavailable"\), authCookies\)/);
  });
});
