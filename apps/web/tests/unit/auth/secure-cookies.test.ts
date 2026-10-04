// Cause B: auth cookies were sent without Secure.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetHarness, state } from "./harness";

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);

const { createServerSupabaseClient, authSetCookieHeader } = await import("@/lib/supabase/server");
const { updateSession, createSupabaseMiddlewareClient } = await import("@/lib/supabase/middleware");

beforeEach(() => resetHarness());

describe("secure auth cookies", () => {
  it("server client asks for Secure, Lax, path / and no Domain on https", async () => {
    await createServerSupabaseClient(new Request("https://vamostaxi.site/api/auth"));
    expect(state.options?.cookieOptions).toEqual({ path: "/", sameSite: "lax", secure: true });
    expect(state.options?.cookieOptions).not.toHaveProperty("domain");
  });

  it("dashboard host is Secure and host-only too", async () => {
    await createServerSupabaseClient(new Request("https://dashboard.vamostaxi.site/api/auth"));
    expect(state.options?.cookieOptions?.secure).toBe(true);
    expect(state.options?.cookieOptions).not.toHaveProperty("domain");
  });

  it("stays usable on http://localhost", async () => {
    await createServerSupabaseClient(new Request("http://localhost:3000/api/auth"));
    expect(state.options?.cookieOptions?.secure).toBe(false);
  });

  it("middleware clients follow the request protocol", () => {
    updateSession(new NextRequest("https://vamostaxi.site/"), new Response() as never).catch(() => undefined);
    expect(state.options?.cookieOptions?.secure).toBe(true);
    createSupabaseMiddlewareClient(new NextRequest("http://localhost:3000/"));
    expect(state.options?.cookieOptions?.secure).toBe(false);
    createSupabaseMiddlewareClient(new NextRequest("https://dashboard.vamostaxi.site/"));
    expect(state.options?.cookieOptions?.secure).toBe(true);
  });

  it("Set-Cookie header carries Secure when the option is set", () => {
    const header = authSetCookieHeader({
      name: "sb-x-auth-token",
      value: "v",
      options: { path: "/", sameSite: "lax", secure: true, maxAge: 60 },
    });
    expect(header).toContain("; Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).not.toContain("Domain");
  });
});
